# @deessejs/server Documentation

`@deessejs/server` is the core API package for the `@deessejs` multi-package architecture. It provides a unified way to define queries and mutations with secure execution capabilities.

## Security Note

**Server Actions in Next.js are not secure** - they are exposed via HTTP and can be called by anyone. This package solves this by separating:

- **`query` / `mutation`** - Public operations, exposed via HTTP through a Next.js route handler
- **`internalQuery` / `internalMutation`** - Internal operations, only callable from server-side code

This ensures that sensitive operations (admin actions, privileged mutations) remain secure.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Your Next.js App                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────────────────┐         ┌─────────────────────┐      │
│   │   Server Code       │         │   HTTP Exposure     │      │
│   │   (components,       │         │   (route handler)   │      │
│   │    server actions)  │         │                     │      │
│   │                     │         │   POST /api/users   │      │
│   │   api.users.get()   │────────►│   POST /api/tasks   │      │
│   │   api.tasks.list()  │         │                     │      │
│   │                     │         │   Only PUBLIC      │      │
│   │   Can call PUBLIC   │         │   routes exposed   │      │
│   │   AND INTERNAL      │         │                     │      │
│   └─────────────────────┘         └─────────────────────┘      │
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │              @deessejs/server                           │   │
│   │                                                         │   │
│   │   query() ──────────────► Exposed via HTTP             │   │
│   │   mutation() ──────────► Exposed via HTTP             │   │
│   │                                                         │   │
│   │   internalQuery() ──────► Only callable from server   │   │
│   │   internalMutation() ────► Only callable from server   │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Features

- **Queries & Mutations** - Define typed API operations with `t.query()` and `t.mutation()`
- **Internal Operations** - Secure server-only operations with `t.internalQuery()` and `t.internalMutation()`
- **Context Management** - Define typed context with `defineContext()`
- **Router System** - Hierarchical routing for organized APIs
- **Lifecycle Hooks** - `beforeInvoke`, `onSuccess`, `onError`
- **Aliases** - Multiple names for the same function
- **Cache Invalidation** - Built-in cache management
- **Plugin System** - Extend context with plugins
- **Event System** - `ctx.send()` for emitting events, `t.on()` for listening
- **HTTP Exposure** - Expose public routes via Next.js route handler

## Packages

| Package | Description |
|---------|-------------|
| `@deessejs/core` | Core types (`Result`) |
| `@deessejs/server` | This package: local API definitions |
| `@deessejs/server/react` | React hooks with cache sync |

## Quick Start

### Define Context

```typescript
import { defineContext } from "@deessejs/server"
import { authPlugin } from "./plugins/auth"
import { cachePlugin } from "./plugins/cache"

const { t, createAPI } = defineContext({
  context: {
    db: myDatabase,
    logger: myLogger,
  },
  plugins: [authPlugin, cachePlugin],
})
```

### Define Query

The handler return type is flexible - `Result` is optional to give room for future changes.

```typescript
import { ok, err, Result } from "@deessejs/core"

const getUser = t.query({
  args: z.object({ id: z.number() }),
  handler: async (ctx, args): Result<WithCacheKeys<User, ["users", { id: number }]>, NotFound> => {
    const user = await ctx.db.users.find(args.id)
    if (!user) {
      return err({ code: "NOT_FOUND", message: "User not found" })
    }
    return ok(user, { keys: [["users", { id: args.id }]] })
  }
})
```

### Define Mutation

```typescript
const createUser = t.mutation({
  args: z.object({ name: z.string(), email: z.string().email() }),
  handler: async (ctx, args) => {
    const user = await ctx.db.users.create(args)
    return ok(user, { invalidate: ["users:list", "users:count"] })
  }
})
```

### Define Internal Operations

Internal operations are only callable from server-side code, not exposed via HTTP:

