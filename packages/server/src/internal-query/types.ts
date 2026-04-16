import  { type Result } from "@deessejs/fp";
import  { type HandlerContext, type EventRegistry } from "../types.js";

export interface InternalQueryConfig<Ctx, Output, Events extends EventRegistry = EventRegistry> {
  handler: (ctx: HandlerContext<Ctx, Events>) => Promise<Result<Output>>;
}
