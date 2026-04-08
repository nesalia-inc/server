# @deessejs/server Specification

## Overview

`@deessejs/server` is a **modern functional-first RPC protocol** implementation. It provides type-safe remote procedure calls with a clean, composable API designed for performance and developer experience. Define your procedures once, call them locally or remotely with the same typed interface.

## Project Context

This package is part of a multi-package architecture:
- **@deessejs/core** - Core types and utilities (`Result`, `ok()`, `err()`)
- **@deessejs/server** - This package: functional RPC protocol implementation
- **@deessejs/server/react** - React hooks integration

## Scope

### Core Features

1. **Query and Mutation Constructors**
   - `query()` - Define public read operations, exposed via HTTP
   - `mutation()` - Define public write operations, exposed via HTTP

2. **Internal Operations**
   - `internalQuery()` - Define private read operations, server-side only
   - `internalMutation()` - Define private write operations, server-side only

3. **Context Management**
   - `defineContext<T>()` - Define typed context with runtime initialization
   - `createAPI()` - Create API instance with router and plugins

4. **Router System**
   - Hierarchical routing: `api.users.get()`, `api.posts.create()`
   - Nested routers for organization

5. **Lifecycle Hooks**
   - `beforeInvoke` - Run before query/mutation execution
   - `onSuccess` - Run after successful execution
   - `onError` - Run after failed execution

6. **Cache System**
   - `defineCacheKeys()` - Create typed cache key registry
   - Query returns `WithMetadata<T, Keys>` with cache keys
   - Mutation returns invalidation keys
   - Full TypeScript support for key autocomplete and type checking

7. **Route Handler**
   - `createRouteHandler()` - Create Next.js route handler for HTTP exposure
   - Only exposes `query` and `mutation` operations
   - `internalQuery` and `internalMutation` remain private

8. **Public API**
   - `createPublicAPI(api)` - Create client-safe API with only public operations
   - Provides TypeScript safety to prevent calling internal operations from client code

9. **Plugin System**
   - Plugins extend context with additional properties
   - Additional plugin features (queries, mutations, events) coming later

10. **Middleware System**
    - `t.middleware()` - Create middleware for intercepting requests
    - Apply to specific queries/mutations or globally via `createAPI()`
    - Middleware chains for multiple middleware per operation
    - Context enhancement and request modification

11. **Lifecycle Hooks**
    - `beforeInvoke` - Run before handler execution
    - `afterInvoke` - Run after handler execution (always)
    - `onSuccess` - Run after successful handler execution
    - `onError` - Run after handler throws or returns error

## Dependencies

- **@deessejs/core** - Required peer dependency
  - Provides: `Result` type

## Requirements

1. Support new API: `createAPI({ router: t.router(...), plugins: [...] })`
2. Plugin system with hooks for cache invalidation
3. Plugins can extend context with additional properties
4. Local executor for in-process calls (server actions)
5. Export types for @deessejs/api to use
6. Include comprehensive tests

## Type Definitions

### Result Pattern

```typescript
import { ok, err, Result } from "@deessejs/core"

type Result<Success, Error = { code: string; message: string }> =
  | { ok: true; value: Success }
  | { ok: false; error: Error }

// With cache keys for queries
type WithCacheKeys<T, Keys extends CacheKey[]> = T & { keys: Keys }

type CacheKey = string | Record<string, unknown>

// Helper functions
ok(value, options?)  // returns { ok: true, value, keys? }
err(error)          // returns { ok: false, error }
```

### Context Definition

```typescript
function defineContext<T, Plugins extends Plugin<T>[], Events extends EventRegistry>(
  config: {
    context: T
    plugins?: Plugins
    events?: Events
  }
): {
  t: QueryBuilder<T>
  createAPI: (config: { router: Router }) => API
}
```

**EventRegistry** provides type safety for events:

```typescript
type EventRegistry = {
  [eventName: string]: {
    data?: unknown
    response?: unknown
  }
}
```

### Plugin Structure

```typescript
type Plugin<Ctx> = {
  name: string
  extend: (ctx: Ctx) => Partial<Ctx>
}
```

## Usage Examples

### Installation

```bash
pnpm add @deessejs/server @deessejs/core
# or
npm install @deessejs/server @deessejs/core
```

### Define Context

```typescript
import { defineContext } from "@deessejs/server"

type Context = {
  db: Database
  logger: Logger
  userId: string | null
}

const { t, createAPI } = defineContext({
  context: {
    db: myDatabase,
    logger: myLogger,
    userId: null,
  }
})

// Then create API with router
const api = createAPI({
  router: t.router({ ... })
})
```

