// @deessejs/drpc - Functional RPC Protocol Implementation

import { ok as coreOk, err as coreErr, Result } from "@deessejs/core"

// =============================================================================
// Core Types
// =============================================================================

export type CacheKey = string | Record<string, unknown>

export interface WithMetadata<T, Keys extends CacheKey[] = CacheKey[]> {
  data: T
  keys?: Keys
  invalidate?: CacheKey[]
  ttl?: number
}

export interface OkOptions<Keys extends CacheKey[] = CacheKey[]> {
  keys?: Keys
  ttl?: number
}

export interface ErrOptions {
  code?: string
  details?: Record<string, unknown>
}

// Result helpers
export function ok<T, Keys extends CacheKey[] = CacheKey[]>(
  value: T,
  options?: OkOptions<Keys>
): Result<T> {
  const result: Result<T> & { keys?: Keys; ttl?: number } = coreOk(value)
  if (options?.keys) result.keys = options.keys
  if (options?.ttl) result.ttl = options.ttl
  return result as Result<T> & { keys?: Keys; ttl?: number }
}

export function err(
  error: { code: string; message: string }
): Result<never> {
  return coreErr(error as any) as Result<never>
}

export function withMetadata<T, Keys extends CacheKey[] = CacheKey[]>(
  value: T,
  metadata: { keys?: Keys; invalidate?: CacheKey[]; ttl?: number }
): T & { keys?: Keys; invalidate?: CacheKey[]; ttl?: number } {
  return {
    ...(value as object),
    keys: metadata.keys,
    invalidate: metadata.invalidate,
    ttl: metadata.ttl,
  } as T & { keys?: Keys; invalidate?: CacheKey[]; ttl?: number }
}

// =============================================================================
// Event System
// =============================================================================

export type EventRegistry = Record<string, Record<string, { data?: unknown; response?: unknown }>>

export type EventHandler<Ctx, Args, EventData> = (
  ctx: Ctx,
  args: Args,
  event: { data: EventData; name: string; namespace: string }
) => void | Promise<void>

export type EventPayload<T = unknown> = {
  name: string
  data: T
  timestamp: string
  namespace: string
  source?: string
}

// Event System Implementation
type EventListener<Ctx = any, Args = unknown, EventData = unknown> = {
  handler: EventHandler<Ctx, Args, EventData>
  namespace: string
}

export function defineEvents<Events extends EventRegistry>(schema: Events) {
  const events: Events = schema

  // Global event listeners registry
  const listeners: Map<string, Set<EventListener>> = new Map()

  function getEventName(path: string[]): string {
    return path.join(".")
  }

  function on<EventName extends string, EventData>(
    eventName: EventName,
    handler: EventHandler<any, any, EventData>
  ): void {
    if (!listeners.has(eventName)) {
      listeners.set(eventName, new Set())
    }
    // Extract namespace from eventName (e.g., "user.created" -> "user")
    const namespace = eventName.split(".")[0]
    listeners.get(eventName)!.add({ handler: handler as EventHandler<any, any, any>, namespace })
  }

  function send<EventData>(
    ctx: { send?: (eventName: string, data: EventData) => void },
    eventName: string,
    data: EventData,
    options?: { source?: string }
  ): void {
    const payload: EventPayload<EventData> = {
      name: eventName,
      data,
      timestamp: new Date().toISOString(),
      namespace: eventName.split(".")[0],
      source: options?.source,
    }

    // Get listeners for this event
    const eventListeners = listeners.get(eventName)
    if (eventListeners) {
      for (const listener of eventListeners) {
        // Call the handler with ctx, args (undefined), and event
        listener.handler(ctx, undefined, {
          data: payload.data,
          name: payload.name,
          namespace: payload.namespace,
        })
      }
    }
  }

  return {
    events,
    on,
    send,
    getEventName,
  }
}

// Context with send method
export type ContextWithSend<Ctx> = Ctx & {
  send: <EventData>(eventName: string, data: EventData) => void
}

