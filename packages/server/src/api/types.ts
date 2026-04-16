import  { type EventEmitter } from "../events/emitter.js";
import  { type Result } from "@deessejs/fp";
import  { type Router, type Procedure } from "../types.js";
/* eslint-disable @typescript-eslint/no-explicit-any */
export type EventEmitterAny = EventEmitter<any>;

// ProcedureProxy - a callable procedure with typed args and output
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type ProcedureProxy<Ctx, Args, Output> = (args: Args) => Promise<Result<Output>>;

// RouterProxy - recursively maps routes to typed proxies
export type RouterProxy<Ctx, Routes extends Router<Ctx, any>> = {
  [K in keyof Routes]: Routes[K] extends Procedure<Ctx, infer Args, infer Output>
    ? ProcedureProxy<Ctx, Args, Output>
    : Routes[K] extends Router<Ctx, any>
      ? RouterProxy<Ctx, Routes[K]>
      : Routes[K];
};

// TypedAPIInstance - the full return type combining APIInstance properties with the router proxy
export type TypedAPIInstance<Ctx, TRoutes extends Router<Ctx, any>> = APIInstance<Ctx, TRoutes> & RouterProxy<Ctx, TRoutes>;

export interface RequestInfo {
  headers?: Record<string, string>;
  method?: string;
  url?: string;
  [key: string]: unknown;
}

export interface APIInstance<Ctx, TRoutes = Router<Ctx, any>> {
  readonly router: TRoutes;
  readonly ctx: Ctx;
  readonly plugins: import("../types.js").Plugin<Ctx>[];
  readonly globalMiddleware: import("../types.js").Middleware<Ctx>[];
  readonly eventEmitter?: EventEmitterAny;

  execute(route: string, args: unknown, requestInfo?: RequestInfo): Promise<import("@deessejs/fp").Result<unknown>>;
  executeRaw(route: string, args: unknown, requestInfo?: RequestInfo): Promise<import("@deessejs/fp").Result<unknown>>;
}

export interface APIConfig<TRoutes extends Router<unknown, any>> {
  router: TRoutes;
  context?: unknown;
  /**
   * Factory function to create context per request.
   * Receives optional RequestInfo (headers, method, url) for per-request context enrichment.
   */
  createContext?: (requestInfo?: RequestInfo) => unknown;
  plugins: import("../types.js").Plugin<unknown>[];
  middleware: import("../types.js").Middleware<unknown>[];
  eventEmitter?: EventEmitterAny;
}