### Define Query

The handler can return a `Result` (with `ok`/`err`), but for queries that return cache metadata, use `withMetadata`.

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

// Handler can also return plain ok() (Result is optional)
const getUserSimple = t.query({
  args: z.object({
    id: z.number()
  }),
  handler: async (ctx, args) => {
    return ok(await ctx.db.users.find(args.id))
  }
})
```

### Define Internal Query

Internal queries are only callable from server-side code, not exposed via HTTP:

```typescript
const getAdminStats = t.internalQuery({
  // No args needed - omit entirely
  handler: async (ctx): Result<AdminStats> => {
    // Only accessible from server - safe from HTTP attacks
    const totalUsers = await ctx.db.users.count()
    const revenue = await ctx.db.orders.sum()
    return ok({ totalUsers, revenue })
  }
})
```

### Define Mutation

```typescript
import { z } from "zod"
import { ok, err } from "@deessejs/core"
import { withMetadata } from "@deessejs/server"
import { keys } from "./cache/keys"

const createUser = t.mutation({
  args: z.object({
    name: z.string().min(2),
    email: z.string().email()
  }),
  handler: async (ctx, args) => {
    const existing = await ctx.db.users.findByEmail(args.email)
    if (existing) {
      return err({ code: "DUPLICATE", message: "Email already exists" })
    }

    const user = await ctx.db.users.create(args)
    return withMetadata(user, { invalidate: [keys.users.list(), keys.users.count()] })
  }
})
```

### Using in Server Actions

```typescript
// app/actions.ts
"use server"

import { api } from "./server"

async function getUserAction(id: number) {
  const result = await api.users.get({ id })

  if (result.ok) {
    return result.value
  }

  if (result.error.name === "NOT_FOUND") {
    return null
  }

  throw new Error(result.error.message)
}

async function createUserAction(data: { name: string; email: string }) {
  const result = await api.users.create(data)

  if (result.ok) {
    return result.value
  }

  throw new Error(result.error.message)
}
```

### Using Internal Operations

Internal operations can only be called from server-side code:

```typescript
// app/admin/page.tsx (Server Component)
import { api } from "@/server/api"

export default async function AdminPage() {
  // Internal operations work from server code
  const stats = await api.users.getAdminStats({})
  const user = await api.users.get({ id: 1 })

  return <Dashboard stats={stats} user={user} />
}

// app/actions/admin.ts (Server Action)
"use server"

import { api } from "@/server/api"

async function deleteUserAction(id: number) {
  // Internal mutation - only callable from server
  const result = await api.users.delete({ id })

  if (!result.ok) {
    throw new Error(result.error.message)
  }

  return result.value
}
```

### Expose via Next.js Route Handler

Create a route handler to expose only public operations via HTTP:

```typescript
// app/(deesse)/api/[...slug]/route.ts
import { createRouteHandler } from "@deessejs/server-next"
import { client } from "@/server/api"

export const POST = createRouteHandler(client)
```

### With better-auth

You can combine multiple route handlers:

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

### Create Client-Safe API

For TypeScript safety, create a separate client API that only exposes public operations:

```typescript
import { createPublicAPI } from "@deessejs/server"

// Full API for server usage
const api = createAPI({
  router: t.router({
    users: t.router({
      get: getUser,
      create: createUser,
      delete: deleteUser,           // internal
      getAdminStats: getAdminStats, // internal
    }),
  }),
})

// Client-safe API (only public operations)
const client = createPublicAPI(api)

export { api, client }
```

**Server code** uses `api` (full access):
```typescript
// app/admin/page.tsx
import { api } from "@/server/api"

const stats = await api.users.getAdminStats({})  // ✅ Works
await api.users.delete({ id: 1 })                  // ✅ Works
```

**Client code** uses `client` (public only):
```typescript
// app/components/UserList.tsx
"use client"
import { client } from "@/server/api"

const users = await client.users.get({})       // ✅ Works
await client.users.create({ name: "John" })    // ✅ Works

// TypeScript error - not available on client!
const stats = await client.users.getAdminStats({})  // ❌ TS Error
await client.users.delete({ id: 1 })                // ❌ TS Error
```

This creates HTTP endpoints for all public `query` and `mutation` operations. Internal operations are NOT exposed.

**Request format:**

```bash
POST /api/users.get
Content-Type: application/json