// =============================================================================
// Cache Key System
// =============================================================================

export function defineCacheKeys<T extends Record<string, any>>(schema: T) {
  return schema
}

// =============================================================================
// Plugin System
// =============================================================================

export type Plugin<Ctx> = {
  name: string
  extend: (ctx: Ctx) => Partial<Ctx> & Record<string, unknown>
  router?: (t: QueryBuilder<Ctx>) => Record<string, any>
  hooks?: PluginHooks<Ctx>
}

export type PluginHooks<Ctx> = {
  onInvoke?: (ctx: Ctx, args: unknown) => void | Promise<void>
  onSuccess?: (ctx: Ctx, args: unknown, result: unknown) => void | Promise<void>
  onError?: (ctx: Ctx, args: unknown, error: unknown) => void | Promise<void>
}

export interface MergedPluginHooks<Ctx> {
  onInvoke: Array<(ctx: Ctx, args: unknown) => void | Promise<void>>
  onSuccess: Array<(ctx: Ctx, args: unknown, result: unknown) => void | Promise<void>>
  onError: Array<(ctx: Ctx, args: unknown, error: unknown) => void | Promise<void>>
}

export function plugin<Ctx, PluginRouter extends Router = {}>(
  config: {
    name: string
    extend: (ctx: Ctx) => Partial<Ctx>
    router?: (t: QueryBuilder<Ctx>) => PluginRouter
    hooks?: PluginHooks<Ctx>
  }
): Plugin<Ctx> & { router?: (t: QueryBuilder<Ctx>) => PluginRouter } {
  return config as Plugin<Ctx> & { router?: (t: QueryBuilder<Ctx>) => PluginRouter }
}

// =============================================================================
// Middleware System
// =============================================================================

export type Middleware<Ctx, Args = unknown> = {
  name: string
  args?: unknown
  handler: (ctx: Ctx & { args: Args; meta: Record<string, unknown> }, next: () => Promise<Result<any>>) => Promise<Result<any>>
}

// =============================================================================
// Query/Mutation Types
// =============================================================================

export type Query<Ctx, Args = unknown, Output = unknown> = {
  type: "query"
  name?: string
  args?: unknown
  handler: (ctx: Ctx, args: Args) => Promise<Result<Output>>
  middleware?: Middleware<Ctx>[]
  beforeInvoke?: Array<(ctx: Ctx, args: Args) => void | Promise<void>>
  afterInvoke?: Array<(ctx: Ctx, args: Args, result: Result<Output>) => void | Promise<void>>
  onSuccess?: Array<(ctx: Ctx, args: Args, data: Output) => void | Promise<void>>
  onError?: Array<(ctx: Ctx, args: Args, error: unknown) => void | Promise<void>>
}

export type Mutation<Ctx, Args = unknown, Output = unknown> = {
  type: "mutation"
  name?: string
  args?: unknown
  handler: (ctx: Ctx, args: Args) => Promise<Result<Output>>
  middleware?: Middleware<Ctx>[]
  beforeInvoke?: Array<(ctx: Ctx, args: Args) => void | Promise<void>>
  afterInvoke?: Array<(ctx: Ctx, args: Args, result: Result<Output>) => void | Promise<void>>
  onSuccess?: Array<(ctx: Ctx, args: Args, data: Output) => void | Promise<void>>
  onError?: Array<(ctx: Ctx, args: Args, error: unknown) => void | Promise<void>>
}

export type InternalQuery<Ctx, Args = unknown, Output = unknown> = {
  type: "internalQuery"
  name?: string
  args?: unknown
  handler: (ctx: Ctx, args: Args) => Promise<Result<Output>>
  middleware?: Middleware<Ctx>[]
  beforeInvoke?: Array<(ctx: Ctx, args: Args) => void | Promise<void>>
  afterInvoke?: Array<(ctx: Ctx, args: Args, result: Result<Output>) => void | Promise<void>>
  onSuccess?: Array<(ctx: Ctx, args: Args, data: Output) => void | Promise<void>>
  onError?: Array<(ctx: Ctx, args: Args, error: unknown) => void | Promise<void>>
}

