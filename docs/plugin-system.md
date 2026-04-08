# Comprehensive Plugin System Design for @deessejs/server

## Executive Summary

The current plugin system in `@deessejs/server` is minimal, supporting only context extension via `extend()` and basic lifecycle hooks (`onInvoke`, `onSuccess`, `onError`). This design document proposes a comprehensive plugin architecture that enables plugins to contribute queries, mutations, events, middleware, and lifecycle hooks while maintaining type safety, namespace isolation, and composition capabilities. Additionally, this document introduces **Configurable Plugins** - plugins that accept arguments at initialization time, enabling reusable, customizable plugin components.

---

## 1. Current State Analysis

### Existing Plugin Type

```typescript
type Plugin<Ctx> = {
  name: string
  extend: (ctx: Ctx) => Partial<Ctx>
  router?: (t: QueryBuilder<Ctx>) => Record<string, any>
  hooks?: PluginHooks<Ctx>
}
```

### Current Limitations

1. No type-safe namespace isolation - plugin operations could conflict with base router operations
2. Plugin router contributions are untyped - no TypeScript inference for plugin-contributed queries/mutations
3. No event system integration beyond basic hooks
4. No middleware scoping - all middleware is global
5. No clear composition pattern for multiple plugins
6. Plugin context extension happens at initialization, not per-request
7. **No support for configurable plugins** - plugins cannot accept initialization arguments

---

## 2. Plugin API Design

### Core `plugin()` Function

```typescript
// Type definitions for comprehensive plugin system

export type Plugin<Ctx, PluginCtx extends Ctx = Ctx> = {
  name: string
  // Context extension - can add new properties or narrow existing ones
  extend?: (ctx: Ctx) => PluginCtx
  // Plugin-scoped context (returned by extend)
  context?: PluginCtx
  // Queries contributed by this plugin
  queries?: PluginQueries<PluginCtx>
  // Mutations contributed by this plugin
  mutations?: PluginMutations<PluginCtx>
  // Events this plugin can emit
  events?: PluginEvents
  // Plugin-specific middleware
  middleware?: PluginMiddleware<PluginCtx>[]
  // Lifecycle hooks specific to this plugin
  hooks?: PluginHooks<PluginCtx>
  // Dependencies on other plugins
  dependsOn?: string[]
}
```

### Query/Mutation Definitions

```typescript
export type PluginQueries<Ctx> = Record<string, QueryDefinition<Ctx>>
export type PluginMutations<Ctx> = Record<string, MutationDefinition<Ctx>>

export type QueryDefinition<Ctx, Args = unknown, Output = unknown> = {
  args?: unknown
  handler: (ctx: Ctx, args: Args) => Promise<Result<Output>>
  middleware?: Middleware<Ctx>[]
}

export type MutationDefinition<Ctx, Args = unknown, Output = unknown> = {
  args?: unknown
  handler: (ctx: Ctx, args: Args) => Promise<Result<Output>>
  middleware?: Middleware<Ctx>[]
}
```

### Event System

```typescript
export type PluginEvents = Record<
  string,
  {
    data?: unknown
    handler: EventHandler
  }
>

export type EventHandler<Ctx = any, EventData = unknown> = (
  ctx: Ctx,
  event: {
    name: string
    data: EventData
    timestamp: string
    namespace: string
  }
) => void | Promise<void>
```

### Middleware

```typescript
export type PluginMiddleware<Ctx> = {
  name: string
  // Scope: which operations this middleware applies to
  scope?: 'all' | 'queries' | 'mutations' | string[]
  handler: MiddlewareHandler<Ctx>
}

export type MiddlewareHandler<Ctx> = (
  ctx: Ctx & { args: unknown; meta: Record<string, unknown> },
  next: () => Promise<Result<unknown>>
) => Promise<Result<unknown>>
```

### Lifecycle Hooks

```typescript
export type PluginHooks<Ctx> = {
  onInit?: (ctx: Ctx) => void | Promise<void>
  onBeforeInvoke?: (ctx: Ctx, args: unknown, operation: OperationName) => void | Promise<void>
  onAfterInvoke?: (ctx: Ctx, args: unknown, result: Result<unknown>, operation: OperationName) => void | Promise<void>
  onSuccess?: (ctx: Ctx, args: unknown, data: unknown, operation: OperationName) => void | Promise<void>
  onError?: (ctx: Ctx, args: unknown, error: unknown, operation: OperationName) => void | Promise<void>
  onDispose?: (ctx: Ctx) => void | Promise<void>
}

type OperationName = { namespace: string; name: string }
```

