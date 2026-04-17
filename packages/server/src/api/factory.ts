import { err, type Result, error as errorFn, none } from "@deessejs/fp";
import { type Plugin, type Middleware, type Router, type Procedure, type SendOptions, type EventRegistry, type HandlerContext } from "../types.js";
import { EventEmitter } from "../events/emitter.js";
import { createPendingEventQueue } from "../events/queue.js";
import { createErrorResult, ServerException } from "../errors/server-error.js";
import { isRouter, isProcedure } from "../router/index.js";
import  { type APIInstance, type TypedAPIInstance, type RequestInfo } from "./types.js";

interface APIInstanceState<Ctx, TRoutes extends Router<Ctx>> {
  router: TRoutes;
  ctx: Ctx;
  plugins: Plugin<Ctx>[];
  globalMiddleware: Middleware<Ctx>[];
  eventEmitter?: EventEmitter<any>;
}

function createRouterProxy<Ctx>(
  router: Router<Ctx>,
  ctx: Ctx,
  globalMiddleware: Middleware<Ctx>[],
  rootRouter: Router<Ctx>,
  eventEmitter: EventEmitter<any> | undefined,
  queue: ReturnType<typeof createPendingEventQueue>,
  path: string[] = []
): any {
  return new Proxy({}, {
    get(target: unknown, prop: string | symbol): unknown {
      if (prop === "then" || prop === "toJSON" || prop === "valueOf" || prop === Symbol.toStringTag) {
        return undefined;
      }
      if (typeof prop !== "string") {
        return none();
      }
      const value = (router as any)[prop];
      if (value === undefined) {
        return none();
      }
      if (isProcedure(value)) {
        const fullPath = [...path, prop].join(".");
        return (args: unknown) => executeRoute(rootRouter, ctx, globalMiddleware, fullPath, args, eventEmitter, queue);
      }
      if (typeof value === "object" && value !== null) {
        return createRouterProxy(value as Router<Ctx>, ctx, globalMiddleware, rootRouter, eventEmitter, queue, [...path, prop]);
      }
      return none();
    },
  });
}
async function executeRoute<Ctx>(
  router: Router<Ctx>,
  ctx: Ctx,
  globalMiddleware: Middleware<Ctx>[],
  route: string,
  args: unknown,
  eventEmitter: EventEmitter<any> | undefined,
  queue: ReturnType<typeof createPendingEventQueue>
): Promise<Result<unknown>> {
  const parts = route.split(".");
  let current: any = router;
  for (let i = 0; i < parts.length - 1; i++) {
    current = current[parts[i]];
    if (!current) {
      return createErrorResult("ROUTE_NOT_FOUND", `Route not found: ${route}`);
    }
  }
  const procedure = current[parts.at(-1)!];
  if (!procedure || !isProcedure(procedure)) {
    return createErrorResult("ROUTE_NOT_FOUND", `Route not found: ${route}`);
  }
  return executeProcedure(procedure, ctx, args, globalMiddleware, eventEmitter, queue, route);
}

function createHandlerContext<Ctx, Events extends EventRegistry>(
  ctx: Ctx,
  queue: ReturnType<typeof createPendingEventQueue>
): HandlerContext<Ctx, Events> {
  const send = (name: keyof Events, data: Events[typeof name]["data"], options?: SendOptions): void => {
    queue.enqueue({
      name: name as string,
      data,
      timestamp: new Date().toISOString(),
      namespace: options?.namespace ?? "default",
      options,
    });
  };

  return {
    ...(ctx as object),
    send,
  } as HandlerContext<Ctx, Events>;
}

