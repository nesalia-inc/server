import type { ZodType } from "zod";
import type { Result } from "@deessejs/fp";

// Re-export Result type from @deessejs/fp
export type { Result } from "@deessejs/fp";

// ============================================
// Procedure Types
// ============================================

export type ProcedureType = "query" | "mutation" | "internalQuery" | "internalMutation";

export interface BaseProcedure<Ctx, Args, Output> {
  readonly type: ProcedureType;
  readonly argsSchema?: ZodType<Args>;
  readonly handler: (ctx: Ctx, args: Args) => Promise<Result<Output>>;
  readonly name?: string;
}

export interface Query<Ctx, Args, Output> extends BaseProcedure<Ctx, Args, Output> {
  readonly type: "query";
}

export interface Mutation<Ctx, Args, Output> extends BaseProcedure<Ctx, Args, Output> {
  readonly type: "mutation";
}

export interface InternalQuery<Ctx, Args, Output> extends BaseProcedure<Ctx, Args, Output> {
  readonly type: "internalQuery";
}

export interface InternalMutation<Ctx, Args, Output> extends BaseProcedure<Ctx, Args, Output> {
  readonly type: "internalMutation";
}

// ============================================
// Hooks
// ============================================

export type BeforeInvokeHook<Ctx, Args> = (ctx: Ctx, args: Args) => void | Promise<void>;

export type AfterInvokeHook<Ctx, Args, Output> = (
  ctx: Ctx,
  args: Args,
  result: Result<Output>
) => void | Promise<void>;

export type OnSuccessHook<Ctx, Args, Output> = (ctx: Ctx, args: Args, data: Output) => void | Promise<void>;

export type OnErrorHook<Ctx, Args, Error> = (ctx: Ctx, args: Args, error: Error) => void | Promise<void>;

// ============================================
// Middleware
// ============================================

export interface Middleware<Ctx, Args = unknown> {
  readonly name: string;
  readonly args?: Args;
  readonly handler: (
    ctx: Ctx & { args: Args; meta: Record<string, unknown> },
    next: () => Promise<Result<unknown>>
  ) => Promise<Result<unknown>>;
}

// ============================================
// Plugin
// ============================================

export interface Plugin<Ctx> {
  readonly name: string;
  readonly extend: (ctx: Ctx) => Partial<Ctx>;
}

// ============================================
// Router
// ============================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Router<Ctx = any, Routes = Record<string, any>> = Routes & {
  [key: string]: Router<Ctx> | Procedure<Ctx, any, any>;
};

export type Procedure<Ctx, Args, Output> =
  | Query<Ctx, Args, Output>
  | Mutation<Ctx, Args, Output>
  | InternalQuery<Ctx, Args, Output>
  | InternalMutation<Ctx, Args, Output>;

// ============================================
// Events
// ============================================

export interface EventRegistry {
  [eventName: string]: {
    data?: unknown;
    response?: unknown;
  };
}

export interface EventPayload {
  name: string;
  data: unknown;
}

// ============================================
// Context Types
// ============================================

export interface ContextWithSend<Ctx, Events extends EventRegistry> {
  ctx: Ctx;
  send: <EventName extends keyof Events>(
    event: EventName,
    data: Events[EventName]["data"]
  ) => void;
}