---

## 3. Configurable Plugins

### Overview

Configurable plugins extend the base plugin system with a `config` property that accepts a Zod schema for defining plugin initialization arguments. This enables:

- **Reusable plugins** with different configurations
- **Type-safe config resolution** at plugin registration time
- **Validation** of user-provided arguments
- **Default values** for optional fields
- **Nested config objects** for complex configurations

### Plugin Config Type Definition

```typescript
import { z, ZodSchema } from 'zod'

/**
 * Plugin configuration definition
 * - schema: Zod schema for validation
 * - defaults: Optional default values
 */
export type PluginConfigDefinition<Config extends Record<string, any> = any> = {
  schema: ZodSchema<Config>
  defaults?: Partial<Config>
}

/**
 * Resolved plugin config - available at registration time
 */
export type ResolvedPluginConfig<T> = Readonly<T>

/**
 * Configurable plugin factory
 */
export type ConfigurablePlugin<
  Ctx,
  Config extends Record<string, unknown> = Record<string, unknown>,
  PluginCtx extends Ctx = Ctx
> = {
  name: string
  config: PluginConfigDefinition<Config>
  extend: (ctx: Ctx, config: ResolvedPluginConfig<Config>) => PluginCtx
  context?: PluginCtx
  queries?: PluginQueries<PluginCtx>
  mutations?: PluginMutations<PluginCtx>
  events?: PluginEvents
  middleware?: PluginMiddleware<PluginCtx>[]
  hooks?: PluginHooks<PluginCtx>
  dependsOn?: string[]
}

/**
 * Union type for both static and configurable plugins
 */
export type AnyPlugin<Ctx> =
  | StaticPlugin<Ctx>
  | ConfigurablePlugin<Ctx, Record<string, unknown>>
```

### `plugin()` Function Signature

```typescript
/**
 * Create a static plugin (no config)
 */
function plugin<Ctx, PluginCtx extends Ctx>(definition: {
  name: string
  extend: (ctx: Ctx) => PluginCtx
  queries?: PluginQueries<PluginCtx>
  mutations?: PluginMutations<PluginCtx>
  events?: PluginEvents
  middleware?: PluginMiddleware<PluginCtx>[]
  hooks?: PluginHooks<PluginCtx>
  dependsOn?: string[]
}): StaticPlugin<Ctx, PluginCtx>

/**
 * Create a configurable plugin with Zod schema
 */
function plugin<Ctx, Config extends Record<string, unknown>>(
  name: string,
  config: PluginConfigDefinition<Config>,
  definition: {
    extend: (ctx: Ctx, config: Readonly<Config>) => any
    queries?: PluginQueries<any>
    mutations?: PluginMutations<any>
    events?: PluginEvents
    middleware?: PluginMiddleware<any>[]
    hooks?: PluginHooks<any>
    dependsOn?: string[]
  }
): ConfigurablePlugin<Ctx, Config>
```

### `defineContext()` with Configurable Plugins

```typescript
export function defineContext<BaseCtx>() {
  return function configContext<
    Plugins extends AnyPlugin<BaseCtx>[],
    Events extends EventRegistry
  >(config: {
    context: BaseCtx
    plugins?: Plugins
    events?: Events
  }): {
    t: QueryBuilder<BaseCtx>
    createAPI: (apiConfig: {
      router: Router
      middleware?: Middleware<BaseCtx>[]
    }) => APIInstance<BaseCtx, Plugins>
  } {
    // Implementation...
  }
}

// Usage with configurable plugins:
// Plugin without config:
plugins: [authPlugin]

// Plugin with config (pass instance with args):
plugins: [
  authPlugin,
  cachePlugin({ ttl: 3600, prefix: 'users' }),
  loggingPlugin({ level: 'debug', format: 'json' }),
]
```

---

## 4. Plugin Creation Examples

### Auth Plugin (Configurable)