async function executeProcedure<Ctx, Args, Output>(
  procedure: Procedure<Ctx, Args, Output>,
  ctx: Ctx,
  args: Args,
  middleware: Middleware<Ctx>[],
  eventEmitter: EventEmitter<any> | undefined,
  queue: ReturnType<typeof createPendingEventQueue>,
  route: string
): Promise<Result<Output>> {
  const handlerCtx = createHandlerContext(ctx, queue);
  const hookedProc = procedure as any;
  if (hookedProc.argsSchema) {
    const parseResult = hookedProc.argsSchema.safeParse(args);
    if (!parseResult.success) {
      const errors = parseResult.error.errors.map((e: any) => `${e.path.join(".")}: ${e.message}`);
      const ValidationError = errorFn({ name: "VALIDATION_ERROR", message: (args: { message: string }) => args.message });
      return err(
        ValidationError({ message: errors.join(", ") })
          .addNotes(`Validation failed for route: ${route}`)
      );
    }
    args = parseResult.data;
  }

  const procedureMiddleware: Middleware<Ctx>[] = hookedProc._middleware || [];
  const allMiddleware: Middleware<Ctx>[] = [...middleware, ...procedureMiddleware];

  try {
    let index = 0;
    const next = async (overrides?: { ctx?: Partial<Ctx> }): Promise<Result<Output>> => {
      const currentCtx = overrides?.ctx ? { ...handlerCtx, ...overrides.ctx } : handlerCtx;

      if (index >= allMiddleware.length) {
        if (hookedProc._hooks?.beforeInvoke) {
          await hookedProc._hooks.beforeInvoke(currentCtx, args);
        }
        try {
          const result = await procedure.handler(currentCtx, args);
          if (hookedProc._hooks?.afterInvoke) {
            await hookedProc._hooks.afterInvoke(currentCtx, args, result);
          }
          if (result.ok && hookedProc._hooks?.onSuccess) {
            await hookedProc._hooks.onSuccess(currentCtx, args, result.value);
          } else if (!result.ok && hookedProc._hooks?.onError) {
            await hookedProc._hooks.onError(currentCtx, args, result.error);
          }
          if (result.ok) {
            await queue.flush(eventEmitter);
          }
          return result;
        } catch (error) {
          if (hookedProc._hooks?.onError) {
            await hookedProc._hooks.onError(currentCtx, args, error);
          }
          const errToReturn = error instanceof Error ? error : new Error(String(error));
          const InternalError = errorFn({ name: "INTERNAL_ERROR", message: (args: { message: string }) => args.message });
          return err(
            InternalError({ message: errToReturn.message })
              .addNotes(`Error in route: ${route}`)
              .from(errorFn({ name: "INTERNAL_ERROR", message: (_: unknown) => errToReturn.message })({ message: errToReturn.message }))
          );
        }
      }
      const mw = allMiddleware[index++];
      return mw.handler(currentCtx, {
        next: (innerOverrides?: { ctx?: Partial<Ctx> }) => next(innerOverrides),
        args,
        meta: {},
      }) as unknown as Result<Output>;
    };
    return await next();
  } catch (error: unknown) {
    queue.clear();
    const errToReturn = error instanceof Error ? error : new Error(String(error));
    if (error instanceof ServerException) {
      const ServerError = errorFn({ name: error.code, message: (args: { message: string }) => args.message });
      return err(
        ServerError({ message: error.message })
          .addNotes(`Route: ${route}`)
          .from(errorFn({ name: error.code, message: (_: unknown) => error.message })({ message: error.message }))
      );
    }
    const UnexpectedError = errorFn({ name: "INTERNAL_ERROR", message: (args: { message: string }) => args.message });
    return err(
      UnexpectedError({ message: errToReturn.message })
        .addNotes(`Unexpected error in route: ${route}`)
        .from(errorFn({ name: "INTERNAL_ERROR", message: (_: unknown) => errToReturn.message })({ message: errToReturn.message }))
    );
  }
}
export function createAPI<Ctx, TRoutes extends Router<Ctx>>(
  config: {
    router: TRoutes;
    context?: Ctx;
    createContext?: (requestInfo?: RequestInfo) => Ctx;
    plugins?: Plugin<Ctx>[];
    middleware?: Middleware<Ctx>[];
    eventEmitter?: EventEmitter<any>;
  }
): TypedAPIInstance<Ctx, TRoutes> {
  const { router, context, createContext, plugins = [], middleware = [], eventEmitter } = config;
  const queue = createPendingEventQueue();

  const contextFactory = createContext ?? ((_requestInfo?: RequestInfo) => context as Ctx);

  const initialCtx = contextFactory();
  const state: APIInstanceState<Ctx, TRoutes> = {
    router,
    ctx: initialCtx,
    plugins,
    globalMiddleware: middleware,
    eventEmitter,
  };

  const routerProxy = createRouterProxy(state.router, state.ctx, state.globalMiddleware, state.router, eventEmitter, queue) as any;
  return new Proxy(state as any, {
    get(target, prop: string | symbol): unknown {
      if (prop === "router") return target.router;
      if (prop === "ctx") return target.ctx;
      if (prop === "plugins") return target.plugins;
      if (prop === "globalMiddleware") return target.globalMiddleware;
      if (prop === "eventEmitter") return target.eventEmitter;
      if (prop === "getEvents") return () => target.eventEmitter?.getEventLog() ?? [];
      return (routerProxy as any)[prop];
    },
  });
}

export function createPublicAPI<Ctx, TRoutes extends Router<Ctx>>(
  api: APIInstance<Ctx, TRoutes>
): APIInstance<Ctx, PublicRouter<TRoutes>> {
  const publicRouter = filterPublicRouter(api.router);
  const createContext = (api as any).createContext;
  return createAPI({
    router: publicRouter as any,
    context: api.ctx,
    createContext: createContext,
    plugins: api.plugins,
    middleware: api.globalMiddleware,
  }) as any;
}

type PublicRouter<TRoutes extends Router<any, any>> = {
  [K in keyof TRoutes as TRoutes[K] extends Procedure<any, any, any>
    ? TRoutes[K] extends { type: "query" | "mutation" }
      ? K
      : never
    : K]: TRoutes[K] extends Router<any, any>
    ? PublicRouter<TRoutes[K]>
    : TRoutes[K];
};

function filterPublicRouter<TRoutes extends Router<any, any>>(router: TRoutes): PublicRouter<TRoutes> {
  const result: any = {};
  for (const key in router) {
    const value = (router as any)[key];
    if (isRouter(value)) {
      result[key] = filterPublicRouter(value);
    } else if (isProcedure(value)) {
      if ((value as any).type === "query" || (value as any).type === "mutation") {
        result[key] = value;
      }
    } else {
      result[key] = value;
    }
  }
  return result;
}
