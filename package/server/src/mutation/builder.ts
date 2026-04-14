import type { ZodType } from "zod";
import type { Result } from "@deessejs/fp";
import type { Mutation } from "../types.js";
import type { MutationConfig } from "./types.js";
import type {
  BeforeInvokeHook,
  AfterInvokeHook,
  OnSuccessHook,
  OnErrorHook,
  ProcedureType,
} from "../types.js";

export type MutationWithHooks<Ctx, Args, Output> = Mutation<Ctx, Args, Output> &
  HookedProcedureMixin<Ctx, Args, Output>;

export function createMutationWithHooks<Ctx, Args, Output>(
  config: MutationConfig<Ctx, Args, Output>
): MutationWithHooks<Ctx, Args, Output> {
  return createHookedProcedure({
    type: "mutation",
    argsSchema: config.args,
    handler: config.handler,
  }) as MutationWithHooks<Ctx, Args, Output>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
interface HookedProcedureMixin<Ctx, Args, Output> {
  type: ProcedureType;
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
  type: ProcedureType;
  argsSchema?: ZodType<Args>;
  handler: (ctx: Ctx, args: Args) => Promise<Result<Output>>;
}

function createHookedProcedure<
  Ctx,
  Args,
  Output,
>(proc: BaseProc<Ctx, Args, Output>): BaseProc<Ctx, Args, Output> & HookedProcedureMixin<Ctx, Args, Output>;
function createHookedProcedure(proc: BaseProc<any, any, any>): any {
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
/* eslint-enable @typescript-eslint/no-explicit-any */
