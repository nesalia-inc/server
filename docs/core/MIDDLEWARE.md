# Middleware System Specification

## Overview

The middleware system in `@deessejs/server` allows intercepting and modifying requests before they reach handlers. Middleware is applied **globally** via `createAPI()`, enabling cross-cutting concerns like authentication, authorization, logging, and rate limiting.

## Core Concepts

### Middleware Function

Middleware is a function that wraps handler execution. It receives the context, arguments, and a `next` function that continues execution to the next middleware or the handler itself.

### Global Middleware

All middleware is applied globally via `createAPI()`. This ensures consistent behavior across all operations and keeps the API definition clean.

## API Reference

### Creating Middleware: `t.middleware()`

```typescript
type Middleware<Ctx, Args = unknown> = {
  name: string
  args?: Validator<Args>  // Uses Zod, Valibot, ArkType, etc.
  handler: (ctx: Ctx & { args: Args }, next: () => Result) => Result
}

type QueryBuilder<Ctx> = {
  middleware<Args = unknown>(config: Middleware<Ctx, Args>): Middleware<Ctx, Args>
}
```

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | Unique identifier for the middleware |
| `args` | `Validator` | Optional validator for middleware-specific args |
| `handler` | `(ctx, next) => Result` | Middleware function that calls `next()` to proceed |

> **Note:** Works with Zod, Valibot, ArkType, or any Standard Schema compatible validator.

### Middleware Context

Middleware receives an extended context with access to:

- `ctx` - The full context object
- `ctx.args` - The operation arguments (modifiable)
- `ctx.headers` - Request headers (Next.js `headers()` abstraction)
- `ctx.operation` - The operation being executed
- `ctx.meta` - Temporary storage for passing data between middleware
- `ctx.isHttpRequest` - Whether this is an HTTP request (for security)

> **Note:** `ctx.headers` is abstracted from Next.js `headers()`, making it testable without a full Next.js server.

## Usage Examples

### Basic Global Middleware

```typescript
const { t, createAPI } = defineContext({
  context: { db: myDatabase }
})

// Define middleware
const authMiddleware = t.middleware({
  name: "auth",
  handler: async (ctx, next) => {
    // Check authentication
    const userId = ctx.headers.get("x-user-id")

    if (!userId) {
      return err({ code: "UNAUTHORIZED", message: "Missing user ID" })
    }

    // Add user to context
    ctx.userId = Number(userId)

    // Call next middleware/handler
    return next()
  }
})

// Apply globally via createAPI
const api = createAPI({
  router: t.router({
    users: {
      get: t.query({ ... }),
      create: t.mutation({ ... }),
    },
  }),
  middleware: [authMiddleware]
})
```

### Logging Middleware

```typescript
const loggingMiddleware = t.middleware({
  name: "logger",
  handler: async (ctx, next) => {
    const start = Date.now()
    const result = await next()
    const duration = Date.now() - start
    console.log(`${ctx.operation} completed in ${duration}ms`)
    return result
  }
})

const api = createAPI({
  router: t.router({ ... }),
  middleware: [loggingMiddleware]
})
```

### Error Handling Middleware

```typescript
const errorHandlerMiddleware = t.middleware({
  name: "errorHandler",
  handler: async (ctx, next) => {
    try {
      return await next()
    } catch (error) {
      return err({ code: "INTERNAL_ERROR", message: error.message })
    }
  }
})

const api = createAPI({
  router: t.router({ ... }),
  middleware: [errorHandlerMiddleware]
})
```

### Multiple Global Middleware

Apply multiple middleware to all operations:

```typescript
const api = createAPI({
  router: t.router({
    users: {
      get: t.query({ ... }),
      create: t.mutation({ ... }),
    },
  }),
  middleware: [
    // Logging middleware (runs first)
    t.middleware({
      name: "logger",
      handler: async (ctx, next) => {
        const start = Date.now()
        const result = await next()
        const duration = Date.now() - start
        console.log(`${ctx.operation} completed in ${duration}ms`)
        return result
      }
    }),

    // Error handling middleware (runs second)
    t.middleware({
      name: "errorHandler",
      handler: async (ctx, next) => {
        try {
          return await next()
        } catch (error) {
          return err({ code: "INTERNAL_ERROR", message: error.message })
        }
      }
    }),

    // Auth middleware (runs third)
    t.middleware({
      name: "auth",
      handler: async (ctx, next) => {
        const userId = ctx.headers.get("x-user-id")
        if (!userId) {
          return err({ code: "UNAUTHORIZED", message: "Missing user ID" })
        }
        ctx.userId = Number(userId)
        return next()
      }
    }),
  ]
})
```

### Middleware with Options

Create configurable middleware with args:

