import type { Result } from "@deessejs/fp";
import type { InternalQuery } from "../types.js";
import type { InternalQueryConfig } from "./types.js";
import type {
  BeforeInvokeHook,
  AfterInvokeHook,
  OnSuccessHook,
  OnErrorHook,
} from "../types.js";

export type InternalQueryWithHooks<Ctx, Output> = InternalQuery<Ctx, void, Output> &
  HookedProcedureMixin<Ctx, void, Output>;

/* eslint-disable @typescript-eslint/no-explicit-any */
export function createInternalQueryWithHooks<Ctx, Output>(
  config: InternalQueryConfig<Ctx, Output>
): InternalQueryWithHooks<Ctx, Output> {
  return createHookedProcedure({
    type: "internalQuery",
    handler: config.handler as any,
  }) as InternalQueryWithHooks<Ctx, Output>;
}

interface HookedProcedureMixin<Ctx, Args, Output> {
  type: "query" | "mutation" | "internalQuery" | "internalMutation";
  beforeInvoke(hook: BeforeInvokeHook<Ctx, Args>): this;
  afterInvoke(hook: AfterInvokeHook<Ctx, Args, Output>): this;
  onSuccess(hook: OnSuccessHook<Ctx, Args, Output>): this;
  onError(hook: OnErrorHook<Ctx, Args, any>): this;
  _hooks: {
    beforeInvoke?: BeforeInvokeHook<Ctx, Args>;
    afterInvoke?: AfterInvokeHook<Ctx, Args, Output>;
    onSuccess?: OnSuccessHook<Ctx, Args, Output>;
    onError?: OnErrorHook<Ctx, Args, any>;
  };
}

interface BaseProc<Ctx, Args, Output> {
  type: "query" | "mutation" | "internalQuery" | "internalMutation";
  argsSchema?: any;
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

  hookedProc.onError = function(hook: OnErrorHook<Ctx, Args, any>) {
    hookedProc._hooks.onError = hook;
    return hookedProc;
  };

  return hookedProc;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
