# Cache System Specification

## Overview

The cache system allows queries to return cached results and mutations to trigger cache invalidation. Each query result carries metadata containing cache keys that identify what data was fetched.

## Core Types

### WithMetadata

```typescript
type CacheKey = string | Record<string, unknown>

type WithMetadata<T, Keys extends CacheKey[]> = {
  data: T
  keys: Keys
  ttl?: number // Time to live in milliseconds
}
```

## Typed Key Registry

To ensure type safety, define your cache keys as a registry type. This prevents typos and provides autocomplete.

### Define Registry

```typescript
// cache/keys.ts
import { defineCacheKeys } from "@deessejs/server"

// Define all cache keys for your app
const keys = defineCacheKeys({
  // User keys
  users: {
    _root: "users",
    list: (params?: { page?: number; limit?: number }) => ["users", "list", params],
    count: () => ["users", "count"],
    byId: (id: number) => ["users", { id }],
    search: (query: string) => ["users", "search", { q: query }],
  },

  // Task keys
  tasks: {
    _root: "tasks",
    list: () => ["tasks", "list"],
    byId: (id: number) => ["tasks", { id }],
    byUser: (userId: number) => ["tasks", "byUser", { userId }],
  },

  // Config keys
  config: {
    _root: "config",
    app: () => ["config", "app"],
  },
})

export { keys }
```

### Use in Queries

```typescript
import { z } from "zod"
import { ok, err } from "@deessejs/core"
import { withMetadata } from "@deessejs/server"
import { t } from "../context"
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

    // Type-safe cache keys
    return withMetadata(user, {
      keys: [keys.users.byId(args.id)]
    })
  }
})

const listUsers = t.query({
  args: z.object({
    page: z.number().default(1),
    limit: z.number().default(10)
  }),
  handler: async (ctx, args) => {
    const users = await ctx.db.users.findMany({ ... })

    return withMetadata(users, {
      keys: [
        keys.users.list({ page: args.page, limit: args.limit }),
        keys.users.count(),
      ]
    })
  }
})
```

### Use in Mutations

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

    return withMetadata(user, {
      invalidate: [
        keys.users.list(),
        keys.users.count(),
      ]
    })
  }
})

const updateUser = t.mutation({
  args: z.object({
    id: z.number(),
    name: z.string()
  }),
  handler: async (ctx, args) => {
    const user = await ctx.db.users.update({
      where: { id: args.id },
      data: { name: args.name }
    })

    return withMetadata(user, {
      invalidate: [
        keys.users.byId(args.id),
        keys.users.list(),
      ]
    })
  }
})

const deleteUser = t.mutation({
  args: z.object({
    id: z.number()
  }),
  handler: async (ctx, args) => {
    await ctx.db.users.delete({ where: { id: args.id } })

    return withMetadata({ id: args.id }, {
      invalidate: [
        keys.users.byId(args.id),
        keys.users.list(),
        keys.users.count(),
      ]
    })
  }
})
```

### TypeScript Benefits

With a typed registry, you get:

1. **Autocomplete** - IDE suggests valid keys
2. **Type checking** - Invalid keys cause TypeScript errors
3. **Refactoring** - Rename keys safely

```typescript
// Autocomplete works!
keys.users. // shows: list, count, byId, search

// Type checking catches typos
keys.users.byId(args.id)  // ✅ Valid
keys.user.byId(args.id)   // ❌ TypeScript error: 'user' does not exist

// Refactoring is safe
// Rename in registry -> all usages update
```

### Registry Type Inference

The registry provides full type inference:

```typescript
// Return type is inferred
keys.users.byId(1)
// Type: ["users", { id: number }]

keys.users.list()
// Type: ["users", "list", undefined | { page?: number; limit?: number }]

keys.users.list({ page: 1, limit: 10 })
// Type: ["users", "list", { page: number; limit: number }]
```

### Query Result

Queries return a result with metadata using `withMetadata`:

```typescript
import { withMetadata } from "@deessejs/server"

// Handler returns
withMetadata(user, { keys: [["users", { id: 1 }]] })

