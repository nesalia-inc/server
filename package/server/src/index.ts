// ============================================
// Main Exports
// ============================================

// Core functions
export { defineContext } from "./context/index.js";
export { createAPI, createPublicAPI } from "./api/index.js";
export { QueryBuilder } from "./query/index.js";

// Re-export types from @deessejs/fp
export type { Result } from "@deessejs/fp";

// Types from types.ts
export type {
  Query,
  Mutation,
  InternalQuery,
  InternalMutation,
  Procedure,
  Router,
  Middleware,
  Plugin,
  BeforeInvokeHook,
  AfterInvokeHook,
  OnSuccessHook,
  OnErrorHook,
  EventRegistry,
  EventPayload,
  SendOptions,
  PendingEvent,
} from "./types.js";

// Events
export { EventEmitter, defineEvents } from "./events/index.js";
export type { EventHandler } from "./events/index.js";
export { event, eventNamespace, eventsNamespace } from "./events/index.js";

// Router helpers
export {
  isRouter,
  isProcedure,
  resolvePath,
  flattenRouter,
  getPublicRoutes,
  getInternalRoutes,
} from "./router/index.js";
export type { RouterConfig, ValidationResult } from "./router/index.js";

// Hooks
export { executeHooks, executeBeforeInvoke } from "./hooks/index.js";

// Procedures
export {
  withMetadata,
  type Metadata,
} from "./procedure/index.js";

// Middleware
export { createMiddleware } from "./middleware/builder.js";
export { withQuery, withMutation } from "./middleware/helpers.js";

// Also re-export the individual config types from their modules for convenience
export type { QueryConfig } from "./query/types.js";
export type { MutationConfig } from "./mutation/types.js";
export type { InternalQueryConfig } from "./internal-query/types.js";
export type { InternalMutationConfig } from "./internal-mutation/types.js";

// API types
export type { RequestInfo } from "./api/types.js";

// Errors
export {
  ok,
  err,
  ServerError,
  ServerException,
  NotFoundException,
  UnauthorizedException,
  ValidationException,
  ErrorCodes,
} from "./errors/index.js";