export type InternalMutation<Ctx, Args = unknown, Output = unknown> = {
  type: "internalMutation"
  name?: string
  args?: unknown
  handler: (ctx: Ctx, args: Args) => Promise<Result<Output>>
  middleware?: Middleware<Ctx>[]
  beforeInvoke?: Array<(ctx: Ctx, args: Args) => void | Promise<void>>
  afterInvoke?: Array<(ctx: Ctx, args: Args, result: Result<Output>) => void | Promise<void>>
  onSuccess?: Array<(ctx: Ctx, args: Args, data: Output) => void | Promise<void>>
  onError?: Array<(ctx: Ctx, args: Args, error: unknown) => void | Promise<void>>
}

export type Router = Record<string, any>

// =============================================================================
// Query Builder
// =============================================================================

export type QueryBuilder<Ctx> = {
  query<Args, Output>(
    config: QueryConfig<Ctx, Args, Output>
  ): Query<Ctx, Args, Output>

  mutation<Args, Output>(
    config: MutationConfig<Ctx, Args, Output>
  ): Mutation<Ctx, Args, Output>

  internalQuery<Args, Output>(
    config: InternalQueryConfig<Ctx, Args, Output>
  ): InternalQuery<Ctx, Args, Output>

  internalMutation<Args, Output>(
    config: InternalMutationConfig<Ctx, Args, Output>
  ): InternalMutation<Ctx, Args, Output>

  router(routes: Router): Router

  middleware<Args>(
    config: MiddlewareConfig<Ctx, Args>
  ): Middleware<Ctx, Args>

  on<EventName extends string, EventData>(
    event: EventName,
    handler: EventHandler<Ctx, unknown, EventData>
  ): void

  createQuery<Args, Output>(
    config: QueryConfig<Ctx, Args, Output>
  ): Query<Ctx, Args, Output>

  createMutation<Args, Output>(
    config: MutationConfig<Ctx, Args, Output>
  ): Mutation<Ctx, Args, Output>
}

type QueryConfig<Ctx, Args, Output> = {
  args?: unknown
  handler: (ctx: Ctx, args: Args) => Promise<Result<Output>>
  middleware?: Middleware<Ctx> | Middleware<Ctx>[]
}

type MutationConfig<Ctx, Args, Output> = {
  args?: unknown
  handler: (ctx: Ctx, args: Args) => Promise<Result<Output>>
  middleware?: Middleware<Ctx> | Middleware<Ctx>[]
}

type InternalQueryConfig<Ctx, Args, Output> = {
  handler: (ctx: Ctx, args: Args) => Promise<Result<Output>>
  middleware?: Middleware<Ctx> | Middleware<Ctx>[]
}

type InternalMutationConfig<Ctx, Args, Output> = {
  handler: (ctx: Ctx, args: Args) => Promise<Result<Output>>
  middleware?: Middleware<Ctx> | Middleware<Ctx>[]
}

type MiddlewareConfig<Ctx, Args> = {
  name: string
  args?: unknown
  handler: (ctx: Ctx & { args: Args }, next: () => Promise<Result<any>>) => Promise<Result<any>>
}

// =============================================================================
// API Types
// =============================================================================

export type API<Ctx, TRoutes extends Router = Router> = {
  router: TRoutes
  execute<TRoute extends keyof TRoutes>(
    route: TRoute,
    args: any
  ): Promise<Result<any>>
}

export interface APIInstance<Ctx, TRoutes extends Router = Router> {
  router: TRoutes
  ctx: Ctx
  plugins: Array<Plugin<Ctx>>
  globalMiddleware: Middleware<Ctx>[]
  execute<TRoute extends keyof TRoutes>(
    route: TRoute,
    args: any
  ): Promise<Result<any>>
}

