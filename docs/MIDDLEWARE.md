# Middleware System Specification

## Overview

The middleware system in `@deessejs/server` allows intercepting and modifying requests before they reach handlers. Middleware can be applied globally or to specific routes, enabling cross-cutting concerns like authentication, authorization, logging, and rate limiting.

## Core Concepts

### Middleware Function

Middleware is a function that wraps a handler execution. It receives the context, arguments, and a `next` function that continues execution to the next middleware or the handler itself.

### Middleware Types

1. **Operation Middleware** - Applied to specific queries or mutations
2. **Global Middleware** - Applied to all operations in the API

## API Reference

### Creating Middleware: `t.middleware()`

```typescript
type Middleware<Ctx, Args = unknown> = {
  name: string
  args?: ZodSchema<Args>
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
| `args` | `ZodSchema` | Optional Zod schema for validating middleware-specific args |
| `handler` | `(ctx, next) => Result` | Middleware function that calls `next()` to proceed |

### Middleware Context

Middleware receives an extended context with access to:

- `ctx` - The full context object
- `ctx.args` - The operation arguments (modifiable)
- `ctx.headers` - Request headers
- `ctx.operation` - The operation being executed

## Usage Examples

### Basic Middleware

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

// Apply to specific query
const getUser = t.query({
  args: z.object({ id: z.number() }),
  middleware: authMiddleware,
  handler: async (ctx, args) => {
    // ctx.userId is available here
    const user = await ctx.db.users.find(args.id)
    return ok(user)
  }
})
```

### Global Middleware

Apply middleware to all operations in the API:

```typescript
const api = createAPI({
  router: t.router({
    users: t.router({
      get: getUser,
      create: createUser,
    }),
  }),
  middleware: [
    // Logging middleware
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

    // Error handling middleware
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
  ]
})
```

### Middleware with Options

Create configurable middleware with args:

```typescript
const requireRole = (role: string) => t.middleware({
  name: `require-${role}`,
  args: z.object({
    requiredRole: z.string()
  }),
  handler: async (ctx, next) => {
    const hasRole = ctx.userRoles.includes(ctx.args.requiredRole)

    if (!hasRole) {
      return err({ code: "FORBIDDEN", message: `Required role: ${ctx.args.requiredRole}` })
    }

    return next()
  }
})

// Use with args
const deleteUser = t.mutation({
  args: z.object({ id: z.number() }),
  middleware: requireRole("admin"),
  handler: async (ctx, args) => { ... }
})
```

### Middleware Chain

Apply multiple middleware to a single operation:

```typescript
// Multiple middleware on single operation
const secureGetUser = t.query({
  args: z.object({ id: z.number() }),
  middleware: [authMiddleware, rateLimitMiddleware, loggingMiddleware],
  handler: async (ctx, args) => { ... }
})
```

### Context Enhancement

Use middleware to add resources to context:

```typescript
// Extend context with database connection
const withDatabase = t.middleware({
  name: "withDatabase",
  handler: async (ctx, next) => {
    const db = await connectToDatabase()
    ctx.db = db
    try {
      return await next()
    } finally {
      await db.disconnect()
    }
  }
})

const getUser = t.query({
  args: z.object({ id: z.number() }),
  middleware: withDatabase,
  handler: async (ctx, args) => {
    // ctx.db is connected
    const user = await ctx.db.users.find(args.id)
    return ok(user)
  }
})
```

### Authentication Middleware

```typescript
// middleware/auth.ts
export const authMiddleware = t.middleware({
  name: "auth",
  handler: async (ctx, next) => {
    const authHeader = ctx.headers.get("authorization")

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return err({ code: "UNAUTHORIZED", message: "Missing or invalid token" })
    }

    const token = authHeader.substring(7)

    try {
      // Verify token and get user
      const user = await verifyToken(token)
      ctx.userId = user.id
      ctx.userRoles = user.roles

      return next()
    } catch (error) {
      return err({ code: "UNAUTHORIZED", message: "Invalid token" })
    }
  }
})
```

### Rate Limiting Middleware

