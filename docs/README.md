# @deessejs/server Documentation

`@deessejs/server` is the core API package for the `@deessejs` multi-package architecture. It provides a unified way to define queries and mutations with local execution capabilities.

## Features

- **Queries & Mutations** - Define typed API operations with `t.query()` and `t.mutation()`
- **Context Management** - Define typed context with `defineContext()`
- **Router System** - Hierarchical routing for organized APIs
- **Lifecycle Hooks** - `beforeInvoke`, `onSuccess`, `onError`
- **Aliases** - Multiple names for the same function
- **Cache Invalidation** - Built-in cache management
- **Plugin System** - Extend context with plugins
- **Event System** - `ctx.send()` for emitting events, `t.on()` for listening
- **Local Executor** - In-process execution for server actions

## Packages

| Package | Description |
|---------|-------------|
| `@deessejs/core` | Core types (`success`, `cause`, `AsyncOutcome`) |
| `@deessejs/server` | This package: local API definitions |
| `@deessejs/server/react` | React hooks with cache sync |

## Quick Start

### Define Context

```typescript
import { defineContext } from "@deessejs/server"
import { authPlugin } from "./plugins/auth"
import { cachePlugin } from "./plugins/cache"

const { t, createAPI } = defineContext({
  initialValues: {
    db: myDatabase,
    logger: myLogger,
  },
  plugins: [authPlugin, cachePlugin],
})
```

### Define Query

```typescript
import { success, cause } from "@deessejs/core"

const getUser = t.query({
  args: z.object({ id: z.number() }),
  handler: async (ctx, args) => {
    const user = await ctx.db.users.find(args.id)
    if (!user) {
      return cause({ name: "NOT_FOUND", message: "User not found", data: { id: args.id } })
    }
    return success(user, { keys: [["users", { id: args.id }]] })
  }
})
```

### Define Mutation

```typescript
const createUser = t.mutation({
  args: z.object({ name: z.string(), email: z.string().email() }),
  handler: async (ctx, args) => {
    const user = await ctx.db.users.create(args)
    return success(user, { invalidate: ["users:list", "users:count"] })
  }
})
```

### Create API

```typescript
const api = createAPI({
  router: t.router({
    users: t.router({
      get: getUser,
      create: createUser,
    }),
  }),
})

export { api }
```

### Use in Server Actions

```typescript
import { api } from "./api"

async function getUserAction(id: number) {
  const result = await api.users.get({ id })
  if (result.ok) return result.value
  if (result.error.name === "NOT_FOUND") return null
  throw new Error(result.error.message)
}
```

## Event System

### Emit Events

```typescript
const createUser = t.mutation({
  args: z.object({ name: z.string() }),
  handler: async (ctx, args) => {
    const user = await ctx.db.users.create(args)
    ctx.send("user.created", { userId: user.id, email: user.email })
    return success(user, { invalidate: ["users"] })
  }
})
```

### Listen to Events

```typescript
// Global listener - not attached to a query/mutation
t.on("user.created", async (ctx, args, event) => {
  await ctx.send("notification.send", {
    to: "admin@example.com",
    body: `New user: ${event.data.email}`,
  })
})
```

## Plugin System

Plugins extend the context with additional properties:

```typescript
// plugins/auth.ts
import { Plugin } from "@deessejs/server"

export const authPlugin = {
  name: "auth",
  extend: (ctx) => ({
    userId: null,
    isAuthenticated: false,
  }),
}

// Usage
const { t, createAPI } = defineContext({
  initialValues: { db: myDatabase },
  plugins: [authPlugin],
})
```

## React Integration

See [REACT_HOOKS.md](REACT_HOOKS.md) for the `@deessejs/server/react` package.

```typescript
import { useQuery, useMutation } from "@deessejs/server/react"

function UserList() {
  const { data } = useQuery(api.users.list, { args: { limit: 10 } })
  // Queries automatically cache with keys from server

  return <List users={data} />
}

function CreateUserForm() {
  const { mutate } = useMutation(api.users.create)
  // Mutations automatically invalidate related queries

  return <Form onSubmit={mutate} />
}
```

## Documentation

- [SPEC.md](SPEC.md) - Full API specification
- [PLUGINS.md](PLUGINS.md) - Plugin system details
- [EVENTS.md](EVENTS.md) - Event system details
- [REACT_HOOKS.md](REACT_HOOKS.md) - React hooks integration

## Installation

```bash
pnpm add @deessejs/server @deessejs/core
# or
npm install @deessejs/server @deessejs/core
```