// =============================================================================
// QueryBuilder Implementation
// =============================================================================

function createQueryBuilder<Ctx>(options: {
  plugins: Array<Plugin<Ctx>>
  globalMiddleware: Middleware<Ctx>[]
  eventHandlers?: Map<string, Set<EventHandler<Ctx, unknown, any>>>
}): QueryBuilder<Ctx> {
  // Event handlers storage - shared across all builder operations
  const eventHandlers = options.eventHandlers || new Map()

  const queryBuilder: QueryBuilder<Ctx> = {
    query<Args, Output>(config: QueryConfig<Ctx, Args, Output>): Query<Ctx, Args, Output> {
      const middlewareArray = config.middleware
        ? Array.isArray(config.middleware)
          ? config.middleware
          : [config.middleware]
        : []

      return {
        type: "query",
        args: config.args,
        handler: config.handler,
        middleware: [...options.globalMiddleware, ...middlewareArray],
      } as Query<Ctx, Args, Output>
    },

    mutation<Args, Output>(config: MutationConfig<Ctx, Args, Output>): Mutation<Ctx, Args, Output> {
      const middlewareArray = config.middleware
        ? Array.isArray(config.middleware)
          ? config.middleware
          : [config.middleware]
        : []

      return {
        type: "mutation",
        args: config.args,
        handler: config.handler,
        middleware: [...options.globalMiddleware, ...middlewareArray],
      } as Mutation<Ctx, Args, Output>
    },

    internalQuery<Args, Output>(config: InternalQueryConfig<Ctx, Args, Output>): InternalQuery<Ctx, Args, Output> {
      const middlewareArray = config.middleware
        ? Array.isArray(config.middleware)
          ? config.middleware
          : [config.middleware]
        : []

      return {
        type: "internalQuery",
        handler: config.handler,
        middleware: [...options.globalMiddleware, ...middlewareArray],
      } as InternalQuery<Ctx, Args, Output>
    },

    internalMutation<Args, Output>(config: InternalMutationConfig<Ctx, Args, Output>): InternalMutation<Ctx, Args, Output> {
      const middlewareArray = config.middleware
        ? Array.isArray(config.middleware)
          ? config.middleware
          : [config.middleware]
        : []

      return {
        type: "internalMutation",
        handler: config.handler,
        middleware: [...options.globalMiddleware, ...middlewareArray],
      } as InternalMutation<Ctx, Args, Output>
    },

    router(routes: Router): Router {
      return routes
    },

    middleware<Args>(config: MiddlewareConfig<Ctx, Args>): Middleware<Ctx, Args> {
      return {
        name: config.name,
        args: config.args,
        handler: config.handler,
      }
    },

    on<EventName extends string, EventData>(
      event: EventName,
      handler: EventHandler<Ctx, unknown, EventData>
    ): void {
      if (!eventHandlers.has(event)) {
        eventHandlers.set(event, new Set())
      }
      eventHandlers.get(event)!.add(handler as EventHandler<Ctx, unknown, any>)
    },

    createQuery<Args, Output>(config: QueryConfig<Ctx, Args, Output>): Query<Ctx, Args, Output> {
      return queryBuilder.query(config)
    },

    createMutation<Args, Output>(config: MutationConfig<Ctx, Args, Output>): Mutation<Ctx, Args, Output> {
      return queryBuilder.mutation(config)
    },
  }

  return queryBuilder
}

// =============================================================================
// Hook Chain Methods (for Query and Mutation)
// =============================================================================