// Result type is
{
  ok: true,
  value: {
    data: User,
    keys: [["users", { id: 1 }]]
  }
}
```

### Cache Invalidation

Mutations return invalidation instructions using `withMetadata`:

```typescript
// Handler returns
withMetadata(user, { invalidate: ["users:list"] })

// Result type is
{
  ok: true,
  value: {
    data: User,
    invalidate: ["users:list"]  // Cache keys to invalidate
  }
}
```

## Usage in Queries

### Basic Query with Cache Keys

```typescript
import { z } from "zod"
import { err } from "@deessejs/core"
import { withMetadata } from "@deessejs/server"

const getUser = t.query({
  args: z.object({
    id: z.number()
  }),
  handler: async (ctx, args) => {
    const user = await ctx.db.users.find(args.id)

    if (!user) {
      return err({ code: "NOT_FOUND", message: "User not found" })
    }

    return withMetadata(user, {
      keys: [["users", { id: args.id }]]
    })
  }
})
```

### Query with Multiple Cache Keys

```typescript
const listUsers = t.query({
  args: z.object({
    page: z.number().default(1),
    limit: z.number().default(10)
  }),
  handler: async (ctx, args) => {
    const users = await ctx.db.users.findMany({
      take: args.limit,
      skip: (args.page - 1) * args.limit,
    })

    return withMetadata(users, {
      keys: [
        ["users", "list"],
        ["users", "list", { page: args.page }],
        ["users", "count"]
      ]
    })
  }
})
```

### Query with TTL

```typescript
const getConfig = t.query({
  handler: async (ctx) => {
    const config = await ctx.db.config.findUnique()

    return withMetadata(config, {
      keys: ["config"],
      ttl: 60000 // 1 minute cache
    })
  }
})
```

## Usage in Mutations

### Basic Invalidation

```typescript
const createUser = t.mutation({
  args: z.object({
    name: z.string(),
    email: z.string().email()
  }),
  handler: async (ctx, args) => {
    const user = await ctx.db.users.create(args)

    return withMetadata(user, {
      invalidate: ["users:list", "users:count"]
    })
  }
})
```

### Invalidation with Keys

```typescript
const updateUser = t.mutation({
  args: z.object({
    id: z.number(),
    name: z.string()
  }),
  handler: async (ctx, args) => {
    const user = await ctx.db.users.update({
      where: { id: args.id },
      data: { name: args.name }
    })

    return withMetadata(user, {
      invalidate: [
        ["users", { id: args.id }],
        ["users", "list"]
      ]
    })
  }
})
```

### Delete with Invalidation

```typescript
const deleteUser = t.mutation({
  args: z.object({
    id: z.number()
  }),
  handler: async (ctx, args) => {
    await ctx.db.users.delete({ where: { id: args.id } })

    return withMetadata({ id: args.id }, {
      invalidate: [
        ["users", { id: args.id }],
        ["users", "list"],
        ["users", "count"]
      ]
    })
  }
})
```

## Cache Key Patterns

### Recommended Patterns

| Pattern | Key Format | Example |
|---------|-----------|---------|
| Single item | `["resource", { id }]` | `["users", { id: 1 }]` |
| List | `["resource", "list"]` | `["users", "list"]` |
| Paginated | `["resource", "list", { page }]` | `["users", "list", { page: 1 }]` |
| Count | `["resource", "count"]` | `["users", "count"]` |
| Search | `["resource", "search", { query }]` | `["users", "search", { q: "john" }]` |

### Examples

```typescript
// Get single user
keys: [["users", { id: 1 }]]

// List all users
keys: [["users", "list"]]

// List with pagination
keys: [["users", "list", { page: 1, limit: 10 }]]

// Search users
keys: [["users", "search", { q: "john" }]]

// User count
keys: [["users", "count"]]

// User's posts
keys: [["users", { id: 1 }, "posts"]]
keys: [["users", { id: 1 }, "posts", { postId: 5 }]]
```

## Cache Invalidation Logic

### Exact Match Invalidation

When a mutation invalidates a key, any cached query with that exact key is invalidated.

```
Mutation invalidates: ["users", "list"]
Invalidates:
  ✅ ["users", "list"]
  ❌ ["users", { id: 1 }]
  ❌ ["users", "list", { page: 1 }]
