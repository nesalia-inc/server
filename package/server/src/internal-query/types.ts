import type { Result } from "@deessejs/fp";

export interface InternalQueryConfig<Ctx, Output> {
  handler: (ctx: Ctx) => Promise<Result<Output>>;
}