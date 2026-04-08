# @deessejs/server Documentation

`@deessejs/server` is a **modern functional-first RPC protocol** implementation. It provides type-safe remote procedure calls with a clean, composable API designed for performance and developer experience.

## Philosophy

**Functional First RPC** - Every operation is a first-class function. No classes, no configuration objects, just pure intent:

```typescript
import { z } from "zod"

// Define once, call anywhere
const getUser = t.query({
  args: z.object({
    id: z.number()
  }),
  handler: async (ctx, args) => ...
})

// Local call (server actions, lambdas, workers)
const user = await api.users.get({ id: 1 })

// Remote call (HTTP)
const user = await client.users.get({ id: 1 })
```

## Security Model

Drpc separates operations by security level:

- **`query` / `mutation`** - Public operations, callable via HTTP
- **`internalQuery` / `internalMutation`** - Internal operations, only callable from server-side code

This ensures sensitive operations (admin actions, privileged mutations) remain protected.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Your Application                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────────────────┐         ┌─────────────────────┐      │
│   │   Local Calls       │         │   HTTP Transport     │      │
│   │   (Server Actions,  │         │   (Route Handler)   │      │
│   │    Lambdas, Workers)│         │                     │      │
│   │                     │         │   POST /rpc/users   │      │
│   │   api.users.get()   │────────►│   POST /rpc/tasks   │      │
│   │   api.tasks.list()  │         │                     │      │
│   │                     │         │   Only PUBLIC      │      │
│   │   Can call PUBLIC   │         │   routes exposed   │      │
│   │   AND INTERNAL      │         │                     │      │
│   └─────────────────────┘         └─────────────────────┘      │
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                   @deessejs/server                       │   │
│   │                                                         │   │
│   │   query() ──────────────► Exposed via HTTP             │   │
│   │   mutation() ───────────► Exposed via HTTP              │   │
│   │                                                         │   │
│   │   internalQuery() ──────► Only callable locally        │   │
│   │   internalMutation() ───► Only callable locally        │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Features

- **Functional RPC** - Pure functions as first-class RPC procedures
- **Dual Execution** - Same API for local (in-process) and remote (HTTP) calls
- **Internal Operations** - Secure server-only operations with `t.internalQuery()` and `t.internalMutation()`
- **Type Safety** - Full TypeScript inference from schema to client
- **Context Management** - Define typed context with `defineContext()`
- **Router System** - Hierarchical routing: `api.users.get()`, `api.posts.create()`
- **Lifecycle Hooks** - `beforeInvoke`, `onSuccess`, `onError`
- **Cache Invalidation** - Built-in cache key registry with invalidation
- **Plugin System** - Extend context with plugins
- **Event System** - `ctx.send()` for emitting events, `t.on()` for listening
- **Multi-Transport** - HTTP/JSON out of the box, pluggable transports

## Packages

| Package | Description |
|---------|-------------|
| `@deessejs/core` | Core types (`Result`, `ok()`, `err()`) |
| `@deessejs/server` | This package: functional RPC definitions |
| `@deessejs/server/react` | React hooks integration |

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

```typescript
import { z } from "zod"
import { ok, err } from "@deessejs/core"
import { withMetadata } from "@deessejs/server"
import { keys } from "./cache/keys"

const getUser = t.query({
  args: z.object({
    id: z.number()
  }),
  handler: async (ctx, args) => {
    const user = await ctx.db.users.find(args.id)
    if (!user) {
      return err({ code: "NOT_FOUND", message: "User not found" })
    }
    return withMetadata(user, { keys: [keys.users.byId(args.id)] })
  }
})
```

### Define Mutation

```typescript
import { z } from "zod"
import { ok } from "@deessejs/core"
import { withMetadata } from "@deessejs/server"
import { keys } from "./cache/keys"

const createUser = t.mutation({
  args: z.object({
    name: z.string(),
    email: z.string().email()
  }),
  handler: async (ctx, args) => {
    const user = await ctx.db.users.create(args)
    return withMetadata(user, { invalidate: [keys.users.list(), keys.users.count()] })
  }
})
```

### Define Internal Operations

