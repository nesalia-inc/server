import  { type ZodType } from "zod";
import  { type Result } from "@deessejs/fp";
import  { type InternalMutation, type Middleware } from "../types.js";
import  { type InternalMutationConfig } from "./types.js";
import  {
  type BeforeInvokeHook,
  type AfterInvokeHook,
  type OnSuccessHook,
  type OnErrorHook,
} from "../types.js";

export type InternalMutationWithHooks<Ctx, Args, Output> = InternalMutation<Ctx, Args, Output> &
  HookedProcedureMixin<Ctx, Args, Output>;

export function createInternalMutationWithHooks<Ctx, Args, Output>(
  config: InternalMutationConfig<Ctx, Args, Output>
): InternalMutationWithHooks<Ctx, Args, Output> {
  return createHookedProcedure({
    type: "internalMutation",
    argsSchema: config.args,
    /* eslint-disable @typescript-eslint/no-explicit-any */
    handler: config.handler as any,
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }) as InternalMutationWithHooks<Ctx, Args, Output>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
interface HookedProcedureMixin<Ctx, Args, Output> {
  type: "query" | "mutation" | "internalQuery" | "internalMutation";
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

interface BaseProc<Ctx, Args, Output> {
  type: "query" | "mutation" | "internalQuery" | "internalMutation";
  argsSchema?: ZodType<Args>;
  handler: (ctx: Ctx, args: Args) => Promise<Result<Output>>;
}

function createHookedProcedure<
  Ctx,
  Args,
  Output,
  Proc extends BaseProc<Ctx, Args, Output>,
>(proc: Proc): Proc & HookedProcedureMixin<Ctx, Args, Output> {
  const hookedProc: any = {
    type: proc.type,
    argsSchema: proc.argsSchema,
    handler: proc.handler,
    _hooks: {},
    _middleware: [],
  };

  hookedProc.beforeInvoke = function(hook: BeforeInvokeHook<Ctx, Args>) {
    hookedProc._hooks.beforeInvoke = hook;
    return hookedProc;
  };

  hookedProc.afterInvoke = function(hook: AfterInvokeHook<Ctx, Args, Output>) {
    hookedProc._hooks.afterInvoke = hook;
    return hookedProc;
  };

  hookedProc.onSuccess = function(hook: OnSuccessHook<Ctx, Args, Output>) {
    hookedProc._hooks.onSuccess = hook;
    return hookedProc;
  };

  hookedProc.onError = function(hook: OnErrorHook<Ctx, Args, Output>) {
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
