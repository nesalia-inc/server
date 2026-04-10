import type { Result } from "@deessejs/fp";
import type { Plugin, Middleware, Router, Procedure } from "../types.js";
import { EventEmitter } from "../events/emitter.js";
import { createErrorResult } from "../errors/server-error.js";
import { isRouter, isProcedure } from "../router/index.js";
import type { APIInstance, APIConfig, LocalExecutor } from "./types.js";

// ============================================
// Internal API Instance State
// ============================================

interface APIInstanceInternal<Ctx, TRoutes extends Router<Ctx>> {
  router: TRoutes;
  ctx: Ctx;
  plugins: Plugin<Ctx>[];
  globalMiddleware: Middleware<Ctx>[];
  eventEmitter?: EventEmitter<any>;
  executeRaw(route: string, args: unknown): Promise<Result<unknown>>;
  execute(route: string, args: unknown): Promise<Result<unknown>>;
}

// ============================================
// createRouterProxy - Creates a proxy for direct method access
// ============================================

function createRouterProxy<Ctx>(
  router: Router<Ctx>,
  ctx: Ctx,
  globalMiddleware: Middleware<Ctx>[],
  rootRouter: Router<Ctx>,
  path: string[] = []
): any {
  return new Proxy({}, {
    get(target: any, prop: string | symbol) {
      // Handle special properties that shouldn't be proxied
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
        // Procedure - return function that executes with the full path
        // Use rootRouter to ensure we traverse from the root
        const fullPath = [...path, prop].join(".");
        return (args: unknown) => executeRoute(rootRouter, ctx, globalMiddleware, fullPath, args);
      }

      // Any other object (including intermediate route groups like { get: procedure })
      // is treated as a router - return proxy with updated path, but keep rootRouter
      if (typeof value === "object" && value !== null) {
        return createRouterProxy(value as Router<Ctx>, ctx, globalMiddleware, rootRouter, [...path, prop]);
      }

      return undefined;
    },
  });
}

// ============================================
// executeRoute - Execute a route by path string
// ============================================

async function executeRoute<Ctx>(
  router: Router<Ctx>,
  ctx: Ctx,
  globalMiddleware: Middleware<Ctx>[],
  route: string,
  args: unknown
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

  return executeProcedure(procedure, ctx, args, globalMiddleware);
}

// ============================================
// executeProcedure - Execute a procedure with hooks and middleware
// ============================================

async function executeProcedure<Ctx, Args, Output>(
  procedure: Procedure<Ctx, Args, Output>,
  ctx: Ctx,
  args: Args,
  middleware: Middleware<Ctx>[]
): Promise<Result<Output>> {
  try {
    // Apply middleware chain
    let index = 0;

    const next = async (): Promise<Result<Output>> => {
      if (index >= middleware.length) {
        // Execute the actual handler
        const hookedProc = procedure as any;
        if (hookedProc._hooks?.beforeInvoke) {
          await hookedProc._hooks.beforeInvoke(ctx, args);
        }

        try {
          const result = await procedure.handler(ctx, args);

          if (hookedProc._hooks?.afterInvoke) {
            await hookedProc._hooks.afterInvoke(ctx, args, result);
          }
          if (result.ok && hookedProc._hooks?.onSuccess) {
            await hookedProc._hooks.onSuccess(ctx, args, result.value);
          } else if (!result.ok && hookedProc._hooks?.onError) {
            await hookedProc._hooks.onError(ctx, args, result.error);
          }

          return result;
        } catch (error) {
          if (hookedProc._hooks?.onError) {
            await hookedProc._hooks.onError(ctx, args, error);
          }
          throw error;
        }
      }

      const mw = middleware[index++];
      return mw.handler(ctx as any, next as any) as any;
    };

    return await next();
  } catch (error: any) {
    return createErrorResult("INTERNAL_ERROR", error?.message || "Internal error");
  }
}

// ============================================
// createAPI - Main factory function
// Returns a proxy-wrapped API instance for direct method access
// ============================================

export function createAPI<Ctx, TRoutes extends Router<Ctx>>(
  config: {
    router: TRoutes;
    context: Ctx;
    plugins?: Plugin<Ctx>[];
    middleware?: Middleware<Ctx>[];
    eventEmitter?: EventEmitter<any>;
  }
): APIInstance<Ctx, TRoutes> {
  const { router, context, plugins = [], middleware = [], eventEmitter } = config;

  // Internal state object (will be wrapped in proxy)
  const state: APIInstanceInternal<Ctx, TRoutes> = {
    router,
    ctx: context,
    plugins,
    globalMiddleware: middleware,
    eventEmitter,
    executeRaw: (route: string, args: unknown) => executeRoute(router, context, middleware, route, args),
    execute: async (route: string, args: unknown) => state.executeRaw(route, args),
  };

  // Create the router proxy for direct method access (api.users.list({}))
  // Pass rootRouter to ensure executeRoute traverses from the root
  const routerProxy = createRouterProxy(state.router, state.ctx, state.globalMiddleware, state.router);

  // Return a Proxy that:
  // - For APIInstance properties like "router", "ctx", "execute", returns from state
  // - For route properties like "users", returns router proxy for chaining
  return new Proxy(state as any, {
    get(target, prop: string | symbol) {
      // Return instance properties directly
      if (prop === "router") return target.router;
      if (prop === "ctx") return target.ctx;
      if (prop === "plugins") return target.plugins;
      if (prop === "globalMiddleware") return target.globalMiddleware;
      if (prop === "eventEmitter") return target.eventEmitter;
      if (prop === "execute") return target.execute.bind(target);
      if (prop === "executeRaw") return target.executeRaw.bind(target);

      // For any other property, delegate to the router proxy
      return (routerProxy as any)[prop];
    },
  });
}

// ============================================
// createPublicAPI
// ============================================

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

// ============================================
// ============================================



// ============================================
// createLocalExecutor
// ============================================

export function createLocalExecutor<Ctx>(
  api: APIInstance<Ctx>
): LocalExecutor<Ctx> {
  const events: any[] = [];

  return {
    execute: async (route: string, args: unknown) => {
      return api.executeRaw(route, args);
    },
    getEvents: () => events,
  };
}

// ============================================
// Helper Functions
// ============================================

// Filter router to only include public operations (query and mutation)
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
      // Recurse into nested router
      result[key] = filterPublicRouter(value);
    } else if (isProcedure(value)) {
      // Only include query and mutation
      // value is Procedure here due to isProcedure type guard
      if ((value as any).type === "query" || (value as any).type === "mutation") {
        result[key] = value;
      }
    } else {
      // Pass through anything else
      result[key] = value;
    }
  }

  return result;
}