```

### Prefix Match Invalidation (Recommended)

Use broader keys for list invalidation:

```
Mutation invalidates: ["users", "list"]
Should also invalidate: ["users", "list", { page: 1 }]

Best practice: Use consistent key patterns
```

### Patterns

```typescript
// Mutation invalidates list
withMetadata(user, { invalidate: ["users"] })

// Query uses list key
withMetadata(users, { keys: [["users"]] })

// Or use prefix matching
// "users" would match "users", "users.list", "users.1", etc.
```

## Implementation Example

### Cache Service

```typescript
type CacheEntry<T> = {
  data: T
  timestamp: number
  ttl?: number
}

class CacheService {
  private store = new Map<string, CacheEntry<unknown>>()

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key) as CacheEntry<T> | undefined

    if (!entry) return null

    if (entry.ttl && Date.now() - entry.timestamp > entry.ttl) {
      this.store.delete(key)
      return null
    }

    return entry.data
  }

  async set<T>(key: string, data: T, ttl?: number): Promise<void> {
    this.store.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    })
  }

  async invalidate(pattern: string): Promise<void> {
    // Simple exact match - extend for prefix matching
    this.store.delete(pattern)
  }

  async invalidateMany(patterns: string[]): Promise<void> {
    await Promise.all(patterns.map(p => this.invalidate(p)))
  }
}
```

### Using in Query

```typescript
import { z } from "zod"
import { err } from "@deessejs/core"
import { withMetadata } from "@deessejs/server"

const getUser = t.query({
  args: z.object({
    id: z.number()
  }),
  handler: async (ctx, args) => {
    // Try cache first
    const cacheKey = `users.${args.id}`
    const cached = await ctx.cache.get<User>(cacheKey)

    if (cached) {
      return withMetadata(cached, { keys: [[cacheKey]] })
    }

    // Fetch from DB
    const user = await ctx.db.users.find(args.id)

    if (!user) {
      return err({ code: "NOT_FOUND", message: "User not found" })
    }

    // Cache the result
    await ctx.cache.set(cacheKey, user)

    return withMetadata(user, { keys: [[cacheKey]] })
  }
})
```

### Using in Mutation

```typescript
const updateUser = t.mutation({
  args: z.object({
    id: z.number(),
    name: z.string()
  }),
  handler: async (ctx, args) => {
    const user = await ctx.db.users.update({
      where: { id: args.id },
      data: { name: args.name }
    })

    return withMetadata(user, {
      invalidate: [
        `users.${args.id}`,
        "users.list"
      ]
    })
  }
})
```

## Next.js Integration

The cache system integrates seamlessly with Next.js Data Cache via tags.

### Automatic Tag Revalidation

Cache keys are automatically mapped to Next.js revalidation tags:

```typescript
const keys = defineCacheKeys({
  users: {
    _root: "users",
    list: () => ["users", "list"],
    byId: (id: number) => ["users", { id }],
  }
})

// In a mutation
const updateUser = t.mutation({
  handler: async (ctx, args) => {
    await ctx.db.users.update(args)
    return withMetadata(user, {
      invalidate: [keys.users.list()]  // Also calls revalidateTag("users.list")
    })
  }
})
```

### How It Works

```typescript
// Internal implementation
async function invalidate(keys: CacheKey[]) {
  for (const key of keys) {
    const tag = serializeKey(key)  // ["users", "list"] → "users.list"

    // 1. Invalidate internal cache
    await internalCache.invalidate(tag)

    // 2. Revalidate Next.js Data Cache
    if (isNextJs) {
      revalidateTag(tag)
    }
  }
}
```

This ensures:
- **Server cache** is cleared
- **Next.js Data Cache** is revalidated
- **UI updates** automatically via client SDK

## Stable Serialization

Cache keys must serialize deterministically regardless of object property order.

### The Problem

```typescript
// These should produce the same cache key
["users", { id: 1, name: "John" }]
["users", { name: "John", id: 1 }]
```

### Solution: Stable Stringify

The framework includes a stable serialization utility:

```typescript
import { serializeCacheKey } from "@deessejs/server"