```typescript
// plugins/auth.ts
import { plugin } from '@deessejs/server'
import { z } from 'zod'

const authConfigSchema = z.object({
  sessionMaxAge: z.number().min(1).max(604800).default(86400),
  sessionCookieName: z.string().default('session_id'),
  secureCookies: z.boolean().default(true),
})

type AuthConfig = z.TypeOf<typeof authConfigSchema>

interface AuthContext extends BaseContext {
  userId: string | null
  session: Session | null
  requireAuth: () => Promise<Session>
  getUserId: () => string | null
}

export const authPlugin = plugin(
  'auth',
  {
    schema: authConfigSchema,
    defaults: { sessionMaxAge: 86400, sessionCookieName: 'session_id', secureCookies: true }
  },
  {
    extend: (ctx, config) => ({
      userId: null,
      session: null,

      requireAuth: async () => {
        if (!ctx.session) {
          throw new Error('UNAUTHORIZED')
        }
        return ctx.session
      },

      getUserId: () => ctx.userId,
    }),

    queries: {
      me: {
        handler: async (ctx) => {
          if (!ctx.session) {
            return err({ code: 'NOT_AUTHENTICATED', message: 'Not logged in' })
          }
          return ok(ctx.session.user)
        }
      }
    },

    mutations: {
      login: {
        args: z.object({ email: z.string(), password: z.string() }),
        handler: async (ctx, args, config) => {
          const user = await ctx.db.users.findByEmail(args.email)
          if (!user || !await verifyPassword(args.password, user.passwordHash)) {
            return err({ code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' })
          }
          const session = await createSession(user.id, {
            maxAge: config.sessionMaxAge,
            cookieName: config.sessionCookieName,
            secure: config.secureCookies,
          })
          ctx.session = session
          ctx.userId = user.id
          return ok({ user, session })
        }
      },

      logout: {
        handler: async (ctx, _, config) => {
          if (ctx.session) {
            await invalidateSession(ctx.session.id)
          }
          ctx.session = null
          ctx.userId = null
          return ok(true)
        }
      }
    },

    hooks: {
      onInit: async (ctx, config) => {
        const cookieValue = ctx.cookies.get(config.sessionCookieName)
        if (cookieValue) {
          const session = await validateSession(cookieValue)
          if (session) {
            ctx.session = session
            ctx.userId = session.userId
          }
        }
      },
    }
  }
)
```

### Cache Plugin (Configurable)

```typescript
// plugins/cache.ts
import { plugin } from '@deessejs/server'
import { z } from 'zod'

const cacheConfigSchema = z.object({
  ttl: z.number().min(1).max(86400).default(3600),
  prefix: z.string().default('cache'),
  compression: z.enum(['none', 'gzip', 'lz4']).default('none'),
})

type CacheConfig = z.TypeOf<typeof cacheConfigSchema>

interface CacheContext extends BaseContext {
  cache: {
    get: <T>(key: string) => Promise<T | null>
    set: <T>(key: string, value: T, ttl?: number) => Promise<void>
    invalidate: (pattern: string) => Promise<void>
    invalidateNamespace: (namespace: string) => Promise<void>
  }
}

export const cachePlugin = plugin(
  'cache',
  {
    schema: cacheConfigSchema,
    defaults: { ttl: 3600, prefix: 'cache', compression: 'none' }
  },
  {
    extend: (ctx, config) => ({
      cache: {
        get: async <T>(key: string) => {
          const fullKey = `${config.prefix}:${key}`
          const cached = await ctx.redis.get(fullKey)
          if (!cached) return null
          return JSON.parse(cached) as T
        },

        set: async <T>(key: string, value: T, ttl = config.ttl) => {
          const fullKey = `${config.prefix}:${key}`
          await ctx.redis.setex(fullKey, ttl, JSON.stringify(value))
        },

        invalidate: async (pattern: string) => {
          const fullPattern = `${config.prefix}:${pattern}`
          const keys = await ctx.redis.keys(fullPattern)
          if (keys.length > 0) {
            await ctx.redis.del(...keys)
          }
        },

        invalidateNamespace: async (namespace: string) => {
          await ctx.cache.invalidate(`${namespace}:*`)
        }
      }
    }),

    mutations: {
      invalidateCache: {
        args: z.object({ pattern: z.string() }),
        handler: async (ctx, args) => {
          await ctx.cache.invalidate(args.pattern)
          return ok(true)
        }
      }
    }
  }
)
```

