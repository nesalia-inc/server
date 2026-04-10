import type { Plugin, EventRegistry, Middleware, Router } from "../types.js";

export interface DefineContextConfig<Ctx, Events extends EventRegistry = EventRegistry> {
  context: Ctx;
  plugins?: Plugin<Ctx>[];
  events?: Events;
}