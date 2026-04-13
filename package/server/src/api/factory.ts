import type { Result } from "@deessejs/fp";
import type { Plugin, Middleware, Router, Procedure, PendingEvent, SendOptions } from "../types.js";
import { EventEmitter } from "../events/emitter.js";
import { createErrorResult } from "../errors/server-error.js";
import { isRouter, isProcedure } from "../router/index.js";
import type { APIInstance } from "./types.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
interface APIInstanceInternal<Ctx, TRoutes extends Router<Ctx>> {
  router: TRoutes;
  ctx: Ctx;
  plugins: Plugin<Ctx>[];
  globalMiddleware: Middleware<Ctx>[];
  eventEmitter?: EventEmitter<any>;
  executeRaw(route: string, args: unknown): Promise<Result<unknown>>;
  execute(route: string, args: unknown): Promise<Result<unknown>>;
}

function createRouterProxy<Ctx>(
  router: Router<Ctx>,
  ctx: Ctx,
  globalMiddleware: Middleware<Ctx>[],
  rootRouter: Router<Ctx>,
  eventEmitter: EventEmitter<any> | undefined,
  pendingEvents: PendingEvent[],
  path: string[] = []
): any {
  return new Proxy({}, {
    get(target: unknown, prop: string | symbol): unknown {
      if (prop === "then" || prop === "toJSON" || prop === "valueOf" || prop === Symbol.toStringTag) {
        return undefined;
      }
      if (typeof prop !== "string") {
        return undefined;
      }
      const value = (router as any)[prop];
      if (value === undefined) {
        return undefined;
      }
      if (isProcedure(value)) {
        const fullPath = [...path, prop].join(".");
        return (args: unknown) => executeRoute(rootRouter, ctx, globalMiddleware, fullPath, args, eventEmitter, pendingEvents);
      }
      if (typeof value === "object" && value !== null) {
        return createRouterProxy(value as Router<Ctx>, ctx, globalMiddleware, rootRouter, eventEmitter, pendingEvents, [...path, prop]);
      }
      return undefined;
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
  pendingEvents: PendingEvent[]
): Promise<Result<unknown>> {
  const parts = route.split(".");
  let current: any = router;
  for (let i = 0; i < parts.length - 1; i++) {
    current = current[parts[i]];
    if (!current) {
      return createErrorResult("ROUTE_NOT_FOUND", `Route not found: ${route}`);
    }
  }
  const procedure = current[parts[parts.length - 1]];
  if (!procedure || !isProcedure(procedure)) {
    return createErrorResult("ROUTE_NOT_FOUND", `Route not found: ${route}`);
  }
  return executeProcedure(procedure, ctx, args, globalMiddleware, eventEmitter, pendingEvents);
}

interface SendFunction {
  (name: string, data: unknown, options?: SendOptions): void;
}

function createHandlerContext<Ctx>(
  ctx: Ctx,
  pendingEvents: PendingEvent[]
): Ctx & { send: SendFunction } {
  const send: SendFunction = (name: string, data: unknown, options?: SendOptions) => {
    pendingEvents.push({
      name,
      data,
      timestamp: new Date().toISOString(),
      namespace: options?.namespace ?? "default",
      options,
    });
  };

  return {
    ...(ctx as object),
    send,
  } as Ctx & { send: SendFunction };
}

async function emitPendingEvents(
  pendingEvents: PendingEvent[],
  eventEmitter: EventEmitter<any> | undefined
): Promise<void> {
  if (!eventEmitter || pendingEvents.length === 0) return;

  for (const event of pendingEvents) {
    await eventEmitter.emit(event.name, event.data, event.namespace);
  }
}

async function executeProcedure<Ctx, Args, Output>(
  procedure: Procedure<Ctx, Args, Output>,
  ctx: Ctx,
  args: Args,
  middleware: Middleware<Ctx>[],
  eventEmitter: EventEmitter<any> | undefined,
  pendingEvents: PendingEvent[]
): Promise<Result<Output>> {
  // Create handler context with send function
  const handlerCtx = createHandlerContext(ctx, pendingEvents);

  try {
    let index = 0;
    const next = async (): Promise<Result<Output>> => {
      if (index >= middleware.length) {
        const hookedProc = procedure as any;
        if (hookedProc._hooks?.beforeInvoke) {
          await hookedProc._hooks.beforeInvoke(handlerCtx, args);
        }
        try {
          const result = await procedure.handler(handlerCtx, args);
          if (hookedProc._hooks?.afterInvoke) {
            await hookedProc._hooks.afterInvoke(handlerCtx, args, result);
          }
          if (result.ok && hookedProc._hooks?.onSuccess) {
            await hookedProc._hooks.onSuccess(handlerCtx, args, result.value);
          } else if (!result.ok && hookedProc._hooks?.onError) {
            await hookedProc._hooks.onError(handlerCtx, args, result.error);
          }
          // Only emit events if handler succeeded
          if (result.ok) {
            await emitPendingEvents(pendingEvents, eventEmitter);
            pendingEvents.length = 0; // Clear pending events after emitting
          }
          return result;
        } catch (error) {
          if (hookedProc._hooks?.onError) {
            await hookedProc._hooks.onError(handlerCtx, args, error);
          }
          throw error;
        }
      }
      const mw = middleware[index++];
      return mw.handler(handlerCtx as any, next as any) as any;
    };
    return await next();
  } catch (error: unknown) {
    // On error, discard pending events (don't emit them)
    pendingEvents.length = 0;
    const errorMessage = error instanceof Error ? error.message : "Internal error";
    return createErrorResult("INTERNAL_ERROR", errorMessage);
  }
}

export function createAPI<Ctx, TRoutes extends Router<Ctx>>(
  config: {
    router: TRoutes;
    context: Ctx;
    plugins?: Plugin<Ctx>[];
    middleware?: Middleware<Ctx>[];
    eventEmitter?: EventEmitter<any>;
  }
): any {
  const { router, context, plugins = [], middleware = [], eventEmitter } = config;
  const pendingEvents: PendingEvent[] = [];

  const executeRawInternal = (route: string, args: unknown): Promise<Result<unknown>> => {
    return executeRoute(router, context, middleware, route, args, eventEmitter, pendingEvents);
  };

  const state: APIInstanceInternal<Ctx, TRoutes> = {
    router,
    ctx: context,
    plugins,
    globalMiddleware: middleware,
    eventEmitter,
    executeRaw: executeRawInternal,
    execute: async (route: string, args: unknown) => executeRawInternal(route, args),
  };

  const routerProxy = createRouterProxy(state.router, state.ctx, state.globalMiddleware, state.router, eventEmitter, pendingEvents) as any;
  return new Proxy(state as any, {
    get(target, prop: string | symbol): unknown {
      if (prop === "router") return target.router;
      if (prop === "ctx") return target.ctx;
      if (prop === "plugins") return target.plugins;
      if (prop === "globalMiddleware") return target.globalMiddleware;
      if (prop === "eventEmitter") return target.eventEmitter;
      if (prop === "execute") return target.execute.bind(target);
      if (prop === "executeRaw") return target.executeRaw.bind(target);
      if (prop === "getEvents") return () => target.eventEmitter?.getEventLog() ?? [];
      return (routerProxy as any)[prop];
    },
  });
}

export function createPublicAPI<Ctx, TRoutes extends Router<Ctx>>(
  api: APIInstance<Ctx, TRoutes>
): APIInstance<Ctx, PublicRouter<TRoutes>> {
  const publicRouter = filterPublicRouter(api.router);
  return createAPI({
    router: publicRouter as any,
    context: api.ctx,
    plugins: api.plugins,
    middleware: api.globalMiddleware,
  }) as any;
}

type PublicRouter<TRoutes extends Router> = {
  [K in keyof TRoutes as TRoutes[K] extends Procedure<any, any, any>
    ? TRoutes[K] extends { type: "query" | "mutation" }
      ? K
      : never
    : K]: TRoutes[K] extends Router
    ? PublicRouter<TRoutes[K]>
    : TRoutes[K];
};

function filterPublicRouter<TRoutes extends Router>(router: TRoutes): PublicRouter<TRoutes> {
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
/* eslint-enable @typescript-eslint/no-explicit-any */
