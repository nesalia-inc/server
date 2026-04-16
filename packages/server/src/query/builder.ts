import  { type ZodType } from "zod";
import  { type Result } from "@deessejs/fp";
import  {
  type Middleware,
  type Router,
  type BeforeInvokeHook,
  type AfterInvokeHook,
  type OnSuccessHook,
  type OnErrorHook,
  type EventRegistry,
  type EventPayload,
} from "../types.js";
import  { type QueryConfig, type QueryWithHooks } from "./types.js";
import  { type MutationConfig } from "../mutation/types.js";
import  { type MutationWithHooks } from "../mutation/builder.js";
import  { type InternalQueryConfig } from "../internal-query/types.js";
import  { type InternalQueryWithHooks } from "../internal-query/builder.js";
import  { type InternalMutationConfig } from "../internal-mutation/types.js";
import  { type InternalMutationWithHooks } from "../internal-mutation/builder.js";
import  { type EventEmitter } from "../events/emitter.js";

export class QueryBuilder<Ctx, Events extends EventRegistry = EventRegistry> {
  constructor(
    private context: Ctx,
    /* eslint-disable @typescript-eslint/no-explicit-any */
    private eventEmitter?: EventEmitter<any>
    /* eslint-enable @typescript-eslint/no-explicit-any */
  ) {}

  query<Args, Output>(config: QueryConfig<Ctx, Args, Output, Events>): QueryWithHooks<Ctx, Args, Output> {
    return createHookedProcedure({
      type: "query",
      argsSchema: config.args,
      /* eslint-disable @typescript-eslint/no-explicit-any */
      handler: config.handler as any,
      /* eslint-enable @typescript-eslint/no-explicit-any */
    }) as QueryWithHooks<Ctx, Args, Output>;
  }

