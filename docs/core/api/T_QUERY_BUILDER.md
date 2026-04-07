# Query Builder (`t`)

The `t` object returned by `defineContext` provides methods for defining procedures. It is the primary interface for building your API.

## Overview

```typescript
const { t, createAPI } = defineContext({
  context: { db: myDatabase },
})

// t provides methods for defining procedures:
t.query()           // Public read operations
t.mutation()        // Public write operations
t.internalQuery()    // Private read operations
t.internalMutation() // Private write operations
t.router()          // Hierarchical routing
t.middleware()      // Middleware
t.on()              // Register event listeners
```

---

## `t.query(config)`

Defines a public read operation. Callable via HTTP and from server code.

### Signature

```typescript
t.query<Args, Output>(config: {
  args?: Schema
  handler: (ctx: Ctx, args: Args) => Promise<Result<Output>>
}): Query<Ctx, Args, Output>
```

### Example

```typescript
const getUser = t.query({
  args: z.object({ id: z.number() }),
  handler: async (ctx, args) => {
    const user = await ctx.db.users.find(args.id)
    if (!user) return err({ code: "NOT_FOUND", message: "User not found" })
    return ok(user)
  },
})
```

### Security

| Callable via HTTP | Callable from Server |
|-------------------|---------------------|
| ✅ Yes | ✅ Yes |

---

## `t.mutation(config)`

Defines a public write operation. Callable via HTTP and from server code.

### Signature

```typescript
t.mutation<Args, Output>(config: {
  args?: Schema
  handler: (ctx: Ctx, args: Args) => Promise<Result<Output>>
}): Mutation<Ctx, Args, Output>
```

### Example

```typescript
const createUser = t.mutation({
  args: z.object({
    name: z.string(),
    email: z.string().email(),
  }),
  handler: async (ctx, args) => {
    const existing = await ctx.db.users.findByEmail(args.email)
    if (existing) {
      return err({ code: "DUPLICATE", message: "Email already exists" })
    }
    const user = await ctx.db.users.create(args)
    return ok(user)
  },
})
```

### Security

| Callable via HTTP | Callable from Server |
|-------------------|---------------------|
| ✅ Yes | ✅ Yes |

---

## `t.internalQuery(config)`

Defines a private read operation. Only callable from server code, NOT exposed via HTTP.

### Signature

```typescript
t.internalQuery<Args, Output>(config: {
  handler: (ctx: Ctx, args: Args) => Promise<Result<Output>>
}): InternalQuery<Ctx, Args, Output>
```

### Example

```typescript
const getAdminStats = t.internalQuery({
  handler: async (ctx) => {
    // Only accessible from server - safe from HTTP attacks
    const totalUsers = await ctx.db.users.count()
    const revenue = await ctx.db.orders.sum()
    return ok({ totalUsers, revenue })
  },
})
```

### Security

| Callable via HTTP | Callable from Server |
|-------------------|---------------------|
| ❌ No | ✅ Yes |

### Use Cases

- Admin operations
- Scheduled tasks
- Webhook handlers
- Internal reporting

---

## `t.internalMutation(config)`

Defines a private write operation. Only callable from server code, NOT exposed via HTTP.

### Signature

```typescript
t.internalMutation<Args, Output>(config: {
  handler: (ctx: Ctx, args: Args) => Promise<Result<Output>>
}): InternalMutation<Ctx, Args, Output>
```

### Example

```typescript
const deleteUser = t.internalMutation({
  args: z.object({ id: z.number() }),
  handler: async (ctx, args) => {
    // Only server code can delete users
    await ctx.db.users.delete(args.id)
    return ok({ success: true })
  },
})
```

### Security

| Callable via HTTP | Callable from Server |
|-------------------|---------------------|
| ❌ No | ✅ Yes |

---

## `t.router(routes)`

Creates a hierarchical router for organizing procedures.

### Signature

```typescript
t.router(routes: Router): Router
```

### Example

