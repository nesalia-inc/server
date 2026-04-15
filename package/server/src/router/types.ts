import { type ZodType } from "zod";
import { type Result } from "@deessejs/fp";

export type { Result } from "@deessejs/fp";

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

export type BeforeInvokeHook<Ctx, Args> = (ctx: Ctx, args: Args) => void | Promise<void>;

export type AfterInvokeHook<Ctx, Args, Output> = (
  ctx: Ctx,
  args: Args,
  result: Result<Output>
) => void | Promise<void>;

export type OnSuccessHook<Ctx, Args, Output> = (ctx: Ctx, args: Args, data: Output) => void | Promise<void>;

export type OnErrorHook<Ctx, Args, Error> = (ctx: Ctx, args: Args, error: Error) => void | Promise<void>;

export interface Middleware<Ctx, Args = unknown> {
  readonly name: string;
  readonly args?: Args;
  readonly handler: (
    ctx: Ctx,
    opts: {
      next: (overrides?: { ctx?: Partial<Ctx> }) => Promise<Result<unknown>>;
      args: Args;
      meta: Record<string, unknown>;
    }
  ) => Promise<Result<unknown>>;
}

export interface Plugin<Ctx> {
  readonly name: string;
  readonly extend: (ctx: Ctx) => Partial<Ctx>;
}

export type Router<Ctx = unknown, Routes extends Record<string, unknown> = Record<string, unknown>> = {
  /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
  [K in keyof Routes & string]: Routes[K] extends Procedure<Ctx, infer _Args, infer _Output>
    ? Routes[K]
    : Routes[K] extends Record<string, unknown>
      ? Router<Ctx, Routes[K]>
      : never;
};

export type Procedure<Ctx, Args, Output> =
  | Query<Ctx, Args, Output>
  | Mutation<Ctx, Args, Output>
  | InternalQuery<Ctx, Args, Output>
  | InternalMutation<Ctx, Args, Output>;

export interface EventRegistry {
  [eventName: string]: {
    data?: unknown;
    response?: unknown;
  };
}

export interface EventPayload<T = unknown> {
  name: string;
  data: T;
  timestamp: string;
  namespace: string;
  source?: string;
}

export interface SendOptions {
  namespace?: string;
  broadcast?: boolean;
  delay?: number;
}

export interface PendingEvent {
  name: string;
  data: unknown;
  timestamp: string;
  namespace: string;
  options?: SendOptions;
}

export interface ContextWithSend<Ctx, Events extends EventRegistry> {
  ctx: Ctx;
  send: <EventName extends keyof Events>(
    event: EventName,
    data: Events[EventName]["data"]
  ) => void;
}

export type HandlerContext<Ctx, Events extends EventRegistry> = Ctx & {
  send: <EventName extends keyof Events>(
    event: EventName,
    data: Events[EventName]["data"]
  ) => void;
};

export type RouterConfig<Ctx> = Record<string, Procedure<Ctx, unknown, unknown> | Record<string, unknown>>;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}
