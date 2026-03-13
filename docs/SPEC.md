# @deessejs/server Specification

## Overview

`@deessejs/server` is the core API package for the `@deessejs` multi-package architecture (RFC #57). It provides a unified way to define queries and mutations with local execution capabilities, designed for server actions, lambdas, workers, and any in-process function calls.

## Project Context

This package is part of a multi-package architecture:
- **@deessejs/core** - Core types and utilities (dependency)
- **@deessejs/server** - This package: local execution and API definitions
- **@deessejs/api** - HTTP layer (future package that will consume this)

## Scope

### Core Features

1. **Query and Mutation Constructors**
   - `query()` - Define read operations that return `AsyncOutcome<T, Cause<CauseData>, Unit>`
   - `mutation()` - Define write operations that return `AsyncOutcome<T, Cause<CauseData>, Unit>`

2. **Context Management**
   - `defineContext<T>()` - Define typed context with runtime initialization
   - `createAPI()` - Create API instance with router and plugins

3. **Router System**
   - Hierarchical routing: `api.users.get()`, `api.posts.create()`
   - Nested routers for organization

4. **Lifecycle Hooks**
   - `beforeInvoke` - Run before query/mutation execution
   - `onSuccess` - Run after successful execution
   - `onError` - Run after failed execution

5. **Aliases**
   - Multiple names for the same function
   - Example: `getUser`, `fetchUser`, `retrieveUser` all point to the same query

6. **Cache Invalidation Stream**
   - `createCacheStream()` - Create a stream for cache management
   - `invalidate()` - Mark queries as stale

7. **Local Executor**
   - `createLocalExecutor()` - Execute queries/mutations in-process
   - No network overhead for server actions

8. **Plugin System**
   - Plugins extend context with additional properties
   - Additional plugin features (queries, mutations, events) coming later

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
function defineContext<T, Plugins extends Plugin<T>[]>(
  config: {
    initialValues: T
    plugins?: Plugins
  }
): {
  t: QueryBuilder<T>
  createAPI: (config: { router: Router }) => API
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
  initialValues: {
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

```typescript
import { ok, err, Result } from "@deessejs/core"

const getUser = t.query({
  args: z.object({
    id: z.number()
  }),
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
import { ok, err, Result } from "@deessejs/core"

const createUser = t.mutation({
  args: z.object({
    name: z.string().min(2),
    email: z.string().email(),
  }),
  handler: async (ctx, args): Result<User, DuplicateEmail> => {
    const existing = await ctx.db.users.findByEmail(args.email)
    if (existing) {
      return err({ code: "DUPLICATE", message: "Email already exists" })
    }

    const user = await ctx.db.users.create(args)
    return ok(user, { invalidate: ["users:list", "users:count"] })
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

### Lifecycle Hooks

```typescript
const getUser = t.query({
  args: z.object({ id: z.number() }),
  handler: async (ctx, args): AsyncOutcome<User> => success({ id: args.id, name: "John" })
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
import { createCacheStream } from "@deessejs/server"

const cacheStream = createCacheStream()

const createUser = t.mutation({
  args: z.object({ name: z.string() }),
  handler: async (ctx, args): AsyncOutcome<User> => {
    const user = await ctx.db.users.create(args)

    cacheStream.invalidate("users.list")

    return success(user)
  }
})
```

### Aliases

```typescript
import { aliases } from "@deessejs/server"

const getUser = t.query({ ... })

aliases(getUser, ["fetchUser", "retrieveUser", "getUserById"])

api.users.get({ id: 1 })
api.users.fetchUser({ id: 1 })
api.users.retrieveUser({ id: 1 })
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
  initialValues: {
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

const result = await executor.execute("users.get", { id: 1 })
```

## Architecture

```
@deessejs/core (peer dependency)
       │
       ▼
@deessejs/server (this package)
       │
       ▼ (exports types)
@deessejs/api (future - HTTP layer)
```

## Why This Package?

This is the heart of the `@deessejs` ecosystem:

- Define queries and mutations once
- Use locally (server actions) or expose via HTTP (@deessejs/api)
- Plugin system for extensibility (queries, mutations, context)
- Built on @deessejs/core patterns (AsyncOutcome<T, Cause, ExceptionData>)

## Future Considerations

- HTTP adapter (@deessejs/api)
- WebSocket support
- Batch execution optimization
- Built-in validation layer
- Rate limiting
- Request/response logging middleware