{ "args": { "id": 123 } }
```

**Response format:**

```json
{ "ok": true, "value": { ... } }
// or
{ "ok": false, "error": { "code": "NOT_FOUND", "message": "..." } }
```

### Lifecycle Hooks

```typescript
import { z } from "zod"

const getUser = t.query({
  args: z.object({
    id: z.number()
  }),
handler: async (ctx, args) => ok({ id: args.id, name: "John" })
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

### Cache Invalidation

```typescript
import { z } from "zod"

// Note: createCacheStream is not implemented yet
// const cacheStream = createCacheStream()

const createUser = t.mutation({
  args: z.object({
    name: z.string()
  }),
  handler: async (ctx, args) => {
    const user = await ctx.db.users.create(args)

    // Note: cacheStream.invalidate() is not implemented yet

    return ok(user)
  }
})
```

### Plugin System

Plugins extend the context with additional properties. Each plugin can add new properties to `ctx`.

```typescript
type Plugin<Ctx> = {
  name: string
  extend: (ctx: Ctx) => Partial<Ctx>
}
```

**Example: Auth Plugin**

```typescript
// plugins/auth.ts
import { Plugin } from "@deessejs/server"

export const authPlugin: Plugin<Context> = {
  name: "auth",

  extend: (ctx) => ({
    // Add userId to context
    userId: null,
    // Add auth helpers
    getUserId: () => ctx.userId,
    setUserId: (userId: string) => { ctx.userId = userId },
  })
}
```

**Example: Cache Plugin**

```typescript
// plugins/cache.ts
import { Plugin } from "@deessejs/server"

export const cachePlugin: Plugin<Context> = {
  name: "cache",

  extend: (ctx) => ({
    cache: {
      get: (key: string) => { ... },
      set: (key: string, value: unknown) => { ... },
      delete: (key: string) => { ... },
    }
  })
}
```

**Using Plugins**

```typescript
import { defineContext, Plugin } from "@deessejs/server"
import { authPlugin } from "./plugins/auth"
import { cachePlugin } from "./plugins/cache"

type BaseContext = {
  db: Database
  logger: Logger
}

// Define context with plugins
const { t, createAPI } = defineContext({
  context: {
    db: myDatabase,
    logger: myLogger,
  },
  plugins: [
    authPlugin,
    cachePlugin,
  ],
})

const api = createAPI({
  router: t.router({ ... })
})

// ctx now has: db, logger, userId, getUserId, setUserId, cache
```

**Note:** Plugins can only extend context for now. Additional plugin features (queries, mutations, event handlers) will be documented later.

### Local Executor (for Testing)

```typescript
import { createLocalExecutor } from "@deessejs/server"

const executor = createLocalExecutor(api)

// Execute public operations
const result = await executor.execute("users.get", { id: 1 })

// Internal operations can also be executed locally
const stats = await executor.execute("users.getAdminStats", {})
```

## Architecture

```
@deessejs/core (peer dependency)
       │
       ▼
@deessejs/server (functional RPC protocol)
       │
       ├── Local Transport (direct function calls)
       │
       └── HTTP Transport (JSON over HTTP)
```

## Why This Package?

Drpc reimagines RPC for the modern stack:

- **Functional First** - Pure functions as procedures, no classes or configuration objects
- **Dual Execution** - Same API for local calls (server actions, lambdas, workers) and remote calls (HTTP)
- **Type Safety** - Full TypeScript inference from schema definition to client call
- **Security**: Separate public vs internal operations
- Plugin system for extensibility (context, lifecycle hooks)
- Built on @deessejs/core patterns (Result type with `ok`/`err`)

## Security Model

The key insight is that **Server Actions in Next.js are not secure** - they are exposed via HTTP and can be called by anyone. This package provides a solution:

| Operation Type | Callable via HTTP | Callable from Server |
|---------------|-------------------|---------------------|
| `query()` | ✅ Yes | ✅ Yes |
| `mutation()` | ✅ Yes | ✅ Yes |
| `internalQuery()` | ❌ No | ✅ Yes |
| `internalMutation()` | ❌ No | ✅ Yes |

This ensures sensitive operations remain protected:

```typescript
// Public - can be called from client via HTTP
const getPublicData = t.query({ ... })

// Public - can be called from client via HTTP
const createPost = t.mutation({ ... })

// Internal - only server code can call this
const deleteUser = t.internalMutation({ ... })

// Internal - only server code can call this
const getAdminStats = t.internalQuery({ ... })
```

## Future Considerations

- HTTP adapter (@deessejs/api)
- WebSocket support
- Batch execution optimization
- Built-in validation layer
- Rate limiting
- Request/response logging middleware