```typescript
import { z } from "zod"

const rateLimitMiddleware = t.middleware({
  name: "rateLimit",
  args: z.object({
    maxRequests: z.number().default(100),
    windowMs: z.number().default(60000),
  }),
  handler: async (ctx, next) => {
    const key = ctx.headers.get("x-forwarded-for") || "unknown"
    const now = Date.now()
    const { maxRequests, windowMs } = ctx.args

    let record = rateLimitStore.get(key)

    if (!record || record.resetAt < now) {
      record = { count: 0, resetAt: now + windowMs }
      rateLimitStore.set(key, record)
    }

    record.count++

    if (record.count > maxRequests) {
      return err({
        code: "RATE_LIMITED",
        message: `Rate limit exceeded. Try again in ${Math.ceil((record.resetAt - now) / 1000)} seconds`,
      })
    }

    ctx.headers.set("x-rate-limit-remaining", String(maxRequests - record.count))
    ctx.headers.set("x-rate-limit-reset", String(record.resetAt))

    return next()
  }
})

const api = createAPI({
  router: t.router({ ... }),
  middleware: [rateLimitMiddleware]
})
```

### Server-Side Only Middleware

For `internalQuery` and `internalMutation`, add an extra security layer:

```typescript
const serverOnlyMiddleware = t.middleware({
  name: "serverOnly",
  handler: async (ctx, next) => {
    // Verify this is a server-side call, not HTTP
    if (ctx.isHttpRequest) {
      return err({
        code: "FORBIDDEN",
        message: "This operation is only available server-side"
      })
    }

    return next()
  }
})

const api = createAPI({
  router: t.router({
    users: {
      get: t.query({ ... }),
      deleteAll: t.internalMutation({ ... }),
    },
  }),
  middleware: [serverOnlyMiddleware]
})
```

### Serverless Performance

In Serverless environments (Vercel, Cloudflare), middleware latency directly affects response time.

```typescript
// Avoid: Multiple async DB calls in middleware
const slowMiddleware = t.middleware({
  name: "slow",
  handler: async (ctx, next) => {
    await ctx.db.config.get("setting1")  // DB call
    await ctx.db.config.get("setting2")  // Another DB call
    return next()
  }
})

// Better: Use Plugins to inject resources, not middleware
// Middleware should only be for CONTROL logic (auth, rate limit)
// Heavy operations belong in Plugins or the handler itself
```

> **Best Practice:** Use **Plugins** for resource injection (DB, Config) and **Middleware** only for control logic (Auth, Rate Limit, Caching).

## Composing Middleware

Build reusable middleware combinations:

```typescript
// middleware/composed.ts
export const withAuth = t.middleware({
  name: "withAuth",
  handler: async (ctx, next) => {
    const userId = ctx.headers.get("x-user-id")
    if (!userId) {
      return err({ code: "UNAUTHORIZED", message: "Authentication required" })
    }
    ctx.userId = Number(userId)
    return next()
  }
})

export const withLogging = t.middleware({
  name: "withLogging",
  handler: async (ctx, next) => {
    console.log(`[${ctx.operation}] Starting...`)
    const result = await next()
    console.log(`[${ctx.operation}] Completed:`, result.ok ? "success" : "error")
    return result
  }
})

// Apply all global middleware at once
const api = createAPI({
  router: t.router({ ... }),
  middleware: [withAuth, withLogging]
})
```

### Execution Order

Middleware executes in the order they are defined:

```typescript
const api = createAPI({
  router: t.router({
    users: {
      get: t.query({ ... }),
    },
  }),
  middleware: [
    // 1. First middleware
    t.middleware({
      name: "first",
      handler: async (ctx, next) => {
        console.log("1. First middleware")
        return next()
      }
    }),

    // 2. Second middleware
    t.middleware({
      name: "second",
      handler: async (ctx, next) => {
        console.log("2. Second middleware")
        return next()
      }
    }),
  ]
})

// Output when calling any operation:
// 1. First middleware
// 2. Second middleware
// 3. Handler
```

### Short-circuiting

Middleware can return early to prevent handler execution:

```typescript
const cacheMiddleware = t.middleware({
  name: "cache",
  handler: async (ctx, next) => {
    // Generate cache key from operation and args
    const cacheKey = `${ctx.operation}:${JSON.stringify(ctx.args)}`

    // Check cache
    const cached = await ctx.cache.get(cacheKey)
    if (cached) {
      // Return cached result without calling next()
      return ok(cached)
    }

    // Execute handler
    const result = await next()

    // Cache successful results
    if (result.ok) {
      await ctx.cache.set(cacheKey, result.value, 300000)
    }

    return result
  }
})

const api = createAPI({
  router: t.router({ ... }),
  middleware: [cacheMiddleware]
})
```

## Type Safety

### Middleware with Typed Context

