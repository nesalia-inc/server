import  { type Middleware } from "../types.js";
import  { type QueryWithHooks } from "../query/types.js";
import  { type MutationWithHooks } from "../mutation/builder.js";

/**
 * Apply middleware to a query
 */
export function withQuery<Ctx, Args, Output>(
  query: QueryWithHooks<Ctx, Args, Output>
): QueryWithHooks<Ctx, Args, Output>;

/**
 * Apply middleware to a query
 */
export function withQuery<Ctx, Args, Output>(
  query: QueryWithHooks<Ctx, Args, Output>,
  middleware: Middleware<Ctx>
): QueryWithHooks<Ctx, Args, Output>;

/**
 * Apply middleware to a query using a function transformer (curried form)
 */
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types -- Curried form requires dynamic type inference */
export function withQuery<Ctx>(
  fn: (q: QueryWithHooks<Ctx, any, any>) => QueryWithHooks<Ctx, any, any>
): (query: QueryWithHooks<Ctx, any, any>) => QueryWithHooks<Ctx, any, any>;

export function withQuery(
  queryOrFn: any,
  middlewareOrFn?: any
): any {
  // Curried form: withQuery((q) => q.use(admin))
  if (typeof queryOrFn === "function" && middlewareOrFn === undefined) {
    return queryOrFn;
  }
  // Middleware function transformer: withQuery(query, (q) => q.use(admin))
  if (typeof middlewareOrFn === "function") {
    return middlewareOrFn(queryOrFn);
  }
  // Middleware: withQuery(query, adminMiddleware)
  if (middlewareOrFn) {
    return queryOrFn.use(middlewareOrFn);
  }
  return queryOrFn;
}

/**
 * Apply middleware to a mutation
 */
export function withMutation<Ctx, Args, Output>(
  mutation: MutationWithHooks<Ctx, Args, Output>
): MutationWithHooks<Ctx, Args, Output>;

/**
 * Apply middleware to a mutation
 */
export function withMutation<Ctx, Args, Output>(
  mutation: MutationWithHooks<Ctx, Args, Output>,
  middleware: Middleware<Ctx>
): MutationWithHooks<Ctx, Args, Output>;

/**
 * Apply middleware to a mutation using a function transformer (curried form)
 */
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types -- Curried form requires dynamic type inference */
export function withMutation<Ctx>(
  fn: (m: MutationWithHooks<Ctx, any, any>) => MutationWithHooks<Ctx, any, any>
): (mutation: MutationWithHooks<Ctx, any, any>) => MutationWithHooks<Ctx, any, any>;

export function withMutation(
  mutationOrFn: any,
  middlewareOrFn?: any
): any {
  // Curried form: withMutation((m) => m.use(admin))
  if (typeof mutationOrFn === "function" && middlewareOrFn === undefined) {
    return mutationOrFn;
  }
  // Middleware function transformer: withMutation(mutation, (m) => m.use(admin))
  if (typeof middlewareOrFn === "function") {
    return middlewareOrFn(mutationOrFn);
  }
  // Middleware: withMutation(mutation, adminMiddleware)
  if (middlewareOrFn) {
    return mutationOrFn.use(middlewareOrFn);
  }
  return mutationOrFn;
}
