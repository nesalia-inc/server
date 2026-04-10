import type { Result } from "@deessejs/fp";
import type { InternalMutation } from "../types.js";
import type { InternalMutationConfig } from "./types.js";
import type {
  BeforeInvokeHook,
  AfterInvokeHook,
  OnSuccessHook,
  OnErrorHook,
} from "../types.js";

interface HookedProcedureMixin<Ctx, Args> {
  beforeInvoke(hook: BeforeInvokeHook<Ctx, Args>): this;
  afterInvoke(hook: AfterInvokeHook<Ctx, Args, any>): this;
  onSuccess(hook: OnSuccessHook<Ctx, Args, any>): this;
  onError(hook: OnErrorHook<Ctx, Args, any>): this;
  _hooks: {
    beforeInvoke?: BeforeInvokeHook<Ctx, Args>;
    afterInvoke?: AfterInvokeHook<Ctx, Args, any>;
    onSuccess?: OnSuccessHook<Ctx, Args, any>;
    onError?: OnErrorHook<Ctx, Args, any>;
  };
}

export type InternalMutationWithHooks<Ctx, Args, Output> = InternalMutation<Ctx, Args, Output> &
  HookedProcedureMixin<Ctx, Args>;

export function createInternalMutationWithHooks<Ctx, Args, Output>(
  config: InternalMutationConfig<Ctx, Args, Output>
): InternalMutationWithHooks<Ctx, Args, Output> {
  return createHookedProcedure({
    type: "internalMutation",
    argsSchema: config.args,
    handler: config.handler,
  }) as InternalMutationWithHooks<Ctx, Args, Output>;
}

// ============================================
// Hooked Procedure Creator
// ============================================

interface BaseProc {
  type: "query" | "mutation" | "internalQuery" | "internalMutation";
  argsSchema?: any;
  handler: (ctx: any, args: any) => Promise<Result<any>>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createHookedProcedure<Proc extends BaseProc>(proc: Proc): Proc & HookedProcedureMixin<any, any> {
  const hookedProc: any = {
    type: proc.type,
    argsSchema: proc.argsSchema,
    handler: proc.handler,
    _hooks: {},
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

  return hookedProc;
}