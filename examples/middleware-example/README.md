# Middleware Example

This example demonstrates the middleware system in `@deessejs/server`.

## Middleware Patterns Demonstrated

### 1. Auth Middleware (`authMiddleware`)
Authentication middleware that checks for a user in the context (`ctx.user`). This middleware is used to protect procedures that require authentication.

```typescript
export const authMiddleware = t.middleware({
  name: "auth",
  handler: async (ctx, { next }) => {
    const authCtx = ctx as typeof ctx & AuthenticatedContext;
    if (!authCtx.user) {
      return { ok: false, error: UnauthorizedError({}) };
    }
    return next({ ctx: authCtx as typeof ctx });
  },
});
```

### 2. Admin Middleware (`adminMiddleware`)
Authorization middleware that checks if the authenticated user has admin role (`user.role === 'admin'`).

```typescript
export const adminMiddleware = t.middleware({
  name: "admin",
  handler: async (ctx, { next }) => {
    const authCtx = ctx as typeof ctx & AuthenticatedContext;
    if (authCtx.user?.role !== "admin") {
      return { ok: false, error: ForbiddenError({}) };
    }
    return next({ ctx: authCtx as typeof ctx });
  },
});
```

### 3. Logging Middleware (`loggingMiddleware`)
Observability middleware that logs before and after procedure execution with timing information.

```typescript
export const loggingMiddleware = t.middleware({
  name: "logger",
  handler: async (ctx, { next, args, meta }) => {
    const procedureName = (meta as any)?.procedureName || "unknown";
    const startTime = Date.now();
    ctx.logger.log(`[LOGGER] -> ${procedureName} called with:`, args);
    const result = await next({ ctx });
    const duration = Date.now() - startTime;
    ctx.logger.log(`[LOGGER] <- ${procedureName} succeeded in ${duration}ms`);
    return result;
  },
});
```

### 4. Validation Middleware (`validationMiddleware`)
Input validation middleware that validates arguments against a Zod schema before the handler runs.

```typescript
export function validationMiddleware(schema: z.ZodSchema) {
  return t.middleware({
    name: "validation",
    handler: async (ctx, { next, args }) => {
      const result = schema.safeParse(args);
      if (!result.success) {
        return { ok: false, error: ValidationError({...}) };
      }
      return next({ ctx });
    },
  });
}
```

### 5. Rate Limit Middleware (`rateLimitMiddleware`)
Rate limiting middleware that tracks requests per user and blocks when the limit is exceeded.

```typescript
export const rateLimitMiddleware = t.middleware({
  name: "rateLimit",
  handler: async (ctx, { next, meta }) => {
    // Tracks requests per userId, blocks after 10 per minute
    // ...
  },
});
```

## Application Patterns

### Using `.use()` to Chain Middleware

```typescript
const adminProcedure = t.query({
  handler: async (ctx) => { /* ... */ },
})
  .use(loggingMiddleware)   // runs first
  .use(authMiddleware)      // runs second
  .use(adminMiddleware);     // runs third
```

### Using `withQuery()` and `withMutation()` Helpers

```typescript
// Curried form - creates reusable middleware factory
const protectedQuery = withQuery((q) => q.use(authMiddleware));

// Apply to a query
const getMyProfile = protectedQuery(
  t.query({ handler: async (ctx) => { /* ... */ } })
);

// Chain multiple middleware
const adminMutation = withMutation(
  (m) => m.use(adminMiddleware).use(authMiddleware)
);
```

### Global Middleware with `createAPI`

```typescript
export const api = createAPI({
  router: appRouter,
  // Global middleware runs on ALL procedures
  middleware: [
    // telemetryMiddleware,
    // globalRateLimitMiddleware,
  ],
});
```

## Running the Example

```bash
# Install dependencies
pnpm install

# Run the example
pnpm start
```

## Project Structure

```
middleware-example/
├── package.json
├── tsconfig.json
└── src/
    └── server/
        ├── main.ts          # Entry point - runs all demos
        ├── context.ts      # Context definition
        ├── middleware.ts   # Middleware definitions
        ├── procedures.ts   # Procedure definitions
        ├── api.ts          # API export
        └── routers/
            └── index.ts     # Router aggregation
```

## Key Takeaways

1. **Middleware is created with `t.middleware()`** - Returns a middleware object with a name and handler function.

2. **Middleware can modify context** - Use `next({ ctx: newCtx })` to pass a modified context to the next middleware/handler.

3. **Middleware order matters** - `.use(mw1).use(mw2)` runs `mw1` first, then `mw2`.

4. **`withQuery()` and `withMutation()` helpers** - Create reusable middleware factories for common patterns.

5. **Global middleware via `createAPI()`** - Apply middleware to all procedures at once.

6. **Note on `meta`** - In HTTP deployments, `meta` is populated from request headers/cookies. In direct API calls (like this example), `meta` is empty, so some procedures show auth errors.
