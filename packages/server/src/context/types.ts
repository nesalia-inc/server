import  { type EventRegistry } from "../types.js";
import  { type RequestInfo } from "../api/types.js";

export interface DefineContextConfig<Ctx, Events extends EventRegistry = EventRegistry> {
  context?: Ctx;
  /**
   * Factory function to create context per request.
   * Receives optional RequestInfo (headers, method, url) for per-request context enrichment.
   * Use this for extracting auth user from headers, request-specific data, etc.
   */
  createContext?: (requestInfo?: RequestInfo) => Ctx;
  plugins?: import("../types.js").Plugin<Ctx>[];
  events?: Events;
}
