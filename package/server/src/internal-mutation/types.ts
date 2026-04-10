import type { ZodType } from "zod";
import type { Result } from "@deessejs/fp";

export interface InternalMutationConfig<Ctx, Args, Output> {
  args?: ZodType<Args>;
  handler: (ctx: Ctx, args: Args) => Promise<Result<Output>>;
}