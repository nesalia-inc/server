import type { EventEmitter } from "../events/emitter.js";
/* eslint-disable @typescript-eslint/no-explicit-any */
export type EventEmitterAny = EventEmitter<any>;

export interface APIInstance<Ctx, TRoutes = import("../types.js").Router<Ctx>> {
  readonly router: TRoutes;
  readonly ctx: Ctx;
  readonly plugins: import("../types.js").Plugin<Ctx>[];
  readonly globalMiddleware: import("../types.js").Middleware<Ctx>[];
  readonly eventEmitter?: EventEmitterAny;

  execute(route: string, args: unknown): Promise<import("@deessejs/fp").Result<unknown>>;
  executeRaw(route: string, args: unknown): Promise<import("@deessejs/fp").Result<unknown>>;
}

export interface APIConfig<TRoutes extends import("../types.js").Router<unknown>> {
  router: TRoutes;
  context: unknown;
  plugins: import("../types.js").Plugin<unknown>[];
  middleware: import("../types.js").Middleware<unknown>[];
  eventEmitter?: EventEmitterAny;
}