Internal operations are only callable from server-side code, not exposed via HTTP:

```typescript
import { z } from "zod"
import { ok } from "@deessejs/core"

// Internal query - only callable from server code
const getAdminStats = t.internalQuery({
  // No args needed - omit entirely
  handler: async (ctx) => {
    // Only runs on server - safe from HTTP attacks
    return ok({
      totalUsers: await ctx.db.users.count(),
      revenue: await ctx.db.orders.sum(),
    })
  }
})

// Internal mutation - only callable from server code
const deleteUser = t.internalMutation({
  args: z.object({
    id: z.number()
  }),
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
const client = createPublicAPI(api)

export { api, client }
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
import { client } from "@/server/api"

async function UserList() {
  // Can only call PUBLIC operations
  const users = await client.users.get({})       // ✅ Works
  await client.users.create({ name: "John" })    // ✅ Works

  // TypeScript error - internal operations don't exist!
  const stats = await client.users.getAdminStats({})  // ❌ TS Error
  await client.users.delete({ id: 1 })               // ❌ TS Error
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
import { createRouteHandler } from "@deessejs/server-next"
import { api, client } from "@/server/api"

export const POST = createRouteHandler(client)
```

This creates an HTTP endpoint that only exposes `query` and `mutation` operations. Internal operations (`internalQuery`, `internalMutation`) remain private and can only be called from server-side code.

### With better-auth

You can combine multiple route handlers in the same route group:

```typescript
// app/(deesse)/api/[...slug]/route.ts - @deessejs/server
import { createRouteHandler } from "@deessejs/server-next"
import { client } from "@/server/api"

export const POST = createRouteHandler(client)
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
import { z } from "zod"
import { ok } from "@deessejs/core"
import { withMetadata } from "@deessejs/server"

const createUser = t.mutation({
  args: z.object({
    name: z.string()
  }),
  handler: async (ctx, args) => {
    const user = await ctx.db.users.create(args)
    ctx.send("user.created", { userId: user.id, email: user.email })
    return withMetadata(user, { invalidate: ["users"] })
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
import { plugin } from "@deessejs/server"

export const authPlugin = plugin({
  name: "auth",
  extend: (ctx) => ({
    userId: null,
    isAuthenticated: false,
  }),
})

// Usage
const { t, createAPI } = defineContext({
  context: { db: myDatabase },
  plugins: [authPlugin],
})
```

## React Integration

See [integration/REACT_HOOKS.md](integration/REACT_HOOKS.md) for the `@deessejs/server/react` package.

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

### Overview
- [SPEC.md](SPEC.md) - Full API specification

### Core
- [core/QUERIES.md](core/QUERIES.md) - Queries definition
- [core/MIDDLEWARE.md](core/MIDDLEWARE.md) - Middleware system
- [core/CACHE.md](core/CACHE.md) - Cache system

### Features
- [features/CLIENT.md](features/CLIENT.md) - Client system (useQuery, useMutation, cache sync)
- [features/VALIDATION.md](features/VALIDATION.md) - Multi-engine validation
- [features/PLUGINS.md](features/PLUGINS.md) - Plugin system
- [features/EVENTS.md](features/EVENTS.md) - Event system
- [features/LIFECYCLE.md](features/LIFECYCLE.md) - Lifecycle hooks

### Integration
- [integration/NEXTJS.md](integration/NEXTJS.md) - Next.js integration
- [integration/REACT_HOOKS.md](integration/REACT_HOOKS.md) - React hooks

### Advanced
- [advanced/BATCHING.md](advanced/BATCHING.md) - Request batching
- [advanced/ASYNC_CONTEXT.md](advanced/ASYNC_CONTEXT.md) - AsyncLocalStorage
- [advanced/SERIALIZATION.md](advanced/SERIALIZATION.md) - Serialization
- [advanced/METADATA.md](advanced/METADATA.md) - Metadata
- [advanced/ERROR_HTTP_STATUS.md](advanced/ERROR_HTTP_STATUS.md) - Error HTTP status

## Installation

```bash
pnpm add @deessejs/server @deessejs/core
# or
npm install @deessejs/server @deessejs/core
```
