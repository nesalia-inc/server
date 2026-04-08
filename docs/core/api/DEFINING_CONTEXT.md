# defineContext

Creates a typed context with a query builder for defining procedures. This is the entry point for setting up your API.

## Signature

```typescript
function defineContext<Ctx, Plugins extends Plugin<Ctx>[]>(
  config: {
    context: Ctx
    plugins?: Plugins
    events?: EventRegistry
  }
): {
  t: QueryBuilder<Ctx>
  createAPI: (config: { router: Router; middleware?: Middleware<Ctx>[] }) => APIInstance<Ctx>
}
```

## Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `config.context` | `Ctx` | The base context object (database, logger, etc.) |
| `config.plugins` | `Plugins` | Optional array of plugins to extend context |
| `config.events` | `EventRegistry` | Optional event registry for typed events |

## Returns

| Return | Type | Description |
|--------|------|-------------|
| `t` | `QueryBuilder<Ctx>` | Query builder for defining procedures |
| `createAPI` | `function` | Factory function to create an API instance |

## Basic Usage

```typescript
import { defineContext } from "@deessejs/server"

const { t, createAPI } = defineContext({
  context: {
    db: myDatabase,
    logger: console,
  },
})
```

## Complete Example

```typescript
import { defineContext } from "@deessejs/server"
import { authPlugin } from "./plugins/auth"
import { cachePlugin } from "./plugins/cache"

const { t, createAPI } = defineContext({
  context: {
    db: myDatabase,
    logger: console,
    userId: null,
  },
  plugins: [authPlugin, cachePlugin],
  events: {
    "user.created": { data: { id: "number", email: "string" } },
    "user.deleted": { data: { id: "number" } },
  },
})
```

## Context Typing

The context is fully typed, so you get autocomplete and type safety throughout your handlers.

```typescript
type Context = {
  db: Database
  logger: Logger
  userId: string | null
}

const { t, createAPI } = defineContext<Context>({
  context: {
    db: myDatabase,
    logger: console,
    userId: null,
  },
})

// Handler has typed access to context
const getUser = t.query({
  args: z.object({ id: z.number() }),
  handler: async (ctx, args) => {
    // ctx.db is typed as Database
    // ctx.logger is typed as Logger
    // ctx.userId is typed as string | null
    const user = await ctx.db.users.find(args.id)
    return ok(user)
  },
})
```

## With Plugins

Plugins extend the context with additional properties.

```typescript
import { defineContext, plugin } from "@deessejs/server"

const authPlugin = plugin({
  name: "auth",
  extend: (ctx) => ({
    userId: null,
    isAuthenticated: false,
    getUserId: () => ctx.userId,
    setUserId: (userId: string) => { ctx.userId = userId },
  }),
})

const { t, createAPI } = defineContext({
  context: {
    db: myDatabase,
  },
  plugins: [authPlugin],
})

// Context now includes plugin properties
const createPost = t.mutation({
  args: z.object({ title: z.string(), content: z.string() }),
  handler: async (ctx, args) => {
    // ctx has userId, isAuthenticated, getUserId, setUserId
    if (!ctx.isAuthenticated) {
      return err({ code: "UNAUTHORIZED", message: "Must be logged in" })
    }
    const post = await ctx.db.posts.create({
      ...args,
      authorId: ctx.userId,
    })
    return ok(post)
  },
})
```

## With Events

Define typed events for decoupled communication.

```typescript
import { defineContext, defineEvents } from "@deessejs/server"

const { t, createAPI } = defineContext({
  context: {
    db: myDatabase,
  },
  events: defineEvents({
    "user.created": {
      data: { id: "number", email: "string" },
    },
    "post.published": {
      data: { id: "number", title: "string" },
    },
  }),
})

// Emit events from handlers
const createUser = t.mutation({
  args: z.object({ name: z.string(), email: z.string().email() }),
  handler: async (ctx, args) => {
    const user = await ctx.db.users.create(args)
    ctx.send("user.created", { id: user.id, email: user.email })
    return ok(user)
  },
})

// Listen to events globally
t.on("user.created", async (ctx, args, event) => {
  await ctx.db.notifications.create({
    type: "welcome",
    userId: event.data.id,
  })
})
```

## Creating the API

After defining procedures, create the API instance:

```typescript
const api = createAPI({
  router: t.router({
    users: {
      get: t.query({ ... }),
      create: t.mutation({ ... }),
    },
    posts: {
      list: t.query({ ... }),
      get: t.query({ ... }),
      create: t.mutation({ ... }),
    },
  }),
})

export { api }
```

## Context in Handlers

The context is available as the first parameter in all handlers:

```typescript
// Query handler
t.query({
  args: z.object({ id: z.number() }),
  handler: async (ctx, args) => {
    // ctx = { db, logger, userId, ... }
    return ok(await ctx.db.users.find(args.id))
  },
})

// Mutation handler
t.mutation({
  args: z.object({ name: z.string() }),
  handler: async (ctx, args) => {
    // ctx = { db, logger, userId, ... }
    const user = await ctx.db.users.create(args)
    return ok(user)
  },
})

// Internal query handler
t.internalQuery({
  handler: async (ctx) => {
    // ctx = { db, logger, userId, ... }
    return ok({ total: await ctx.db.users.count() })
  },
})
```

## See Also

- [API.md](../API.md) - Complete API reference
- [T_QUERY_BUILDER.md](./T_QUERY_BUILDER.md) - Query builder methods
- [CREATE_API.md](./CREATE_API.md) - API creation functions
- [../../features/PLUGINS.md](../../features/PLUGINS.md) - Plugin system
- [../../features/EVENTS.md](../../features/EVENTS.md) - Event system
