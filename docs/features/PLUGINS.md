# Plugin System Specification

## Overview

The plugin system in `@deessejs/server` allows extending the context (`ctx`) with additional properties **and** adding API routes. Plugins are a way to add reusable functionality across your application.

## Plugin Capabilities

Plugins can provide:

1. **Context Extension** - Add properties to the context object
2. **API Routes** - Add queries and mutations to the router
3. **Lifecycle Hooks** - Execute code on invoke, success, or error
4. **Request Access** - Access headers and cookies

## Plugin Type

Plugins are declared using the `plugin()` helper function:

```typescript
const myPlugin = plugin<Ctx>({
  name: "myPlugin",
  extend: (ctx) => ({ ... }),
  router: (t) => ({ ... }),
  hooks: { ... }
})
```

### Plugin Definition

```typescript
type PluginDefinition<Ctx, PluginRouter extends Router = {}> = {
  name: string
  extend: (ctx: Ctx) => Partial<Ctx>
  router?: (t: QueryBuilder<Ctx>) => PluginRouter
  hooks?: PluginHooks<Ctx>
}

type PluginHooks<Ctx> = {
  onInvoke?: (ctx: Ctx, args: unknown) => void | Promise<void>
  onSuccess?: (ctx: Ctx, args: unknown, result: unknown) => void | Promise<void>
  onError?: (ctx: Ctx, args: unknown, error: unknown) => void | Promise<void>
}
```

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | Unique identifier for the plugin |
| `extend` | `(ctx: Ctx) => Partial<Ctx>` | Function that returns additional context properties |
| `router` | `(t: QueryBuilder<Ctx>) => PluginRouter` | Optional function that returns plugin queries and mutations |
| `hooks` | `PluginHooks` | Optional lifecycle hooks |

## Plugin Factory Functions

Plugins can be configured with options using factory functions:

```typescript
// plugins/notifications.ts
import { Plugin } from "@deessejs/server"

type NotificationOptions = {
  retryCount?: number
  defaultChannel?: "email" | "sms" | "push"
}

export const notificationPlugin = (options: NotificationOptions = {}): Plugin<Ctx> => ({
  name: "notifications",
  extend: (ctx) => ({
    sendNotification: async (to: string, message: string) => {
      // Use options
      const retry = options.retryCount ?? 3
      const channel = options.defaultChannel ?? "email"

      // Send notification with retry logic
      for (let i = 0; i < retry; i++) {
        try {
          return await ctx.notificationService.send(to, message, channel)
        } catch (error) {
          if (i === retry - 1) throw error
        }
      }
    }
  })
})

// Usage
const { t, createAPI } = defineContext({
  context: { db: myDatabase },
  plugins: [
    notificationPlugin({ retryCount: 5, defaultChannel: "push" })
  ]
})
```

## Lifecycle Hooks

Plugins can execute code at specific points during request execution:

```typescript
type PluginHooks<Ctx> = {
  onInvoke?: (ctx: Ctx, args: unknown) => void | Promise<void>
  onSuccess?: (ctx: Ctx, args: unknown, result: unknown) => void | Promise<void>
  onError?: (ctx: Ctx, args: unknown, error: unknown) => void | Promise<void>
}
```

### Execution Order

The framework executes hooks in a specific order:

```
Request Flow:
┌─────────────────────────────────────────────────────────────┐
│  onInvoke (plugins 1→2→3)                               │
│      │                                                     │
│      ▼                                                     │
│  ┌─────────────┐                                          │
│  │   Handler   │                                          │
│  └─────────────┘                                          │
│      │                                                     │
│      ├──► onSuccess (plugins 3→2→1)  ◄── Reverse order  │
│      │                                                     │
│      └──► onError (plugins 3→2→1)    ◄── Reverse order  │
└─────────────────────────────────────────────────────────────┘
```

**Why reverse order for onSuccess/onError?**
- If Plugin 1 is Logger and Plugin 2 is Metrics:
  - `onInvoke`: Logger sees raw input first, then Metrics
  - `onSuccess`: Metrics sees processed result first, then Logger sees final result

### Guard (Stopping Execution)

The `onInvoke` hook can stop request execution by throwing an error:

```typescript
// Plugin: Maintenance Mode
const maintenancePlugin = plugin({
  name: "maintenance",
  hooks: {
    onInvoke: async (ctx, args) => {
      const isInMaintenance = await ctx.db.config.get("maintenance_mode")
      if (isInMaintenance) {
        throw new Error("SERVICE_IN_MAINTENANCE")
      }
    }
  }
})
```

When `onInvoke` throws:
1. The handler is **not** executed
2. Other plugins' `onError` hooks are called (in reverse order)
3. The error is returned to the client

This allows plugins to act as **Global Middleware**.

### Example: Logging Plugin

```typescript
const loggerPlugin = plugin<Ctx>({
  name: "logger",
  extend: (ctx) => ({
    logger: {
      info: (msg: string) => console.log("[INFO]", msg),
      error: (msg: string) => console.error("[ERROR]", msg)
    }
  }),
  hooks: {
    onInvoke: (ctx, args) => {
      console.log(`[INVOKE] ${ctx.operation}`, args)
    },
    onSuccess: (ctx, args, result) => {
      console.log(`[SUCCESS] ${ctx.operation}`)
    },
    onError: (ctx, args, error) => {
      console.error(`[ERROR] ${ctx.operation}`, error)
    }
  }
})
```

### Example: Metrics Plugin

```typescript
const metricsPlugin = plugin<Ctx>({
  name: "metrics",
  extend: (ctx) => ({
    metrics: {
      increment: (name: string) => { /* ... */ },
      timing: (name: string, ms: number) => { /* ... */ }
    }
  }),
  hooks: {
    onInvoke: (ctx, args) => {
      ctx.metrics.increment(`${ctx.operation}.invoke`)
      ctx.startTime = Date.now()
    },
    onSuccess: (ctx, args, result) => {
      const duration = Date.now() - ctx.startTime
      ctx.metrics.timing(`${ctx.operation}.duration`, duration)
      ctx.metrics.increment(`${ctx.operation}.success`)
    },
    onError: (ctx, args, error) => {
      const duration = Date.now() - ctx.startTime
      ctx.metrics.timing(`${ctx.operation}.duration`, duration)
      ctx.metrics.increment(`${ctx.operation}.error`)
    }
  }
}
```

## Request Access (Headers & Cookies)

Plugins can access HTTP headers and cookies from the request:

```typescript
const authPlugin = plugin<Ctx>({
  name: "auth",
  extend: async (ctx) => {
    // Access headers (Next.js)
    const headers = await headers()
    const cookieStore = await cookies()

    const authHeader = headers.get("authorization")
    const sessionToken = cookieStore.get("session")?.value

    let user = null
    if (sessionToken) {
      user = await verifySession(sessionToken)
    }

    return {
      userId: user?.id ?? null,
      userRoles: user?.roles ?? [],
      isAuthenticated: !!user
    }
  }
})
```

> **Note:** The `extend` function can be `async` to support awaiting headers/cookies.

## Namespace Enforcement

Plugin routes are automatically namespaced under the plugin name:

```typescript
const notificationPlugin = plugin<Ctx, {
  list: Query
  send: Mutation
  markRead: Mutation
}>({
  name: "notifications",
  extend: (ctx) => ({ sendNotification: (...args) => { ... } }),
  router: (t) => ({
    list: t.query({ ... }),
    send: t.mutation({ ... }),
    markRead: t.mutation({ ... })
  })
})

// Usage: api.notifications.list()
// NOT: api.list()
```

This ensures:
- **No collisions** - Each plugin has its own namespace
- **Clear origin** - `api.notifications.send` clearly shows the source
- **Organized routes** - Routes are grouped logically

## Usage Examples

### Creating a Plugin

```typescript
// plugins/auth.ts
import { Plugin } from "@deessejs/server"

type AuthContext = {
  userId: string | null
  isAuthenticated: boolean
}

export const authPlugin = plugin<AuthContext>({
  name: "auth",

  extend: () => ({
    userId: null,
    isAuthenticated: false,
  }),
})
```

### Plugin with Runtime Initialization