```typescript
// Internal query - only callable from server code
const getAdminStats = t.internalQuery({
  args: z.object({}),
  handler: async (ctx, args) => {
    // Only runs on server - safe from HTTP attacks
    return ok({
      totalUsers: await ctx.db.users.count(),
      revenue: await ctx.db.orders.sum(),
    })
  }
})

// Internal mutation - only callable from server code
const deleteUser = t.internalMutation({
  args: z.object({ id: z.number() }),
  handler: async (ctx, args) => {
    // Only server code can delete users
    await ctx.db.users.delete(args.id)
    return ok({ success: true })
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
      // Internal operations are part of the router
      // but not exposed via HTTP
      getAdminStats: getAdminStats,
      delete: deleteUser,
    }),
  }),
})

export { api }
```

### Create Client-Safe API

Create a separate API that only exposes public operations. This provides TypeScript safety to prevent calling internal operations from client code:

```typescript
import { createPublicAPI } from "@deessejs/server"

// Creates a client-safe API with only query and mutation
const clientApi = createPublicAPI(api)

export { api, clientApi }
```

### Usage: Server vs Client

```typescript
// ===== SERVER CODE (Server Components, Server Actions) =====
// app/users/page.tsx (Server Component)
import { api } from "@/server/api"

export default async function UsersPage() {
  // Can call ALL operations (public + internal)
  const users = await api.users.get({})
  const stats = await api.users.getAdminStats({})    // ✅ Works
  await api.users.delete({ id: 1 })                  // ✅ Works
}

// ===== CLIENT CODE (Client Components) =====
// app/components/UserList.tsx (Client Component)
"use client"
import { clientApi } from "@/server/api"

async function UserList() {
  // Can only call PUBLIC operations
  const users = await clientApi.users.get({})       // ✅ Works
  await clientApi.users.create({ name: "John" })    // ✅ Works

  // TypeScript error - internal operations don't exist!
  const stats = await clientApi.users.getAdminStats({})  // ❌ TS Error
  await clientApi.users.delete({ id: 1 })               // ❌ TS Error
}
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

## Expose via Next.js Route Handler

Create a route handler to expose only public operations via HTTP:

```typescript
// app/(deesse)/api/[...slug]/route.ts
import { createRouteHandler } from "@deessejs/server/next"
import { api, clientApi } from "@/server/api"

export const POST = createRouteHandler(clientApi)
```

This creates an HTTP endpoint that only exposes `query` and `mutation` operations. Internal operations (`internalQuery`, `internalMutation`) remain private and can only be called from server-side code.

### With better-auth

You can combine multiple route handlers in the same route group:

```typescript
// app/(deesse)/api/[...slug]/route.ts - @deessejs/server
import { createRouteHandler } from "@deessejs/server/next"
import { clientApi } from "@/server/api"

export const POST = createRouteHandler(clientApi)
```

```typescript
// app/(deesse)/api/[...route]/route.ts - better-auth
import { auth } from "@/lib/auth"
import { toNextJsHandler } from "better-auth/next-js"

export const { POST, GET } = toNextJsHandler(auth)
```

### Usage from Client

```typescript
// Call via HTTP from client
const response = await fetch("/api/users.get", {
  method: "POST",
  body: JSON.stringify({ args: { id: 123 } }),
})
const result = await response.json()
```

### Usage from Server

```typescript
// Call from server components, server actions, or internal functions
const result = await api.users.get({ id: 123 })

// Can also call internal operations from server
const stats = await api.users.getAdminStats({}) // Works - internal
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
  context: { db: myDatabase },
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
- [QUERIES.md](QUERIES.md) - Complete guide to queries
- [MUTATIONS.md](MUTATIONS.md) - Complete guide to mutations
- [PLUGINS.md](PLUGINS.md) - Plugin system details
- [EXTENSIONS.md](EXTENSIONS.md) - Extension system (auth, cache, logging, jobs)
- [EVENTS.md](EVENTS.md) - Event system details
- [REACT_HOOKS.md](REACT_HOOKS.md) - React hooks integration
- [NEXTJS.md](NEXTJS.md) - Next.js integration with automatic cache revalidation

## Installation

```bash
pnpm add @deessejs/server @deessejs/core
# or
npm install @deessejs/server @deessejs/core
```