```typescript
const api = createAPI({
  router: t.router({
    users: t.router({
      get: t.query({ ... }),
      create: t.mutation({ ... }),
      list: t.query({ ... }),
      delete: t.internalMutation({ ... }), // internal
    }),
    posts: t.router({
      get: t.query({ ... }),
      create: t.mutation({ ... }),
      list: t.query({ ... }),
      publish: t.mutation({ ... }),
    }),
  }),
})

// Access via: api.users.get(), api.posts.list(), etc.
```

### Nested Routers

You can nest routers arbitrarily deep:

```typescript
t.router({
  admin: t.router({
    users: t.router({
      stats: t.internalQuery({ ... }),
      delete: t.internalMutation({ ... }),
    }),
  }),
})
```

---

## `t.middleware(config)`

Creates a middleware for intercepting requests. Middleware is applied globally via `createAPI()`.

### Signature

```typescript
t.middleware<Args>(config: {
  name: string
  args?: unknown
  handler: (ctx: Ctx & { args: Args; meta: Record<string, unknown> }, next: () => Promise<Result<any>>) => Promise<Result<any>>
}): Middleware<Ctx, Args>
```

### Example

```typescript
const authMiddleware = t.middleware({
  name: "auth",
  handler: async (ctx, next) => {
    if (!ctx.userId) {
      return err({ code: "UNAUTHORIZED", message: "Not authenticated" })
    }
    return next()
  },
})

// Apply globally via createAPI
const api = createAPI({
  router: t.router({
    users: {
      get: t.query({ ... }),
    },
  }),
  middleware: [authMiddleware],
})
```

---

## `t.on(event, handler)`

Registers a global event listener. Listeners are called when events are emitted via `ctx.send()`.

### Signature

```typescript
t.on<EventName extends string, EventData>(
  event: EventName,
  handler: (ctx: Ctx, event: { name: string; data: EventData }) => void | Promise<void>
): void
```

### Example

```typescript
// Register a listener for user.created events
t.on("user.created", async (ctx, event) => {
  await ctx.db.notifications.create({
    type: "welcome",
    userId: event.data.id,
    email: event.data.email,
  })
})
```

---

## Lifecycle Hooks

Query and mutation operations support chaining lifecycle hooks.

### `.beforeInvoke(handler)`

Runs before the handler executes.

```typescript
.beforeInvoke((ctx, args) => void | Promise<void>)
```

### `.afterInvoke(handler)`

Runs after the handler executes (always).

```typescript
.afterInvoke((ctx, args, result) => void | Promise<void>)
```

### `.onSuccess(handler)`

Runs after successful handler execution.

```typescript
.onSuccess((ctx, args, data) => void | Promise<void>)
```

### `.onError(handler)`

Runs after failed handler execution.

```typescript
.onError((ctx, args, error) => void | Promise<void>)
```

### Example with Hooks

```typescript
const getUser = t.query({
  args: z.object({ id: z.number() }),
  handler: async (ctx, args) => { ... },
})
  .beforeInvoke((ctx, args) => {
    console.log(`Fetching user ${args.id}`)
  })
  .onSuccess((ctx, args, data) => {
    console.log(`User fetched: ${data.id}`)
  })
  .onError((ctx, args, error) => {
    console.error(`Failed to fetch user: ${error.message}`)
  })
```

---

## Security Model

| Operation | Callable via HTTP | Callable from Server |
|-----------|-------------------|---------------------|
| `t.query()` | ✅ Yes | ✅ Yes |
| `t.mutation()` | ✅ Yes | ✅ Yes |
| `t.internalQuery()` | ❌ No | ✅ Yes |
| `t.internalMutation()` | ❌ No | ✅ Yes |

---

## See Also

- [DEFINING_CONTEXT.md](./DEFINING_CONTEXT.md) - Entry point for defineContext
- [CREATE_API.md](./CREATE_API.md) - API creation functions
- [../CACHE.md](../CACHE.md) - Cache system
- [../MIDDLEWARE.md](../MIDDLEWARE.md) - Middleware system
