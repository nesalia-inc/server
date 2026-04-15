import  { type ZodType } from "zod";
import  { type Result } from "@deessejs/fp";
import  { type HandlerContext, type EventRegistry } from "../types.js";

export interface InternalMutationConfig<Ctx, Args, Output, Events extends EventRegistry = EventRegistry> {
  args?: ZodType<Args>;
  handler: (ctx: HandlerContext<Ctx, Events>, args: Args) => Promise<Result<Output>>;
}
