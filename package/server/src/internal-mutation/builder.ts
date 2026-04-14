import type { ZodType } from "zod";
import type { Result } from "@deessejs/fp";
import type { InternalMutation } from "../types.js";
import type { InternalMutationConfig } from "./types.js";
import type {
  BeforeInvokeHook,
  AfterInvokeHook,
  OnSuccessHook,
  OnErrorHook,
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
  _hooks: {
    beforeInvoke?: BeforeInvokeHook<Ctx, Args>;
    afterInvoke?: AfterInvokeHook<Ctx, Args, Output>;
    onSuccess?: OnSuccessHook<Ctx, Args, Output>;
    onError?: OnErrorHook<Ctx, Args, any>;
  };
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

  return hookedProc;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
