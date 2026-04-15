import  { type EventRegistry, type Middleware, type Router } from "../types.js";
import { QueryBuilder } from "../query/builder.js";
import { EventEmitter } from "../events/emitter.js";
import { createAPI } from "../api/factory.js";
import  { type TypedAPIInstance } from "../api/types.js";
import  { type DefineContextConfig } from "./types.js";

export function defineContext<
  Ctx,
  Events extends EventRegistry = EventRegistry
>(
  config: DefineContextConfig<Ctx, Events>
): {
  t: QueryBuilder<Ctx, Events>;
  createAPI: (apiConfig: { router: Router<Ctx>; middleware?: Middleware<Ctx>[] }) => TypedAPIInstance<Ctx, Router<Ctx>>;
} {
  const { context, createContext, plugins = [], events } = config;

  // Create event emitter if events are defined
  const eventEmitter = events ? new EventEmitter<Events>(events) : undefined;

  // Initial context for QueryBuilder (used for building queries, not for request handling)
  const initialContext = createContext ? createContext() : context;

  // Create query builder (t)
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const t = new QueryBuilder<Ctx, Events>(initialContext as Ctx, eventEmitter as any);
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // Create createAPI function
  const createAPIFn = (apiConfig: { router: Router<Ctx>; middleware?: Middleware<Ctx>[] }) => {
    return createAPI({
      router: apiConfig.router,
      context,
      createContext,
      plugins,
      middleware: apiConfig.middleware,
      eventEmitter,
    });
  };

  return { t, createAPI: createAPIFn };
}