```typescript
// plugins/cache.ts
import { Plugin } from "@deessejs/server"

type CacheContext = {
  cache: {
    get: <T>(key: string) => Promise<T | null>
    set: <T>(key: string, value: T, ttl?: number) => Promise<void>
    delete: (key: string) => Promise<void>
    clear: () => Promise<void>
  }
}

const memoryCache = new Map<string, { value: unknown; expiry: number }>()

export const cachePlugin = plugin<CacheContext>({
  name: "cache",

  extend: () => ({
    cache: {
      get: async <T>(key: string): Promise<T | null> => {
        const item = memoryCache.get(key)
        if (!item) return null
        if (item.expiry < Date.now()) {
          memoryCache.delete(key)
          return null
        }
        return item.value as T
      },

      set: async <T>(key: string, value: T, ttl = 3600000): Promise<void> => {
        memoryCache.set(key, { value, expiry: Date.now() + ttl })
      },

      delete: async (key: string): Promise<void> => {
        memoryCache.delete(key)
      },

      clear: async (): Promise<void> => {
        memoryCache.clear()
      },
    },
  }),
})
```

### Plugin with Context Access

```typescript
// plugins/logger.ts
import { Plugin } from "@deessejs/server"

type LoggerContext = {
  logger: {
    info: (msg: string, meta?: Record<string, unknown>) => void
    warn: (msg: string, meta?: Record<string, unknown>) => void
    error: (msg: string, error?: Error, meta?: Record<string, unknown>) => void
  }
}

export const loggerPlugin = plugin<LoggerContext>({
  name: "logger",

  extend: () => ({
    logger: {
      info: (msg, meta) => console.log("[INFO]", msg, meta),
      warn: (msg, meta) => console.warn("[WARN]", msg, meta),
      error: (msg, error, meta) => console.error("[ERROR]", msg, error, meta),
    },
  }),
})
```

### Using Multiple Plugins

```typescript
import { defineContext, plugin } from "@deessejs/server"
import { authPlugin } from "./plugins/auth"
import { cachePlugin } from "./plugins/cache"
import { loggerPlugin } from "./plugins/logger"

type BaseContext = {
  db: Database
}

const { t, createAPI } = defineContext({
  context: {
    db: myDatabase,
  },
  plugins: [
    authPlugin,
    cachePlugin,
    loggerPlugin,
  ],
})

const api = createAPI({
  router: t.router({ ... })
})

// Context now has: db, userId, isAuthenticated, cache, logger
```

### Plugin Order Matters

The order of plugins in the array matters:

```typescript
// CORRECT: authPlugin runs first, loggerPlugin can use ctx.userId
plugins: [
  authPlugin,      // Adds userId to context
  loggerPlugin,   // Can access ctx.userId in hooks
]

// INCORRECT: loggerPlugin runs first, ctx.userId not available
plugins: [
  loggerPlugin,   // Cannot access ctx.userId yet
  authPlugin,     // Adds userId after
]
```

**Why?** Plugins that add properties to context must be declared **before** plugins that need those properties in their hooks.
```

### Using Extended Context

```typescript
import { z } from "zod"

const getUser = t.query({
  args: z.object({
    id: z.number()
  }),
  handler: async (ctx, args) => {
    // Access base context
    const user = await ctx.db.users.find(args.id)

    // Access plugin context
    ctx.logger.info("Fetching user", { userId: args.id })

    const cached = await ctx.cache.get<User>(`user:${args.id}`)
    if (cached) {
      ctx.logger.info("Cache hit", { userId: args.id })
      return ok(cached)
    }

    await ctx.cache.set(`user:${args.id}`, user, 300000)
    return ok(user)
  }
})
```

### Conditional Plugin Context

```typescript
// plugins/session.ts
import { Plugin } from "@deessejs/server"

type SessionContext = {
  session: {
    get: <T>(key: string) => T | null
    set: <T>(key: string, value: T) => void
  }
}