### Logging Plugin (Configurable)

```typescript
// plugins/logging.ts
import { plugin } from '@deessejs/server'
import { z } from 'zod'

const loggingConfigSchema = z.object({
  level: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  format: z.enum(['json', 'pretty', 'minimal']).default('json'),
  includeTimestamp: z.boolean().default(true),
  redactPaths: z.array(z.string()).default(['password', 'token', 'secret']),
})

type LoggingConfig = z.TypeOf<typeof loggingConfigSchema>

export const loggingPlugin = plugin(
  'logging',
  {
    schema: loggingConfigSchema,
    defaults: { level: 'info', format: 'json', includeTimestamp: true, redactPaths: ['password', 'token', 'secret'] }
  },
  {
    extend: (ctx, config) => ({
      logger: {
        info: (message: string, meta?: Record<string, unknown>) => {
          ctx.logger.info(message, { plugin: 'logging', ...meta })
        },
        warn: (message: string, meta?: Record<string, unknown>) => {
          ctx.logger.warn(message, { plugin: 'logging', ...meta })
        },
        error: (message: string, error?: Error, meta?: Record<string, unknown>) => {
          ctx.logger.error(message, { plugin: 'logging', error, ...meta })
        },
        debug: (message: string, meta?: Record<string, unknown>) => {
          ctx.logger.debug(message, { plugin: 'logging', ...meta })
        }
      }
    }),

    hooks: {
      onBeforeInvoke: async (ctx, args, operation, config) => {
        ctx.logger.debug(`Invoking ${operation.namespace}.${operation.name}`, {
          args: redactSensitive(args, config.redactPaths)
        })
      },
      onSuccess: async (ctx, args, result, operation, config) => {
        ctx.logger.info(`Success ${operation.namespace}.${operation.name}`)
      },
      onError: async (ctx, args, error, operation, config) => {
        ctx.logger.error(`Error in ${operation.namespace}.${operation.name}`, error instanceof Error ? error : new Error(String(error)))
      }
    }
  }
)

function redactSensitive(obj: unknown, paths: string[]): unknown {
  if (!obj || typeof obj !== 'object') return obj
  const result = { ...obj as object }
  for (const path of paths) {
    if (path in result) {
      (result as Record<string, unknown>)[path] = '[REDACTED]'
    }
  }
  return result
}
```

### Rate Limit Plugin (Configurable)

```typescript
// plugins/rateLimit.ts
import { plugin } from '@deessejs/server'
import { z } from 'zod'

const rateLimitConfigSchema = z.object({
  windowMs: z.number().min(1000).max(3600000).default(60000),
  maxRequests: z.number().min(1).max(10000).default(100),
  skipFailedRequests: z.boolean().default(false),
})

type RateLimitConfig = z.TypeOf<typeof rateLimitConfigSchema>

interface RateLimitContext extends BaseContext {
  rateLimit: {
    check: (identifier: string) => Promise<{ allowed: boolean; remaining: number; resetAt: number }>
  }
}

export const rateLimitPlugin = plugin(
  'rateLimit',
  {
    schema: rateLimitConfigSchema,
    defaults: { windowMs: 60000, maxRequests: 100, skipFailedRequests: false }
  },
  {
    extend: (ctx, config) => ({
      rateLimit: {
        check: async (identifier: string) => {
          const key = `ratelimit:${identifier}`
          const now = Date.now()
          const windowStart = now - config.windowMs

          await ctx.redis.zremrangebyscore(key, 0, windowStart)
          const requestCount = await ctx.redis.zcard(key)

          if (requestCount >= config.maxRequests) {
            return { allowed: false, remaining: 0, resetAt: now + config.windowMs }
          }

          await ctx.redis.zadd(key, now, `${now}:${Math.random()}`)
          await ctx.redis.expire(key, Math.ceil(config.windowMs / 1000))

          return { allowed: true, remaining: config.maxRequests - requestCount - 1, resetAt: now + config.windowMs }
        }
      }
    }),

    middleware: [
      {
        name: 'rateLimit',
        scope: 'all',
        handler: async (ctx, next, config) => {
          const identifier = ctx.request?.ip || ctx.userId || 'anonymous'
          const { allowed, remaining, resetAt } = await ctx.rateLimit.check(identifier)

          if (!allowed) {
            return err({ code: 'RATE_LIMITED', message: 'Rate limit exceeded' })
          }

          ctx.responseHeaders = {
            ...ctx.responseHeaders,
            'X-RateLimit-Remaining': String(remaining),
            'X-RateLimit-Reset': String(resetAt),
          }

          return next()
        }
      }
    ]
  }
)
```