  mutation<Args, Output>(config: MutationConfig<Ctx, Args, Output, Events>): MutationWithHooks<Ctx, Args, Output> {
    return createHookedProcedure({
      type: "mutation",
      argsSchema: config.args,
      /* eslint-disable @typescript-eslint/no-explicit-any */
      handler: config.handler as any,
      /* eslint-enable @typescript-eslint/no-explicit-any */
    }) as MutationWithHooks<Ctx, Args, Output>;
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  internalQuery<Output>(config: InternalQueryConfig<Ctx, Output, Events>): InternalQueryWithHooks<Ctx, Output> {
    return createHookedProcedure({
      type: "internalQuery",
      handler: config.handler as any,
    }) as InternalQueryWithHooks<Ctx, Output>;
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  internalMutation<Args, Output>(
    config: InternalMutationConfig<Ctx, Args, Output, Events>
  ): InternalMutationWithHooks<Ctx, Args, Output> {
    return createHookedProcedure({
      type: "internalMutation",
      argsSchema: config.args,
      /* eslint-disable @typescript-eslint/no-explicit-any */
      handler: config.handler as any,
      /* eslint-enable @typescript-eslint/no-explicit-any */
    }) as InternalMutationWithHooks<Ctx, Args, Output>;
  }

  router<Routes extends Router<Ctx>>(routes: Routes): Routes {
    return routes;
  }

  middleware<Args>(config: Middleware<Ctx, Args>): Middleware<Ctx, Args> {
    return config;
  }

  on<EventName extends keyof Events>(
    event: EventName,
    handler: (ctx: Ctx, payload: { name: string; data: Events[EventName]["data"] }) => void | Promise<void>
  ): () => void {
    if (!this.eventEmitter) {
      return () => {};
    }
    // Wrap the handler to pass context (this.context) as the first argument
    const wrappedHandler = (payload: EventPayload<Events[EventName]["data"]>) => {
      return handler(this.context, payload);
    };
    return this.eventEmitter.on(event, wrappedHandler);
  }
}

export type { QueryWithHooks } from "./types.js";
export type { MutationWithHooks } from "../mutation/builder.js";
export type { InternalQueryWithHooks } from "../internal-query/builder.js";
export type { InternalMutationWithHooks } from "../internal-mutation/builder.js";

export function createQueryBuilder<Ctx, Events extends EventRegistry = EventRegistry>(
  context: Ctx,
  /* eslint-disable @typescript-eslint/no-explicit-any */
  eventEmitter?: EventEmitter<any>
  /* eslint-enable @typescript-eslint/no-explicit-any */
): QueryBuilder<Ctx, Events> {
  return new QueryBuilder<Ctx, Events>(context, eventEmitter);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
interface HookedProcedureMixin<Ctx, Args, Output> {
  beforeInvoke(hook: BeforeInvokeHook<Ctx, Args>): this;
  afterInvoke(hook: AfterInvokeHook<Ctx, Args, Output>): this;
  onSuccess(hook: OnSuccessHook<Ctx, Args, Output>): this;
  onError(hook: OnErrorHook<Ctx, Args, any>): this;
  use(middleware: Middleware<Ctx>): this;
  _hooks: {
    beforeInvoke?: BeforeInvokeHook<Ctx, Args>;
    afterInvoke?: AfterInvokeHook<Ctx, Args, Output>;
    onSuccess?: OnSuccessHook<Ctx, Args, Output>;
    onError?: OnErrorHook<Ctx, Args, any>;
  };
  _middleware: Middleware<Ctx>[];
}

interface BaseProc<Ctx = any, Args = any, Output = any> {
  type: "query" | "mutation" | "internalQuery" | "internalMutation";
  argsSchema?: ZodType<Args>;
  handler: (ctx: Ctx, args: Args) => Promise<Result<Output>>;
}

function createHookedProcedure<Ctx, Args, Output>(
  proc: BaseProc<Ctx, Args, Output>
): BaseProc<Ctx, Args, Output> & HookedProcedureMixin<Ctx, Args, Output> {
  const hookedProc: any = {
    type: proc.type,
    argsSchema: proc.argsSchema,
    handler: proc.handler,
    _hooks: {},
    _middleware: [],
  };

  hookedProc.beforeInvoke = function(hook: BeforeInvokeHook<any, any>) {
    hookedProc._hooks.beforeInvoke = hook;
    return hookedProc;
  };

  hookedProc.afterInvoke = function(hook: AfterInvokeHook<any, any, any>) {
    hookedProc._hooks.afterInvoke = hook;
    return hookedProc;
  };

  hookedProc.onSuccess = function(hook: OnSuccessHook<any, any, any>) {
    hookedProc._hooks.onSuccess = hook;
    return hookedProc;
  };

  hookedProc.onError = function(hook: OnErrorHook<any, any, any>) {
    hookedProc._hooks.onError = hook;
    return hookedProc;
  };

  hookedProc.use = function(middleware: Middleware<any>) {
    const newProc: any = {
      type: hookedProc.type,
      argsSchema: hookedProc.argsSchema,
      handler: hookedProc.handler,
      _hooks: { ...hookedProc._hooks },
      _middleware: [...hookedProc._middleware, middleware],
    };

    newProc.beforeInvoke = function(hook: BeforeInvokeHook<any, any>) {
      newProc._hooks.beforeInvoke = hook;
      return newProc;
    };

    newProc.afterInvoke = function(hook: AfterInvokeHook<any, any, any>) {
      newProc._hooks.afterInvoke = hook;
      return newProc;
    };

    newProc.onSuccess = function(hook: OnSuccessHook<any, any, any>) {
      newProc._hooks.onSuccess = hook;
      return newProc;
    };

    newProc.onError = function(hook: OnErrorHook<any, any, any>) {
      newProc._hooks.onError = hook;
      return newProc;
    };

    newProc.use = function(mw: Middleware<any>) {
      const result: any = {
        type: newProc.type,
        argsSchema: newProc.argsSchema,
        handler: newProc.handler,
        _hooks: { ...newProc._hooks },
        _middleware: [...newProc._middleware, mw],
      };

      result.beforeInvoke = function(hook: BeforeInvokeHook<any, any>) {
        result._hooks.beforeInvoke = hook;
        return result;
      };

      result.afterInvoke = function(hook: AfterInvokeHook<any, any, any>) {
        result._hooks.afterInvoke = hook;
        return result;
      };

      result.onSuccess = function(hook: OnSuccessHook<any, any, any>) {
        result._hooks.onSuccess = hook;
        return result;
      };

      result.onError = function(hook: OnErrorHook<any, any, any>) {
        result._hooks.onError = hook;
        return result;
      };

      result.use = newProc.use;
      return result;
    };

    return newProc;
  };

  return hookedProc;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