export const sessionPlugin = plugin<SessionContext>({
  name: "session",

  extend: (ctx) => {
    // Can access existing context properties
    const sessionStore = new Map<string, unknown>()

    return {
      session: {
        get: <T>(key: string) => sessionStore.get(key) as T | null,
        set: <T>(key: string, value: T) => sessionStore.set(key, value),
      },
    }
  },
}
```

## Plugin with API Routes

Plugins can also add queries and mutations to the API router:

```typescript
// plugins/notifications.ts
import { Plugin, ok } from "@deessejs/server"

type NotificationContext = {
  db: Database
  userId: string | null
}

type NotificationRouter = {
  list: ReturnType<typeof t.query>
  markAsRead: ReturnType<typeof t.mutation>
  send: ReturnType<typeof t.mutation>
}

export const notificationPlugin = plugin<NotificationContext, NotificationRouter>({
  name: "notifications",

  // Extend context with notification helper
  extend: (ctx) => ({
    async sendNotification(userId: string, message: string) {
      await ctx.db.notifications.create({ userId, message })
    }
  }),

  // Add routes to the API
  router: (t) => ({
    list: t.query({
      args: z.object({}),
      handler: async (ctx) => {
        const notifications = await ctx.db.notifications.findMany({
          where: { userId: ctx.userId },
          orderBy: { createdAt: "desc" }
        })
        return ok(notifications)
      }
    }),

    markAsRead: t.mutation({
      args: z.object({ id: z.number() }),
      handler: async (ctx, args) => {
        await ctx.db.notifications.update({
          where: { id: args.id },
          data: { read: true }
        })
        return ok({ success: true })
      }
    }),

    send: t.mutation({
      args: z.object({
        userId: z.string(),
        message: z.string()
      }),
      handler: async (ctx, args) => {
        const notification = await ctx.db.notifications.create(args)
        return ok(notification)
      }
    })
  })
}
```

### Using Plugin Routes

When you define your context with plugins that have routers, the routes are automatically merged into the main API:

```typescript
const { t, createAPI } = defineContext({
  context: { db: myDatabase },
  plugins: [notificationPlugin]
})

const api = createAPI({
  router: t.router({
    // Main app routes
    users: t.router({ ... }),
    tasks: t.router({ ... }),

    // Plugin routes are merged automatically
    // Access via: api.notifications.list()
  })
})
```

### Plugin Router with Internal Operations

Plugins can also include internal queries and mutations:

```typescript
export const analyticsPlugin = plugin<Ctx, AnalyticsRouter>({
  name: "analytics",

  extend: (ctx) => ({}),

  router: (t) => ({
    // Public - exposed via HTTP
    getStats: t.query({
      args: z.object({}),
      handler: async (ctx) => {
        return ok({ views: 1000 })
      }
    }),

    // Internal - server only
    getDetailedReport: t.internalQuery({
      args: z.object({}),
      handler: async (ctx) => {
        // Only runs on server - safe from HTTP attacks
        return ok({
          views: 1000,
          uniqueVisitors: 500,
          revenue: 5000
        })
      }
    }),

    // Internal mutation
    resetStats: t.internalMutation({
      args: z.object({}),
      handler: async (ctx) => {
        await ctx.db.analytics.deleteMany()
        return ok({ success: true })
      }
    })
  })
}
```

## Type Safety

### Extending Context Types

```typescript
import { plugin } from "@deessejs/server"

// Define your full context type
type MyContext = {
  db: Database
  // Plugin-extended properties
  userId: string | null
  cache: Cache
  logger: Logger
}

// Create plugins with full type safety
export const authPlugin = plugin<MyContext>({
  name: "auth",
  extend: () => ({
    userId: null,
  }),
}

// TypeScript knows all context properties
const getUser = t.query({
  args: z.object({ id: z.number() }),
  handler: async (ctx: MyContext, args) => {
    // All properties available with full autocomplete
    ctx.db // Database
    ctx.userId // string | null
    ctx.cache // Cache
    ctx.logger // Logger
  }
})
```

### Plugin Router Types

When using plugins with routers, types are automatically inferred:

```typescript
const { t, createAPI } = defineContext({
  context: { db: myDatabase },
  plugins: [notificationPlugin, authPlugin]
})

const api = createAPI({
  router: t.router({
    users: t.router({
      get: t.query({ ... })
    })
  })
})

// TypeScript knows about plugin routes
api.notifications.list({})     // ✅ Works
api.notifications.markAsRead({ id: 1 })  // ✅ Works

// Main routes still work
api.users.get({ id: 1 })      // ✅ Works
```

### Full Type Example

```typescript
// Context type
type Ctx = {
  db: Database
  userId: string | null
}

// Plugin with context extension and router
type AuthPlugin = Plugin<Ctx, {
  getCurrentUser: ReturnType<typeof t.query>
  updateProfile: ReturnType<typeof t.mutation>
}>

const authPlugin: AuthPlugin = {
  name: "auth",
  extend: () => ({ userId: null }),
  router: (t) => ({
    getCurrentUser: t.query({
      handler: async (ctx) => {
        const user = await ctx.db.users.find(ctx.userId!)
        return ok(user)
      }
    }),
    updateProfile: t.mutation({ ... })
  })
}
```

## Collision Detection

The framework detects and prevents naming collisions:

### Context Collision

If two plugins add the same property to context:

```typescript
const pluginA = {
  name: "pluginA",
  extend: () => ({ cache: { get: () => {} } })
}

const pluginB = {
  name: "pluginB",
  extend: () => ({ cache: { get: () => {} } })
}

// Warning: "pluginB" overwrites "cache" from "pluginA"
```

The framework will emit a warning at startup, but allow it (last plugin wins).

### Router Collision

If two plugins (or main router) define the same route:

```typescript
const pluginA = {
  name: "users",
  router: () => ({ list: t.query({ ... }) })
}

const pluginB = {
  name: "posts",
  router: () => ({ list: t.query({ ... }) })
}

// Error: Cannot add route "list" - already exists
```

The framework **throws an error** at startup to prevent silent bugs.

## Best Practices

1. **Keep plugins focused** - Each plugin should do one thing well

2. **Use descriptive names** - Plugin names should clearly indicate their purpose

3. **Initialize lazily** - Don't do heavy computation in `extend()`

4. **Document your plugins** - Clear documentation helps users understand available context properties

```typescript
// Good: Focused plugin
export const cachePlugin = plugin({
  name: "cache",
  extend: () => ({ cache: ... })
})

// Good: Descriptive name
export const authPlugin = plugin({
  name: "auth",
  extend: () => ({ userId: ... })
})

// Avoid: Do everything in one plugin
export const everythingPlugin = plugin({
  name: "everything",
  extend: () => ({ cache: ..., logger: ..., userId: ..., analytics: ... })
})
```

## Publishing Plugins to NPM

Plugins can be packaged and published to NPM for reuse across projects:

```typescript
// @my-org/logger-plugin/package.json
{
  "name": "@my-org/logger-plugin",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "peerDependencies": {
    "@deessejs/server": ">=1.0.0"
  }
}

// src/index.ts
import { plugin } from "@deessejs/server"

type LoggerContext = {
  logger: {
    info: (msg: string, meta?: Record<string, unknown>) => void
    error: (msg: string, error?: Error, meta?: Record<string, unknown>) => void
  }
}

export const loggerPlugin = plugin<LoggerContext>({
  name: "logger",
  extend: () => ({
    logger: {
      info: (msg, meta) => console.log("[INFO]", msg, meta),
      error: (msg, error, meta) => console.error("[ERROR]", msg, error, meta),
    },
  }),
})
```

### Generic Plugins for Maximum Reuse

For maximum compatibility, use `any` as the context type to work with any project:

```typescript
import { plugin } from "@deessejs/server"

// Works with any project regardless of context type
export const genericLoggerPlugin = plugin<any>({
  name: "logger",
  hooks: {
    onInvoke: (ctx, args) => {
      console.log(`[INVOKE] ${ctx.operation}`, args)
    },
    onSuccess: (ctx, args, result) => {
      console.log(`[SUCCESS] ${ctx.operation}`)
    },
    onError: (ctx, args, error) => {
      console.error(`[ERROR] ${ctx.operation}`, error)
    }
  }
})
```

## Future Considerations

- Plugin event handlers
- Cache invalidation hooks
- Plugin ordering/priority
- Plugin configuration
- Built-in plugins (auth, cache, logger, etc.)