---

## 5. Integration with defineContext

### Using Static and Configurable Plugins Together

```typescript
const { t, createAPI } = defineContext<BaseContext>()({
  context: { db, logger },

  // Mix of static and configurable plugins
  plugins: [
    // Static plugin (no config)
    authPlugin,

    // Configurable plugin with custom config
    cachePlugin({ ttl: 3600, prefix: 'myapp' }),

    // Configurable plugin with default config
    loggingPlugin({ level: 'debug' }),

    // Rate limit plugin with custom config
    rateLimitPlugin({ windowMs: 60000, maxRequests: 100 }),
  ]
})

const api = createAPI({
  router: t.router({
    users: t.router({
      get: t.query({
        args: z.object({ id: z.number() }),
        handler: async (ctx, args) => { ... }
      }),
    }),
  }),
  middleware: [requestIdMiddleware]
})

// Access plugin-contributed operations
const user = await api.auth.me.query()
```

### Plugin Initialization Flow

```
1. defineContext({ plugins: [...] }) called
           │
           ▼
2. For each plugin:
   a. If plugin has config:
      - Validate user-provided args against schema
      - Merge with defaults
      - Store resolved config
           │
           ▼
3. Apply all plugins in order:
   a. Call plugin.extend(ctx, resolvedConfig)
   b. Register plugin.queries/mutations under namespace
   c. Register plugin.middleware
   d. Register plugin.events
           │
           ▼
4. Call plugin.hooks.onInit() for each plugin
           │
           ▼
5. Return { t, createAPI }
```

---

## 6. Default Values and Validation

### Schema with Defaults

```typescript
const configSchema = z.object({
  // Required field - no default
  apiKey: z.string(),

  // Optional field with default
  timeout: z.number().default(5000),

  // Optional field - explicitly optional
  retries: z.number().optional(),

  // Nested object with defaults
  cache: z.object({
    enabled: z.boolean().default(true),
    ttl: z.number().default(300),
  }).default({}),
})
```

### Config Validation

```typescript
// defineContext validates at registration time:
defineContext({
  plugins: [
    // This will throw ZodError if validation fails
    rateLimitPlugin({ windowMs: -1 }), // ZodError!
  ]
})
```

---

## 7. Static Plugins (Backwards Compatibility)

Existing static plugins continue to work:

```typescript
// Static plugin - no config
export const staticAuthPlugin = plugin({
  name: 'auth',
  extend: (ctx) => ({
    userId: null,
    getUserId: () => ctx.userId,
  })
})

// Works in defineContext:
defineContext({
  plugins: [staticAuthPlugin]
})
```

---

## 8. Type Composition Patterns

### Merging Plugin Contexts with Config

```typescript
type MergePluginContexts<
  BaseCtx,
  Plugins extends AnyPlugin<any>[]
> = BaseCtx & UnionToIntersection<
  Plugins[number] extends infer P
    ? P extends ConfigurablePlugin<any, any, infer PluginCtx>
      ? Partial<PluginCtx>
      : P extends StaticPlugin<any, infer PluginCtx>
        ? Partial<PluginCtx>
        : never
    : never
>
```

---

## 9. Plugin Dependencies

```typescript
// Auth plugin
const authPlugin = plugin('auth', {
  schema: z.object({ sessionMaxAge: z.number().default(86400) }),
}, (ctx, config) => ({
  extend: (ctx) => ({ ... }),
}))

// Premium plugin depends on auth
const premiumPlugin = plugin('premium', {
  schema: z.object({ trialDays: z.number().default(14) }),
  dependsOn: ['auth'],
}, (ctx, config, deps) => ({
  extend: (ctx) => ({
    isPremium: ctx.session?.tier === 'premium',
    subscribe: async (plan: 'monthly' | 'yearly') => {
      if (!ctx.session) {
        throw new Error('PREMIUM_REQUIRED')
      }
      return createSubscription(ctx.session.userId, plan)
    },
  }),
}))

// defineContext resolves dependencies in order
defineContext({
  plugins: [
    authPlugin({ sessionMaxAge: 86400 }),
    premiumPlugin({ trialDays: 30 }),
  ]
})
```