function withHooks<TOperation extends Query<any, any, any> | Mutation<any, any, any>>(
  operation: TOperation
): TOperation & {
  beforeInvoke: (handler: (ctx: any, args: any) => void | Promise<void>) => TOperation
  afterInvoke: (handler: (ctx: any, args: any, result: Result<any>) => void | Promise<void>) => TOperation
  onSuccess: (handler: (ctx: any, args: any, data: any) => void | Promise<void>) => TOperation
  onError: (handler: (ctx: any, args: any, error: unknown) => void | Promise<void>) => TOperation
} {
  const beforeInvokeStack = operation.beforeInvoke || []
  const afterInvokeStack = operation.afterInvoke || []
  const onSuccessStack = operation.onSuccess || []
  const onErrorStack = operation.onError || []

  return {
    ...operation,
    beforeInvoke: (handler: (ctx: any, args: any) => void | Promise<void>) => {
      beforeInvokeStack.push(handler)
      return withHooks({
        ...operation,
        beforeInvoke: beforeInvokeStack,
      }) as TOperation
    },
    afterInvoke: (handler: (ctx: any, args: any, result: Result<any>) => void | Promise<void>) => {
      afterInvokeStack.push(handler)
      return withHooks({
        ...operation,
        afterInvoke: afterInvokeStack,
      }) as TOperation
    },
    onSuccess: (handler: (ctx: any, args: any, data: any) => void | Promise<void>) => {
      onSuccessStack.push(handler)
      return withHooks({
        ...operation,
        onSuccess: onSuccessStack,
      }) as TOperation
    },
    onError: (handler: (ctx: any, args: any, error: unknown) => void | Promise<void>) => {
      onErrorStack.push(handler)
      return withHooks({
        ...operation,
        onError: onErrorStack,
      }) as TOperation
    },
  }
}

// =============================================================================
// defineContext
// =============================================================================

export function defineContext<Ctx, const Plugins extends Plugin<Ctx>[] = Plugin<Ctx>[]>(
  config: {
    context: Ctx
    plugins?: Plugins
    events?: EventRegistry
  }
): {
  t: QueryBuilder<Ctx>
  createAPI: (apiConfig: { router: Router; middleware?: Middleware<Ctx>[] }) => APIInstance<Ctx>
} {
  const plugins = config.plugins || []
  const globalMiddleware: Middleware<Ctx>[] = []

  // Extend context with plugins
  const extendedContext = { ...config.context } as Ctx & Partial<Ctx>
  for (const plugin of plugins) {
    const extended = plugin.extend(config.context)
    Object.assign(extendedContext, extended)
  }

  const t = createQueryBuilder<Ctx>({ plugins, globalMiddleware })

  // Merge plugin hooks from all plugins
    const mergedPluginHooks: MergedPluginHooks<Ctx> = {
      onInvoke: [],
      onSuccess: [],
      onError: [],
    }
    for (const plugin of plugins) {
      if (plugin.hooks) {
        if (plugin.hooks.onInvoke) mergedPluginHooks.onInvoke.push(plugin.hooks.onInvoke)
        if (plugin.hooks.onSuccess) mergedPluginHooks.onSuccess.push(plugin.hooks.onSuccess)
        if (plugin.hooks.onError) mergedPluginHooks.onError.push(plugin.hooks.onError)
      }
    }

    const createAPI = (apiConfig: { router: Router; middleware?: Middleware<Ctx>[] }) => {
      const allMiddleware = [...globalMiddleware, ...(apiConfig.middleware || [])]

      // Merge plugin routers
      let mergedRouter = { ...apiConfig.router }
      for (const plugin of plugins) {
        if (plugin.router) {
          const pluginRoutes = plugin.router(t)
          mergedRouter = { ...mergedRouter, ...pluginRoutes }
        }
      }

      const api: APIInstance<Ctx> = {
        router: mergedRouter,
        ctx: extendedContext,
        plugins,
        globalMiddleware: allMiddleware,
        async execute(route, args) {
          // Find the operation in the router
          const operation = findOperation(api.router, String(route))
          if (!operation) {
            return err({ code: "NOT_FOUND", message: `Route not found: ${route}` })
          }

          return executeOperation(operation, extendedContext, args, allMiddleware, mergedPluginHooks)
        },
      }

      return api
    }

  return { t, createAPI }
}

