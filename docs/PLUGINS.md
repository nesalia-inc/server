# Plugin System Specification

## Overview

The plugin system in `@deessejs/server` allows extending the context (`ctx`) with additional properties. Plugins are a way to add reusable functionality across your application.

## Current Scope

**Version 1** - Plugins can only extend the context.

Future versions will add:
- Plugin queries and mutations
- Event handlers
- Cache invalidation hooks

## API Reference

### Plugin Type

```typescript
type Plugin<Ctx> = {
  name: string
  extend: (ctx: Ctx) => Partial<Ctx>
}
```

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | Unique identifier for the plugin |
| `extend` | `(ctx: Ctx) => Partial<Ctx>` | Function that returns additional context properties |

## Usage Examples

### Creating a Plugin

```typescript
// plugins/auth.ts
import { Plugin } from "@deessejs/server"

type AuthContext = {
  userId: string | null
  isAuthenticated: boolean
}

export const authPlugin: Plugin<AuthContext> = {
  name: "auth",

  extend: () => ({
    userId: null,
    isAuthenticated: false,
  }),
}
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

export const cachePlugin: Plugin<CacheContext> = {
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
}
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

export const loggerPlugin: Plugin<LoggerContext> = {
  name: "logger",

  extend: () => ({
    logger: {
      info: (msg, meta) => console.log("[INFO]", msg, meta),
      warn: (msg, meta) => console.warn("[WARN]", msg, meta),
      error: (msg, error, meta) => console.error("[ERROR]", msg, error, meta),
    },
  }),
}
```

### Using Multiple Plugins

```typescript
import { defineContext, Plugin } from "@deessejs/server"
import { authPlugin } from "./plugins/auth"
import { cachePlugin } from "./plugins/cache"
import { loggerPlugin } from "./plugins/logger"

type BaseContext = {
  db: Database
}

const { t, api } = defineContext({
  initialValues: {
    db: myDatabase,
  },
  plugins: [
    authPlugin,
    cachePlugin,
    loggerPlugin,
  ],
})

// Context now has: db, userId, isAuthenticated, cache, logger
```

### Using Extended Context

```typescript
const getUser = t.query({
  args: z.object({ id: z.number() }),
  handler: async (ctx, args) => {
    // Access base context
    const user = await ctx.db.users.find(args.id)

    // Access plugin context
    ctx.logger.info("Fetching user", { userId: args.id })

    const cached = await ctx.cache.get<User>(`user:${args.id}`)
    if (cached) {
      ctx.logger.info("Cache hit", { userId: args.id })
      return success(cached)
    }

    await ctx.cache.set(`user:${args.id}`, user, 300000)
    return success(user)
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

export const sessionPlugin: Plugin<SessionContext> = {
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

## Type Safety

### Extending Context Types

```typescript
import { Plugin } from "@deessejs/server"

// Define your full context type
type MyContext = {
  db: Database
  // Plugin-extended properties
  userId: string | null
  cache: Cache
  logger: Logger
}

// Create plugins with full type safety
export const authPlugin: Plugin<MyContext> = {
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

## Best Practices

1. **Keep plugins focused** - Each plugin should do one thing well

2. **Use descriptive names** - Plugin names should clearly indicate their purpose

3. **Initialize lazily** - Don't do heavy computation in `extend()`

4. **Document your plugins** - Clear documentation helps users understand available context properties

```typescript
// Good: Focused plugin
export const cachePlugin = { name: "cache", extend: () => ({ cache: ... }) }

// Good: Descriptive name
export const authPlugin = { name: "auth", extend: () => ({ userId: ... }) }

// Avoid: Do everything in one plugin
export const everythingPlugin = {
  name: "everything",
  extend: () => ({ cache: ..., logger: ..., userId: ..., analytics: ... })
}
```

## Future Considerations

- Plugin queries and mutations
- Plugin event handlers
- Cache invalidation hooks
- Plugin ordering/priority
- Plugin configuration
- Built-in plugins (auth, cache, logger, etc.)