// Deterministic output
serializeCacheKey(["users", { id: 1 }])           // "users:1"
serializeCacheKey(["users", { name: "John", id: 1 }]) // "users:id=1:name=John"

// Alphabetical sorting ensures consistency
// Object keys are sorted: id, then name
```

### Key Serialization Rules

| Input | Output |
|-------|--------|
| `"string"` | `"string"` |
| `["a", "b"]` | `"a:b"` |
| `["a", { id: 1 }]` | `"a:id=1"` |
| `["a", { id: 1, name: "b" }]` | `"a:id=1:name=b"` |

## Prefix vs Exact Invalidation

### Exact Match (Default)

Only the exact key is invalidated:

```
Invalidate: ["users", "list"]
Affected:   ["users", "list"]
Not Affected: ["users", "list", { page: 1 }]
```

### Prefix Match

Use prefix to invalidate all related keys:

```typescript
const updateUser = t.mutation({
  handler: async (ctx, args) => {
    return withMetadata(user, {
      invalidate: [
        keys.users.byId(args.id),      // Exact: ["users", { id: 1 }]
        { prefix: keys.users._root }   // Prefix: all "users" keys
      ]
    })
  }
})
```

### When to Use Each

| Scenario | Use |
|----------|-----|
| Update single user | Exact match |
| Create/delete user | Prefix match (invalidate all lists) |
| Pagination | Exact match per page |
| Search results | Exact match per query |

## Client-Side Sync (SDK Integration)

The React SDK automatically syncs server invalidation to client cache.

### Flow

```typescript
// 1. Server mutation returns invalidation
const result = await api.users.update({ id: 1, name: "New" })
// Result: { ok: true, value: user, invalidate: [["users", { id: 1 }], ["users", "list"]] }

// 2. SDK intercepts and updates React Query
useUsers() // Automatically refetches
```

### Automatic Invalidation

```typescript
// The SDK does this automatically:
import { QueryClient } from "@tanstack/react-query"

const api = createAPI({
  router: t.router({ ... }),
})

const queryClient = new QueryClient()

// Intercept API responses
api.addHook("response", (result) => {
  if (result.invalidate) {
    for (const key of result.invalidate) {
      queryClient.invalidateQueries({ queryKey: key })
    }
  }
})
```

### Result: Zero-Config Invalidation

```typescript
// Developer writes this:
const updateUser = useMutation({
  mutationFn: (data) => api.users.update(data),
})

// UI automatically updates everywhere
// No useEffect, no invalidateQueries, no manual refetch!
```

## TTL and HTTP Headers

TTL propagates to HTTP response headers for edge caching.

### Cache-Control Header

```typescript
const getConfig = t.query({
  handler: async (ctx) => {
    return withMetadata(config, {
      keys: ["config"],
      ttl: 60000  // 1 minute
    })
  }
})

// Response headers:
{
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30"
}
```

### Header Values

| TTL | s-maxage | stale-while-revalidate |
|-----|----------|----------------------|
| 0 | 0 | 0 |
| 60000 | 60 | 30 |
| 3600000 | 3600 | 1800 |

This enables:
- **CDN caching** (Cloudflare, Vercel Edge)
- **Browser caching**
- **ISR** (Incremental Static Regeneration)

## Best Practices

1. **Use consistent key patterns** - Define a convention and stick to it

2. **Invalidate parent keys** - When updating an item, invalidate list keys too

3. **Use TTL for rarely changing data** - Config, settings, etc.

4. **Don't over-cache** - Cache expensive operations, not everything

5. **Clear specific keys** - Use exact keys for targeted invalidation

```typescript
// Good: Clear both specific and list
return withMetadata(user, {
  invalidate: [
    ["users", { id: args.id }],
    ["users", "list"]
  ]
})

// Good: Use TTL for config
return withMetadata(config, {
  keys: ["config"],
  ttl: 300000 // 5 minutes
})
```