```typescript
type AuthContext = {
  userId: number | null
  userRoles: string[]
}

const authMiddleware = t.middleware({
  name: "auth",
  handler: async (ctx: AuthContext, next) => {
    // Full type safety for context
    ctx.userId // number | null
    ctx.userRoles // string[]

    return next()
  }
})
```

### Middleware with Typed Args

```typescript
import { z } from "zod"

const rateLimitMiddleware = t.middleware({
  name: "rateLimit",
  args: z.object({
    maxRequests: z.number().min(1).max(1000),
    windowMs: z.number().min(1000).max(3600000)
  }),
  handler: async (ctx, next) => {
    // ctx.args is typed with Zod
    ctx.args.maxRequests // number
    ctx.args.windowMs // number

    return next()
  }
})
```

## Middleware vs Lifecycle Hooks

It's crucial to understand when to use each:

| Aspect | Middleware | Lifecycle Hooks (`.on`) |
|--------|-----------|------------------------|
| **Control Flow** | **Active** - Decides IF and HOW the handler runs | **Passive** - Observes and reacts |
| **Short-circuit** | Yes - Can return early | No - Cannot stop execution |
| **Modify Args** | Yes | No |
| **Modify Result** | Yes | Yes (only `afterInvoke`) |
| **Use Case** | Auth, Rate Limit, Caching | Logging, Metrics, Analytics |

### When to Use Middleware

- **Authentication/Authorization** - Block requests
- **Rate Limiting** - Control request frequency
- **Caching** - Return cached data without calling handler
- **Feature Flags** - Enable/disable features
- **Request Modification** - Transform args before handler

### When to Use Hooks

- **Logging** - Record what happened
- **Metrics** - Track usage
- **Audit Trails** - Record actions
- **Response Transformation** - Modify output
- **Notifications** - Send events (via `ctx.send`)

### Key Principle

> **Middleware decides, Hooks observe.** If you need to control whether the handler runs, use Middleware. If you just need to react to what happened, use Hooks.

## Error Handling

### Middleware Error Handling

```typescript
const safeMiddleware = t.middleware({
  name: "safe",
  handler: async (ctx, next) => {
    try {
      return await next()
    } catch (error) {
      // Handle errors gracefully
      console.error("Middleware error:", error)
      return err({ code: "MIDDLEWARE_ERROR", message: "An error occurred" })
    }
  }
})
```

### Error Propagation

```typescript
const authMiddleware = t.middleware({
  name: "auth",
  handler: async (ctx, next) => {
    // Don't catch errors - let them propagate
    // This allows error handling middleware to handle them
    return next()
  }
})

const errorHandlerMiddleware = t.middleware({
  name: "errorHandler",
  handler: async (ctx, next) => {
    try {
      return await next()
    } catch (error) {
      // Handle any unhandled errors
      return err({
        code: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "Unknown error"
      })
    }
  }
})

// Use both - auth runs first, then error handler catches any errors
const api = createAPI({
  router: t.router({ ... }),
  middleware: [authMiddleware, errorHandlerMiddleware]
})
```

## Testing Middleware

### Unit Testing Middleware

```typescript
import { defineContext, createAPI, t } from "@deessejs/server"
import { ok, err } from "@deessejs/core"

describe("authMiddleware", () => {
  const { t, createAPI } = defineContext({
    context: { db: mockDb }
  })

  const authMiddleware = t.middleware({
    name: "auth",
    handler: async (ctx, next) => {
      const userId = ctx.headers.get("x-user-id")
      if (!userId) {
        return err({ code: "UNAUTHORIZED", message: "Missing user ID" })
      }
      ctx.userId = Number(userId)
      return next()
    }
  })

  it("should call next when userId is present", async () => {
    const mockCtx = {
      headers: new Map([["x-user-id", "123"]]),
      db: mockDb,
    }

    const next = vi.fn(() => ok({ id: 1 }))

    const result = await authMiddleware.handler(mockCtx, next)

    expect(next).toHaveBeenCalled()
    expect(result.ok).toBe(true)
  })

  it("should return error when userId is missing", async () => {
    const mockCtx = {
      headers: new Map(),
      db: mockDb,
    }

    const next = vi.fn()

    const result = await authMiddleware.handler(mockCtx, next)

    expect(next).not.toHaveBeenCalled()
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe("UNAUTHORIZED")
  })
})
```

### Integration Testing with Middleware

```typescript
import { createLocalExecutor } from "@deessejs/server"

describe("API with Middleware", () => {
  const executor = createLocalExecutor(api)

  it("should apply global middleware to all operations", async () => {
    const result = await executor.execute("users.get", { id: 1 })

    // Check that logging middleware ran
    expect(console.log).toHaveBeenCalled()
  })
})
```

## Best Practices

### 1. Keep Middleware Focused