---

## 10. Middleware Scoping

```typescript
// Middleware can be scoped to specific operations
const authMiddleware: PluginMiddleware<Ctx> = {
  name: 'auth',
  scope: ['users.update', 'posts.delete'],
  handler: async (ctx, next) => {
    if (!ctx.session) {
      return err({ code: 'UNAUTHORIZED', message: '...' })
    }
    return next()
  }
}

// Middleware execution order:
// 1. Global middleware (from createAPI)
// 2. Plugin middleware (filtered by scope)
// 3. Operation-specific middleware
```

---

## 11. Namespace Isolation

```typescript
// All plugin-contributed operations are namespaced
const api = createAPI({
  router: t.router({ ... })
})

// Access patterns:
// 1. Dot notation: api['auth'].me.query()
// 2. Namespace property: api.auth.me.query()
// 3. Full path: api.execute('auth.me', args)

// Conflict prevention:
// - Base router operations: 'users.get'
// - Plugin operations: 'auth.me', 'cache.invalidate'
// - Namespaced by plugin name to prevent collisions
```

---

## 12. Open Questions and Design Decisions

### 1. Per-Request vs Per-Application Context Extension

- **Currently**: Context is extended once at API creation
- **Question**: Should plugins like `auth` extend context per-request (with session data)?
- **Recommendation**: Support both - `extend()` for static additions, `hooks.onBeforeInvoke` for per-request data

### 2. Plugin Load Order

- **Question**: Should plugin registration order matter for context extension?
- **Recommendation**: Yes, for `dependsOn` declarations, but context merging should be deterministic

### 3. Type Inference for Plugin Router Contributions

- **Question**: How to make `api.auth.me` properly typed without manual type annotations?
- **Recommendation**: Use conditional types to infer plugin router shape

### 4. Middleware Application Order

- **Question**: Should plugin middleware run before or after global middleware?
- **Recommendation**: Global -> Plugin (by order) -> Operation-specific

### 5. Event Handler Registration

- **Question**: Should events be registered at plugin init or per-request?
- **Recommendation**: At plugin init, with `onInit` hook for async setup

### 6. Plugin Disposal

- **Question**: How to handle cleanup when API is destroyed?
- **Recommendation**: Add `onDispose` hook for resource cleanup

### 7. Nested Plugins

- **Question**: Can plugins contribute sub-routers with their own plugins?
- **Recommendation**: Support via recursive `router()` helper inside plugins

### 8. Schema Validation for Plugin Operations

- **Question**: Should plugin queries/mutations support Zod schemas like base operations?
- **Recommendation**: Yes, add optional `args` Zod schema validation

### 9. Config Validation Timing

- **Question**: Should config be validated at defineContext time or at first use?
- **Recommendation**: Validate at defineContext time (registration time) for fail-fast

### 10. Default Config vs Required Config

- **Question**: How to handle plugins where all config fields have defaults?
- **Recommendation**: Allow `plugin({ ... })` with no args for all-optional configs

---

## 13. Summary

This design provides a comprehensive, type-safe plugin system that mirrors the power of tRPC middleware while staying true to the `@deessejs/server` direct-object pattern.

Key principles:

- **Namespace isolation**: Plugin operations are always namespaced by plugin name
- **Type safety**: Full TypeScript inference for plugin context and operations
- **Composition**: Plugins can depend on other plugins and compose cleanly
- **Configurable plugins**: Plugins can accept initialization arguments via Zod schemas
- **Scoped middleware**: Plugin middleware can target specific operations
- **Lifecycle hooks**: Rich hooks for init, invoke, success, error, and dispose
- **Event system**: Plugins can define and emit typed events
- **Validation**: Zod schema validation with default values
- **Nested configs**: Support for complex nested configuration objects
