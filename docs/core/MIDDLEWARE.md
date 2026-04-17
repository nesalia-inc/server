# Middleware System Specification

## Overview

The middleware system in `@deessejs/server` allows intercepting and modifying requests before they reach handlers. Middleware is applied **globally** via `createAPI()`, enabling cross-cutting concerns like authentication, authorization, logging, and rate limiting.

> **See real implementations:** [@examples/events-example](https://github.com/deessejs/server/tree/main/examples/events-example) contains production-ready middleware patterns for auth, admin, and logging. See `examples/events-example/src/server/routers/users.ts`.
>
> **Basic server:** See [@examples/basic](https://github.com/deessejs/server/tree/main/examples/basic) for a minimal server setup with middleware.
>
> **Next.js integration:** See [@examples/basic-next](https://github.com/deessejs/server/tree/main/examples/basic-next) for middleware in a Next.js application via `@deessejs/server-next`.

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
  handler: (ctx: Ctx, opts: {
    next: (overrides?: { ctx?: Partial<Ctx> }) => Promise<Result<unknown>>;
    args: Args;
    meta: Record<string, unknown>;
  }) => Promise<Result<unknown>>
}
```

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | Unique identifier for the middleware |
| `args` | `Validator` | Optional validator for middleware-specific args |
| `handler` | `(ctx, { next, args, meta }) => Promise<Result>` | Middleware function that calls `next()` to proceed |

> **Note:** Works with Zod, Valibot, ArkType, or any Standard Schema compatible validator.

### Middleware Context

Middleware receives the context and an options object with:

- `ctx` - The full context object
- `next` - Function to proceed to the next middleware/handler. Accepts optional `ctx` overrides.
- `args` - The operation arguments (from the validated input)
- `meta` - Metadata about the request (e.g., `meta.userId` for auth, `meta.procedureName` for logging)

## Usage Examples

> **Quick reference:** Real-world middleware implementations are available in:
> - [@examples/events-example](https://github.com/deessejs/server/tree/main/examples/events-example/src/server/routers/users.ts) - auth, admin, logging
> - [@examples/basic](https://github.com/deessejs/server/tree/main/examples/basic) - minimal server setup
> - [@examples/basic-next](https://github.com/deessejs/server/tree/main/examples/basic-next) - Next.js integration

### Basic Global Middleware

```typescript
const { t, createAPI } = defineContext({
  context: { db: myDatabase }
})

// Define middleware using real patterns from events-example
const authMiddleware = t.middleware({
  name: "auth",
  handler: async (ctx, { next, meta }) => {
    // User ID is passed via meta (typically set by auth handler)
    const userId = meta?.userId as number | undefined;

    if (!userId) {
      return err(error({
        name: "UnauthorizedError",
        message: () => "Not authenticated",
      })({}));
    }

    // Extend context with user - use type assertion since user is dynamically added
    return next({ ctx: { ...ctx, user: { id: userId } } as typeof ctx });
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
  handler: async (ctx, { next, args, meta }) => {
    const procedureName = meta?.procedureName as string || "unknown";
    ctx.logger.log(`[LOGGER] Before ${procedureName} with args:`, args);

    const result = await next({ ctx });

    if (result.ok) {
      ctx.logger.log(`[LOGGER] ${procedureName} succeeded`);
    } else {
      ctx.logger.log(`[LOGGER] ${procedureName} failed:`, result.error);
    }

    return result;
  }
})

const api = createAPI({
  router: t.router({ ... }),
  middleware: [loggingMiddleware]
})
```

### Error Handling Middleware

```typescript
import { error, err } from "@deessejs/fp"

const errorHandlerMiddleware = t.middleware({
  name: "errorHandler",
  handler: async (ctx, { next }) => {
    try {
      return await next({ ctx })
    } catch (err) {
      return err(error({
        name: "InternalError",
        message: () => err instanceof Error ? err.message : "Unknown error",
      })({}));
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
import { error, err } from "@deessejs/fp"

const loggingMiddleware = t.middleware({
  name: "logger",
  handler: async (ctx, { next, args, meta }) => {
    const procedureName = meta?.procedureName as string || "unknown";
    ctx.logger.log(`[LOGGER] Before ${procedureName} with args:`, args);
    const result = await next({ ctx });
    ctx.logger.log(`[LOGGER] ${procedureName} completed:`, result.ok ? "success" : "error");
    return result;
  }
});

const errorHandlerMiddleware = t.middleware({
  name: "errorHandler",
  handler: async (ctx, { next }) => {
    try {
      return await next({ ctx });
    } catch (err) {
      return err(error({
        name: "InternalError",
        message: () => err instanceof Error ? err.message : "Unknown error",
      })({}));
    }
  }
});

const authMiddleware = t.middleware({
  name: "auth",
  handler: async (ctx, { next, meta }) => {
    const userId = meta?.userId as number | undefined;
    if (!userId) {
      return err(error({
        name: "UnauthorizedError",
        message: () => "Not authenticated",
      })({}));
    }
    return next({ ctx: { ...ctx, user: { id: userId } } as typeof ctx });
  }
});

const api = createAPI({
  router: t.router({
    users: {
      get: t.query({ ... }),
      create: t.mutation({ ... }),
    },
  }),
  middleware: [
    // Logging middleware (runs first)
    loggingMiddleware,
    // Error handling middleware (runs second)
    errorHandlerMiddleware,
    // Auth middleware (runs third)
    authMiddleware,
  ]
})
```

### Middleware with Options

Create configurable middleware with args:

```typescript
import { z } from "zod"
import { error, err } from "@deessejs/fp"

const rateLimitMiddleware = t.middleware({
  name: "rateLimit",
  args: z.object({
    maxRequests: z.number().default(100),
    windowMs: z.number().default(60000),
  }),
  handler: async (ctx, { next, args, meta }) => {
    const clientId = meta?.clientId as string || "unknown";
    const now = Date.now()
    const { maxRequests, windowMs } = args

    let record = rateLimitStore.get(clientId)

    if (!record || record.resetAt < now) {
      record = { count: 0, resetAt: now + windowMs }
      rateLimitStore.set(clientId, record)
    }

    record.count++

    if (record.count > maxRequests) {
      return err(error({
        name: "RateLimitError",
        message: () => `Rate limit exceeded. Try again in ${Math.ceil((record.resetAt - now) / 1000)} seconds`,
      })({}));
    }

    return next({ ctx });
  }
})

const api = createAPI({
  router: t.router({ ... }),
  middleware: [rateLimitMiddleware]
})
```

### Server-Side Only Middleware

For `internalQuery` and `internalMutation`, use meta information to detect non-server calls:

```typescript
import { error, err } from "@deessejs/fp"

const serverOnlyMiddleware = t.middleware({
  name: "serverOnly",
  handler: async (ctx, { next, meta }) => {
    // Check if this is a direct server call via meta
    const isServerCall = meta?.isServer === true;

    if (!isServerCall) {
      return err(error({
        name: "ForbiddenError",
        message: () => "This operation is only available server-side",
      })({}));
    }

    return next({ ctx });
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
  handler: async (ctx, { next }) => {
    await ctx.db.config.get("setting1")  // DB call
    await ctx.db.config.get("setting2")  // Another DB call
    return next({ ctx })
  }
})

// Better: Use Plugins to inject resources, not middleware
// Middleware should only be for CONTROL logic (auth, rate limit)
// Heavy operations belong in Plugins or the handler itself
```

> **Best Practice:** Use **Plugins** for resource injection (DB, Config) and **Middleware** only for control logic (Auth, Rate Limit, Caching).

## Per-Procedure Middleware with `.use()`

Middleware can be applied to individual procedures using `.use()`:

```typescript
import { error, err } from "@deessejs/fp"

// Define middleware
const authMiddleware = t.middleware({
  name: "auth",
  handler: async (ctx, { next, meta }) => {
    const userId = meta?.userId as number | undefined;
    if (!userId) {
      return err(error({
        name: "UnauthorizedError",
        message: () => "Not authenticated",
      })({}));
    }
    return next({ ctx: { ...ctx, user: { id: userId } } as typeof ctx });
  },
});

const adminMiddleware = t.middleware({
  name: "admin",
  handler: async (ctx, { next }) => {
    const user = (ctx as any).user;
    if (!user?.isAdmin) {
      return err(error({
        name: "ForbiddenError",
        message: () => "Admin access required",
      })({}));
    }
    return next({ ctx });
  },
});

const loggingMiddleware = t.middleware({
  name: "logger",
  handler: async (ctx, { next, args, meta }) => {
    const procedureName = meta?.procedureName as string || "unknown";
    ctx.logger.log(`[LOGGER] Before ${procedureName}`);
    const result = await next({ ctx });
    ctx.logger.log(`[LOGGER] ${procedureName} completed`);
    return result;
  },
});

// Apply middleware to a specific query
const getUser = t.query({
  handler: async (ctx) => { ... },
}).use(authMiddleware);

// Chain multiple middleware with .use()
const adminListUsers = t.query({
  handler: async (ctx) => { ... },
})
  .use(loggingMiddleware)
  .use(authMiddleware)
  .use(adminMiddleware);
```

### Execution Order with `.use()`

Middleware chained with `.use()` executes in order from left to right:

```typescript
const procedure = t.query({ handler: async (ctx) => { ... } })
  .use(firstMiddleware)  // 1. Runs first
  .use(secondMiddleware) // 2. Runs second
  .use(thirdMiddleware)   // 3. Runs third
// Handler executes last
```

### Global Middleware Execution Order

Global middleware applied via `createAPI({ middleware: [...] })` executes in the order defined:

```typescript
const api = createAPI({
  router: t.router({
    users: {
      get: t.query({ ... }),
    },
  }),
  middleware: [
    // 1. First middleware (outermost)
    t.middleware({
      name: "first",
      handler: async (ctx, { next }) => {
        console.log("1. First middleware")
        return next({ ctx })
      }
    }),

    // 2. Second middleware
    t.middleware({
      name: "second",
      handler: async (ctx, { next }) => {
        console.log("2. Second middleware")
        return next({ ctx })
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
import { ok, err, error } from "@deessejs/fp"

const cacheMiddleware = t.middleware({
  name: "cache",
  handler: async (ctx, { next, args, meta }) => {
    const procedureName = meta?.procedureName as string || "unknown";

    // Generate cache key from procedure name and args
    const cacheKey = `${procedureName}:${JSON.stringify(args)}`

    // Check cache
    const cached = await ctx.cache.get(cacheKey)
    if (cached) {
      // Return cached result without calling next()
      return ok(cached)
    }

    // Execute handler
    const result = await next({ ctx })

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

## Reusable Protected Procedures with `withQuery` and `withMutation`

The `withQuery` and `withMutation` helpers from `@deessejs/server` create reusable procedure creators that wrap procedures with middleware. This is useful for creating "protected" queries and mutations that require authentication or authorization.

### Basic Usage

```typescript
import { withQuery, withMutation } from "@deessejs/server"

// Create a protected query by wrapping with authMiddleware
const authQuery = withQuery((q) => q.use(authMiddleware));

// Create a protected mutation
const authMutation = withMutation((m) => m.use(authMiddleware));

// Apply to procedures
const getCurrentUser = authQuery(
  t.query({
    handler: async (ctx) => { ... },
  })
);

const updateProfile = authMutation(
  t.mutation({
    handler: async (ctx, args) => { ... },
  })
);
```

### Chaining Multiple Middleware

Use `withMutation` composition to chain multiple middleware:

```typescript
// Admin mutation with auth + admin middleware
// authMiddleware runs first, then adminMiddleware
const adminMutation = withMutation((m) =>
  m.use(adminMiddleware).use(authMiddleware)
);

// Apply to procedure
const deleteUser = adminMutation(
  t.mutation({
    handler: async (ctx, args) => { ... },
  })
);
```

### withQuery/withMutation Signatures

```typescript
// Apply middleware to a query directly
withQuery(query, middleware)

// Apply middleware to a query using curried form
withQuery((q) => q.use(middleware))

// Apply middleware to a mutation directly
withMutation(mutation, middleware)

// Apply middleware to a mutation using curried form
withMutation((m) => m.use(middleware))
```

### Real Example from events-example

See [@examples/events-example](https://github.com/deessejs/server/tree/main/examples/events-example/src/server/routers/users.ts) for complete middleware implementations including auth, admin, and logging patterns:

From `examples/events-example/src/server/routers/users.ts`:

```typescript
import { withQuery, withMutation } from "@deessejs/server";
import { error, err, ok } from "@deessejs/fp";

// Define middleware
const authMiddleware = t.middleware({
  name: "auth",
  handler: async (ctx, { next, meta }) => {
    const userId = meta?.userId as number | undefined;
    if (!userId) {
      return err(error({
        name: "UnauthorizedError",
        message: () => "Not authenticated",
      })({}));
    }
    return next({ ctx: { ...ctx, user: { id: userId } } as typeof ctx });
  },
});

const adminMiddleware = t.middleware({
  name: "admin",
  handler: async (ctx, { next }) => {
    const user = (ctx as any).user;
    if (!user?.isAdmin) {
      return err(error({
        name: "ForbiddenError",
        message: () => "Admin access required",
      })({}));
    }
    return next({ ctx });
  },
});

// Create reusable protected procedure creators
const authQuery = withQuery((q) => q.use(authMiddleware));
const authMutation = withMutation((m) => m.use(authMiddleware));
const adminMutation = withMutation((m) => m.use(adminMiddleware).use(authMiddleware));

// Use in router
export const usersRouter = t.router({
  // Public procedure
  list: t.query({ handler: async (ctx) => ok([...ctx.db.users]) }),

  // Protected procedures
  getCurrentUser: authQuery(
    t.query({
      handler: async (ctx) => {
        const user = (ctx as any).user;
        return ok(ctx.db.users.find((u: any) => u.id === user.id));
      },
    })
  ),

  // Admin-only procedure (requires both auth and admin)
  adminDeleteUser: adminMutation(
    t.mutation({
      handler: async (ctx, args) => { ... },
    })
  ),
});
```

## Type Safety

### Middleware with Typed Context

```typescript
type AuthContext = {
  user: { id: number; isAdmin?: boolean } | null
  logger: { log: (...args: unknown[]) => void }
}

const authMiddleware = t.middleware({
  name: "auth",
  handler: async (ctx: AuthContext, { next, meta }) => {
    // Full type safety for context
    const userId = meta?.userId as number | undefined;
    if (!userId) {
      return err(error({ name: "UnauthorizedError", message: () => "Not authenticated" })({}));
    }
    ctx.user = { id: userId }; // Type-safe assignment

    return next({ ctx });
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
  handler: async (ctx, { next, args }) => {
    // args is typed with Zod
    args.maxRequests // number
    args.windowMs // number

    return next({ ctx });
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
import { error, err } from "@deessejs/fp"

const safeMiddleware = t.middleware({
  name: "safe",
  handler: async (ctx, { next }) => {
    try {
      return await next({ ctx })
    } catch (err) {
      // Handle errors gracefully
      ctx.logger.log("Middleware error:", err)
      return err(error({
        name: "MiddlewareError",
        message: () => "An error occurred in middleware"
      })({}));
    }
  }
})
```

### Error Propagation

```typescript
import { error, err } from "@deessejs/fp"

const authMiddleware = t.middleware({
  name: "auth",
  handler: async (ctx, { next, meta }) => {
    // Don't catch errors - let them propagate
    // This allows error handling middleware to handle them
    const userId = meta?.userId as number | undefined;
    if (!userId) {
      return err(error({
        name: "UnauthorizedError",
        message: () => "Not authenticated"
      })({}));
    }
    return next({ ctx });
  }
})

const errorHandlerMiddleware = t.middleware({
  name: "errorHandler",
  handler: async (ctx, { next }) => {
    try {
      return await next({ ctx });
    } catch (err) {
      // Handle any unhandled errors
      return err(error({
        name: "InternalError",
        message: () => err instanceof Error ? err.message : "Unknown error"
      })({}));
    }
  }
})

// Use both - auth runs first, then error handler catches any errors
const api = createAPI({
  router: t.router({ ... }),
  middleware: [errorHandlerMiddleware, authMiddleware]
})
```

## Testing Middleware

### Unit Testing Middleware

```typescript
import { defineContext, createAPI, t } from "@deessejs/server"
import { ok, err, error } from "@deessejs/fp" // See /deesse-fp for Result patterns

describe("authMiddleware", () => {
  const { t } = defineContext({
    context: { db: mockDb }
  })

  const authMiddleware = t.middleware({
    name: "auth",
    handler: async (ctx, { next, meta }) => {
      const userId = meta?.userId as number | undefined;
      if (!userId) {
        return err(error({
          name: "UnauthorizedError",
          message: () => "Missing user ID"
        })({}));
      }
      return next({ ctx: { ...ctx, user: { id: userId } } as typeof ctx });
    }
  })

  it("should call next when userId is present", async () => {
    const mockCtx = {
      db: mockDb,
      logger: { log: vi.fn() },
    }

    const mockMeta = { userId: 123 };

    const next = vi.fn(() => ok({ id: 1 }))

    const result = await authMiddleware.handler(mockCtx, { next, args: {}, meta: mockMeta })

    expect(next).toHaveBeenCalled()
    expect(result.ok).toBe(true)
  })

  it("should return error when userId is missing", async () => {
    const mockCtx = {
      db: mockDb,
      logger: { log: vi.fn() },
    }

    const next = vi.fn()

    const result = await authMiddleware.handler(mockCtx, { next, args: {}, meta: {} })

    expect(next).not.toHaveBeenCalled()
    expect(result.ok).toBe(false)
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
    expect(logger.log).toHaveBeenCalled()
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
  handler: async (ctx, { next, meta }) => { ... }
})

const loggingMiddleware = t.middleware({
  name: "logging",
  handler: async (ctx, { next }) => { ... }
})

// Avoid: Multiple responsibilities
const authAndLoggingMiddleware = t.middleware({
  name: "authAndLogging",
  handler: async (ctx, { next, meta }) => {
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
handler: async (ctx, { next, meta }) => {
  if (meta?.skip) {
    return next({ ctx }) // Explicitly proceed
  }
  return next({ ctx })
}

// Good: Short-circuit when needed
handler: async (ctx, { next, args }) => {
  const cached = await ctx.cache.get(key)
  if (cached) return ok(cached) // Short-circuit

  return next({ ctx }) // Proceed to handler
}

// Bad: Forgetting to return next
handler: async (ctx, { next }) => {
  ctx.userId = 123
  next() // Missing return - can cause issues
}
```

### 4. Handle Errors Properly

```typescript
// Good: Catch and handle errors
handler: async (ctx, { next }) => {
  try {
    return await next({ ctx })
  } catch (error) {
    return err(error({
      name: "Error",
      message: () => error.message
    })({}));
  }
}

// Good: Let errors propagate for centralized handling
handler: async (ctx, { next, meta }) => {
  // No try-catch - let error handling middleware handle it
  return next({ ctx });
}
```

### 5. Order Matters

Put global middleware in logical order:

```typescript
// Good: Logical order
middleware: [
  loggingMiddleware,        // 1. Log first (outermost)
  errorHandlerMiddleware,   // 2. Handle errors
  rateLimitMiddleware,       // 3. Rate limit
  authMiddleware,           // 4. Authenticate last (innermost)
]
```

### 6. Document Middleware Behavior

```typescript
/**
 * Authentication middleware.
 *
 * Checks meta.userId for authentication.
 * Sets ctx.user with the authenticated user on success.
 *
 * @returns Error if:
 * - No userId in meta
 * - User not found in database
 */
const authMiddleware = t.middleware({
  name: "auth",
  handler: async (ctx, { next, meta }) => { ... }
})
```

## Common Patterns

> **See live examples:** [@examples/events-example](https://github.com/deessejs/server/tree/main/examples/events-example/src/server/routers/users.ts) demonstrates caching, feature flags, and metrics patterns in real code.

### Caching Pattern

```typescript
import { z } from "zod"
import { ok, err, error } from "@deessejs/fp"

const cacheMiddleware = t.middleware({
  name: "cache",
  args: z.object({
    ttl: z.number().default(300000)
  }),
  handler: async (ctx, { next, args, meta }) => {
    const procedureName = meta?.procedureName as string || "unknown";
    const key = `${procedureName}:${JSON.stringify(args)}`

    const cached = await ctx.cache.get(key)
    if (cached) return ok(cached)

    const result = await next({ ctx })
    if (result.ok) {
      await ctx.cache.set(key, result.value, args.ttl)
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
import { err, error } from "@deessejs/fp"

const featureFlagMiddleware = t.middleware({
  name: "featureFlag",
  args: z.object({
    flag: z.string()
  }),
  handler: async (ctx, { next, args, meta }) => {
    const enabled = await ctx.featureFlags.isEnabled(args.flag)

    if (!enabled) {
      return err(error({
        name: "FeatureDisabledError",
        message: () => `Feature '${args.flag}' is not enabled`
      })({}));
    }

    return next({ ctx });
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
  handler: async (ctx, { next, meta }) => {
    const procedureName = meta?.procedureName as string || "unknown";
    const start = Date.now()

    try {
      const result = await next({ ctx })

      // Record success metric
      await ctx.metrics.increment(`${procedureName}.success`)
      await ctx.metrics.timing(`${procedureName}.duration`, Date.now() - start)

      return result
    } catch (error) {
      // Record failure metric
      await ctx.metrics.increment(`${procedureName}.error`)
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
