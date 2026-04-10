import type { ZodType } from "zod";
import type { Result } from "@deessejs/fp";
import type { Query } from "../types.js";
import type { BeforeInvokeHook, AfterInvokeHook, OnSuccessHook, OnErrorHook } from "../types.js";

export interface QueryConfig<Ctx, Args, Output> {
  args?: ZodType<Args>;
  handler: (ctx: Ctx, args: Args) => Promise<Result<Output>>;
}

// HookedProcedureMixin for chainable hooks
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

export type QueryWithHooks<Ctx, Args, Output> = Query<Ctx, Args, Output> &
  HookedProcedureMixin<Ctx, Args>;

export interface MutationConfig<Ctx, Args, Output> {
  args?: ZodType<Args>;
  handler: (ctx: Ctx, args: Args) => Promise<Result<Output>>;
}

export interface InternalQueryConfig<Ctx, Output> {
  handler: (ctx: Ctx) => Promise<Result<Output>>;
}

export interface InternalMutationConfig<Ctx, Args, Output> {
  args?: ZodType<Args>;
  handler: (ctx: Ctx, args: Args) => Promise<Result<Output>>;
}