// =============================================================================
// createAPI
// =============================================================================

export function createAPI<Ctx, TRoutes extends Router>(
  config: {
    router: TRoutes
    middleware?: Middleware<Ctx>[]
    plugins?: Plugin<Ctx>[]
  }
): APIInstance<Ctx, TRoutes> {
  const { t, createAPI: makeAPI } = defineContext<Ctx, Plugin<Ctx>[]>({
    context: {} as Ctx,
    plugins: config.plugins || [],
  })

  return makeAPI({ router: config.router, middleware: config.middleware }) as APIInstance<Ctx, TRoutes>
}

// =============================================================================
// createPublicAPI
// =============================================================================

export function createPublicAPI<Ctx, TRoutes extends Router>(
  api: APIInstance<Ctx, TRoutes>
): APIInstance<Ctx, TRoutes> {
  // Filter out internal operations from router
  const publicRouter = filterPublicOperations(api.router)

  return {
    ...api,
    router: publicRouter as TRoutes,
  }
}

/**
 * Creates a client-safe API that only exposes public operations (query/mutation).
 * Internal operations (internalQuery/internalMutation) are filtered out.
 * This is the API that should be passed to toNextJsHandler for HTTP exposure.
 *
 * @param api - The full API instance from createAPI
 * @returns A client-safe API with only public operations
 *
 * @example
 * ```typescript
 * const { t, createAPI } = defineContext({ context: { db } })
 *
 * const api = createAPI({
 *   router: t.router({
 *     users: {
 *       get: t.query({ ... }),           // public
 *       create: t.mutation({ ... }),      // public
 *       delete: t.internalMutation({ ... }) // internal - filtered out
 *     }
 *   })
 * })
 *
 * const client = createClient(api)
 * // client.users.get() ✓ works
 * // client.users.create() ✓ works
 * // client.users.delete() ✗ not exposed
 * ```
 */
export function createClient<Ctx, TRoutes extends Router>(
  api: APIInstance<Ctx, TRoutes>
): APIInstance<Ctx, TRoutes> {
  return createPublicAPI(api)
}

// =============================================================================
// createLocalExecutor
// =============================================================================

