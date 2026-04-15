import  { type ZodType } from "zod";
import  { type Result } from "@deessejs/fp";
import  { type Query, type HandlerContext, type EventRegistry, type ProcedureType, type Middleware } from "../types.js";
import  { type BeforeInvokeHook, type AfterInvokeHook, type OnSuccessHook, type OnErrorHook } from "../types.js";

export interface QueryConfig<Ctx, Args, Output, Events extends EventRegistry = EventRegistry> {
  args?: ZodType<Args>;
  handler: (ctx: HandlerContext<Ctx, Events>, args: Args) => Promise<Result<Output>>;
}

// HookedProcedureMixin for chainable hooks
// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface HookedProcedureMixin<Ctx, Args, Output = any> {
  type: ProcedureType;
  beforeInvoke(hook: BeforeInvokeHook<Ctx, Args>): this;

  afterInvoke(hook: AfterInvokeHook<Ctx, Args, Output>): this;

  onSuccess(hook: OnSuccessHook<Ctx, Args, Output>): this;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onError(hook: OnErrorHook<Ctx, Args, any>): this;
  use(middleware: Middleware<Ctx>): this;
  _hooks: {
    beforeInvoke?: BeforeInvokeHook<Ctx, Args>;

    afterInvoke?: AfterInvokeHook<Ctx, Args, Output>;

    onSuccess?: OnSuccessHook<Ctx, Args, Output>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError?: OnErrorHook<Ctx, Args, any>;
  };
  _middleware: Middleware<Ctx>[];
}

export type QueryWithHooks<Ctx, Args, Output> = Query<Ctx, Args, Output> &
  HookedProcedureMixin<Ctx, Args, Output>;

export interface MutationConfig<Ctx, Args, Output, Events extends EventRegistry = EventRegistry> {
  args?: ZodType<Args>;
  handler: (ctx: HandlerContext<Ctx, Events>, args: Args) => Promise<Result<Output>>;
}

export interface InternalQueryConfig<Ctx, Output, Events extends EventRegistry = EventRegistry> {
  handler: (ctx: HandlerContext<Ctx, Events>) => Promise<Result<Output>>;
}

export interface InternalMutationConfig<Ctx, Args, Output, Events extends EventRegistry = EventRegistry> {
  args?: ZodType<Args>;
  handler: (ctx: HandlerContext<Ctx, Events>, args: Args) => Promise<Result<Output>>;
}