Each middleware should do one thing well:

```typescript
// Good: Single responsibility
const authMiddleware = t.middleware({
  name: "auth",
  handler: async (ctx, next) => { ... }
})

const loggingMiddleware = t.middleware({
  name: "logging",
  handler: async (ctx, next) => { ... }
})

// Avoid: Multiple responsibilities
const authAndLoggingMiddleware = t.middleware({
  name: "authAndLogging",
  handler: async (ctx, next) => {
    // Auth logic...
    // Logging logic...
  }
})
```

### 2. Use Descriptive Names

```typescript
// Good
const requireAdminRole = t.middleware({ name: "requireAdmin", ... })
const rateLimitByIp = t.middleware({ name: "rateLimitByIp", ... })

// Avoid
const m1 = t.middleware({ name: "m1", ... })
const mw = t.middleware({ name: "mw", ... })
```

### 3. Always Call Next or Return

```typescript
// Good: Explicitly call next or return
handler: async (ctx, next) => {
  if (ctx.headers.get("x-skip")) {
    return next() // Explicitly proceed
  }
  return next()
}

// Good: Short-circuit when needed
handler: async (ctx, next) => {
  const cached = await ctx.cache.get(key)
  if (cached) return ok(cached) // Short-circuit

  return next() // Proceed to handler
}

// Bad: Forgetting to return next
handler: async (ctx, next) => {
  ctx.userId = 123
  next() // Missing return - can cause issues
}
```

### 4. Handle Errors Properly

```typescript
// Good: Catch and handle errors
handler: async (ctx, next) => {
  try {
    return await next()
  } catch (error) {
    return err({ code: "ERROR", message: error.message })
  }
}

// Good: Let errors propagate for centralized handling
handler: async (ctx, next) => {
  // No try-catch - let error handling middleware handle it
  return next()
}
```

### 5. Order Matters

Put global middleware in logical order:

```typescript
// Good: Logical order
middleware: [
  loggingMiddleware,     // 1. Log first (outermost)
  errorHandlerMiddleware, // 2. Handle errors
  rateLimitMiddleware,   // 3. Rate limit
  authMiddleware,         // 4. Authenticate last (innermost)
]
```

### 6. Document Middleware Behavior

```typescript
/**
 * Authentication middleware.
 *
 * Reads the `authorization` header and verifies the token.
 * Sets `ctx.userId` and `ctx.userRoles` on successful authentication.
 *
 * @returns Error if:
 * - No authorization header
 * - Invalid token format
 * - Token verification fails
 */
const authMiddleware = t.middleware({
  name: "auth",
  handler: async (ctx, next) => { ... }
})
```

## Common Patterns

### Caching Pattern

```typescript
import { z } from "zod"

const cacheMiddleware = t.middleware({
  name: "cache",
  args: z.object({
    ttl: z.number().default(300000)
  }),
  handler: async (ctx, next) => {
    const key = `${ctx.operation}:${JSON.stringify(ctx.args)}`

    const cached = await ctx.cache.get(key)
    if (cached) return ok(cached)

    const result = await next()
    if (result.ok) {
      await ctx.cache.set(key, result.value, ctx.args.ttl)
    }

    return result
  }
})

const api = createAPI({
  router: t.router({ ... }),
  middleware: [cacheMiddleware]
})
```

### Feature Flag Pattern

```typescript
import { z } from "zod"

const featureFlagMiddleware = t.middleware({
  name: "featureFlag",
  args: z.object({
    flag: z.string()
  }),
  handler: async (ctx, next) => {
    const enabled = await ctx.featureFlags.isEnabled(ctx.args.flag)

    if (!enabled) {
      return err({
        code: "FEATURE_DISABLED",
        message: `Feature '${ctx.args.flag}' is not enabled`
      })
    }

    return next()
  }
})

const api = createAPI({
  router: t.router({ ... }),
  middleware: [featureFlagMiddleware]
})
```

### Metrics Pattern

```typescript
const metricsMiddleware = t.middleware({
  name: "metrics",
  handler: async (ctx, next) => {
    const start = Date.now()

    try {
      const result = await next()

      // Record success metric
      await ctx.metrics.increment(`${ctx.operation}.success`)
      await ctx.metrics.timing(`${ctx.operation}.duration`, Date.now() - start)

      return result
    } catch (error) {
      // Record failure metric
      await ctx.metrics.increment(`${ctx.operation}.error`)
      throw error
    }
  }
})

const api = createAPI({
  router: t.router({ ... }),
  middleware: [metricsMiddleware]
})
```

## Future Considerations

- Middleware priority/ordering
- Conditional middleware application
- Middleware groups
- Built-in middleware (auth, rate limit, cache, metrics)
- Middleware configuration via context
- Async middleware support
- Middleware chaining utilities