export function createLocalExecutor<Ctx, TRoutes extends Router>(
  api: APIInstance<Ctx, TRoutes>
) {
  return {
    async execute(route: string, args: any): Promise<Result<any>> {
      return api.execute(route as any, args)
    },

    getEvents(): EventPayload[] {
      return []
    },
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

function findOperation(router: Router, path: string): Query<any, any, any> | Mutation<any, any, any> | InternalQuery<any, any, any> | InternalMutation<any, any, any> | null {
  const parts = path.split(".")
  let current: any = router

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (current[part] === undefined) {
      // Try to find by type marker
      if (i === parts.length - 1) {
        for (const key of Object.keys(current)) {
          const val = current[key]
          if (isOperation(val) && getOperationName(val) === part) {
            return val
          }
        }
      }
      return null
    }
    current = current[part]
  }

  return isOperation(current) ? current : null
}

function isOperation(obj: any): boolean {
  return obj && (obj.type === "query" || obj.type === "mutation" || obj.type === "internalQuery" || obj.type === "internalMutation")
}

function getOperationName(op: Query<any, any, any> | Mutation<any, any, any>): string | undefined {
  return op.name
}

function filterPublicOperations(router: Router): Router {
  const result: Router = {}

  for (const key of Object.keys(router)) {
    const value = router[key]
    if (isOperation(value)) {
      if (value.type !== "internalQuery" && value.type !== "internalMutation") {
        result[key] = value
      }
    } else if (typeof value === "object" && value !== null) {
      const filtered = filterPublicOperations(value)
      if (Object.keys(filtered).length > 0) {
        result[key] = filtered
      }
    }
  }

  return result
}

async function executeOperation<Ctx>(
  operation: Query<Ctx, any, any> | Mutation<Ctx, any, any> | InternalQuery<Ctx, any, any> | InternalMutation<Ctx, any, any>,
  ctx: Ctx,
  args: any,
  globalMiddleware: Middleware<Ctx>[],
  pluginHooks?: MergedPluginHooks<Ctx>
): Promise<Result<any>> {
  try {
    // Run plugin onInvoke hooks
    if (pluginHooks?.onInvoke) {
      for (const hook of pluginHooks.onInvoke) {
        try {
          await hook(ctx, args)
        } catch (e) {
          console.error("Plugin onInvoke hook error:", e)
        }
      }
    }

    // Run operation beforeInvoke hooks
    if (operation.beforeInvoke) {
      for (const hook of operation.beforeInvoke) {
        await hook(ctx, args)
      }
    }

    // Build middleware chain: [...globalMiddleware, ...operationMiddleware]
    // Each middleware receives (ctx, next) and must call next() to continue
    const chain = [...globalMiddleware, ...(operation.middleware || [])]

    // Final handler that executes the actual operation
    const finalHandler = async () => operation.handler(ctx, args)

    // Build the chain by wrapping from end to beginning
    // Each middleware wraps the next, so when called, middleware can intercept
    // and must explicitly call next() to continue the chain
    let next = finalHandler
    for (let i = chain.length - 1; i >= 0; i--) {
      const mw = chain[i]
      const currentNext = next
      next = () => mw.handler({ ...ctx, args, meta: {} } as any, currentNext)
    }

    // Execute the chain starting from the first middleware
    let result: Result<any>
    try {
      result = await next()
    } catch (error) {
      result = err({ code: "INTERNAL_ERROR", message: error instanceof Error ? error.message : String(error) })
    }

    // Run operation afterInvoke hooks (always runs after operation completes)
    if (operation.afterInvoke) {
      for (const hook of operation.afterInvoke) {
        try {
          await hook(ctx, args, result)
        } catch (e) {
          console.error("afterInvoke hook error:", e)
        }
      }
    }

    // Run plugin onSuccess hooks
    if (result.ok && pluginHooks?.onSuccess) {
      for (const hook of pluginHooks.onSuccess) {
        try {
          await hook(ctx, args, result.value)
        } catch (e) {
          console.error("Plugin onSuccess hook error:", e)
        }
      }
    }

    // Run plugin onError hooks
    if (!result.ok && pluginHooks?.onError) {
      for (const hook of pluginHooks.onError) {
        try {
          await hook(ctx, args, result.error)
        } catch (e) {
          console.error("Plugin onError hook error:", e)
        }
      }
    }

    // Run operation onSuccess hooks
    if (result.ok && operation.onSuccess) {
      for (const hook of operation.onSuccess) {
        try {
          await hook(ctx, args, result.value)
        } catch (e) {
          console.error("onSuccess hook error:", e)
        }
      }
    }

    // Run operation onError hooks
    if (!result.ok && operation.onError) {
      for (const hook of operation.onError) {
        try {
          await hook(ctx, args, result.error)
        } catch (e) {
          console.error("onError hook error:", e)
        }
      }
    }

    return result
  } catch (error) {
    // Run plugin onError hooks for unhandled errors
    if (pluginHooks?.onError) {
      for (const hook of pluginHooks.onError) {
        try {
          await hook(ctx, args, error)
        } catch (e) {
          console.error("Plugin onError hook error:", e)
        }
      }
    }

    // Run operation onError hooks for unhandled errors
    if (operation.onError) {
      for (const hook of operation.onError) {
        try {
          await hook(ctx, args, error)
        } catch (e) {
          console.error("onError hook error:", e)
        }
      }
    }

    return err({ code: "INTERNAL_ERROR", message: error instanceof Error ? error.message : String(error) })
  }
}

// =============================================================================
// Re-export core types
// =============================================================================

export type { Result } from "@deessejs/core"