```typescript
// middleware/rateLimit.ts
const rateLimitStore = new Map<string, { count: number; resetAt: number }>()

export const rateLimitMiddleware = t.middleware({
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

    // Add rate limit info to headers
    ctx.headers.set("x-rate-limit-remaining", String(maxRequests - record.count))
    ctx.headers.set("x-rate-limit-reset", String(record.resetAt))

    return next()
  }
})
```

### Validation Middleware

```typescript
// middleware/validation.ts
export const validateRequestMiddleware = t.middleware({
  name: "validateRequest",
  args: z.object({
    schema: z.any(), // Zod schema
  }),
  handler: async (ctx, next) => {
    const { schema } = ctx.args

    try {
      // Validate args against schema
      ctx.args = schema.parse(ctx.args)
      return next()
    } catch (error) {
      if (error instanceof z.ZodError) {
        return err({
          code: "VALIDATION_ERROR",
          message: "Invalid request parameters",
          details: error.errors,
        })
      }
      return err({ code: "VALIDATION_ERROR", message: "Validation failed" })
    }
  }
})
```

### Composing Middleware

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

// Combine for specific operations
const protectedAndLogged = [withAuth, withLogging]

const getUser = t.query({
  args: z.object({ id: z.number() }),
  middleware: protectedAndLogged,
  handler: async (ctx, args) => { ... }
})
```

### Execution Order

Middleware executes in a predictable order:

1. **Global middleware** - Runs first, in order
2. **Operation middleware** - Runs after global, in order

```typescript
// Global middleware (runs first)
const globalMiddleware = t.middleware({
  name: "global",
  handler: async (ctx, next) => {
    console.log("1. Global middleware")
    return next()
  }
})

// Operation middleware (runs after)
const operationMiddleware = t.middleware({
  name: "operation",
  handler: async (ctx, next) => {
    console.log("2. Operation middleware")
    return next()
  }
})

const api = createAPI({
  router: t.router({ ... }),
  middleware: [globalMiddleware]
})

const getUser = t.query({
  args: z.object({ id: z.number() }),
  middleware: operationMiddleware,
  handler: async (ctx, args) => {
    console.log("3. Handler")
    return ok({ id: args.id })
  }
})

// Output when calling getUser:
// 1. Global middleware
// 2. Operation middleware
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
const rateLimitMiddleware = t.middleware({
  name: "rateLimit",
  args: z.object({
    maxRequests: z.number().min(1).max(1000),
    windowMs: z.number().min(1000).max(3600000),
  }),
  handler: async (ctx, next) => {
    // ctx.args is typed with Zod schema
    ctx.args.maxRequests // number
    ctx.args.windowMs // number

    return next()
  }
})
```

### Applying Typed Middleware

```typescript
type Ctx = {
  db: Database
  userId: number | null
}

// Middleware typed with context
const authMiddleware = t.middleware<Ctx>({
  name: "auth",
  handler: async (ctx, next) => {
    ctx.userId = Number(ctx.headers.get("x-user-id"))
    return next()
  }
})

// Apply to query - TypeScript ensures ctx is properly extended
const getUser = t.query<Ctx>({
  args: z.object({ id: z.number() }),
  middleware: authMiddleware,
  handler: async (ctx, args) => {
    // ctx has all Ctx properties plus userId from middleware
    const user = await ctx.db.users.find(args.id)
    return ok(user)
  }
})
```

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
const getUser = t.query({
  args: z.object({ id: z.number() }),
  middleware: [authMiddleware, errorHandlerMiddleware],
  handler: async (ctx, args) => { ... }
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

  it("should apply operation-specific middleware", async () => {
    const result = await executor.execute("users.create", {
      name: "John",
      email: "john@example.com"
    })

    // Auth middleware should have run
    expect(result.ok).toBe(true)
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
const cacheMiddleware = t.middleware({
  name: "cache",
  args: z.object({
    ttl: z.number().default(300000),
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
```

### Feature Flag Pattern

```typescript
const featureFlagMiddleware = t.middleware({
  name: "featureFlag",
  args: z.object({
    flag: z.string(),
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
```

## Future Considerations

- Middleware priority/ordering
- Conditional middleware application
- Middleware groups
- Built-in middleware (auth, rate limit, cache, metrics)
- Middleware configuration via context
- Async middleware support
- Middleware chaining utilities
