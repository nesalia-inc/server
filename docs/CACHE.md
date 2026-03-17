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

### Query Result

Queries return a result with metadata:

```typescript
// Handler returns
return ok(user, { keys: [["users", { id: 1 }]] })

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

Mutations return invalidation instructions:

```typescript
// Handler returns
return ok(user, { invalidate: ["users:list"] })

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
const getUser = t.query({
  args: z.object({ id: z.number() }),
  handler: async (ctx, args) => {
    const user = await ctx.db.users.find(args.id)

    if (!user) {
      return err({ code: "NOT_FOUND", message: "User not found" })
    }

    return ok(user, {
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
    limit: z.number().default(10),
  }),
  handler: async (ctx, args) => {
    const users = await ctx.db.users.findMany({
      take: args.limit,
      skip: (args.page - 1) * args.limit,
    })

    return ok(users, {
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

    return ok(config, {
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
    email: z.string().email(),
  }),
  handler: async (ctx, args) => {
    const user = await ctx.db.users.create(args)

    return ok(user, {
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
    name: z.string().optional(),
  }),
  handler: async (ctx, args) => {
    const user = await ctx.db.users.update({
      where: { id: args.id },
      data: { name: args.name }
    })

    return ok(user, {
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
  args: z.object({ id: z.number() }),
  handler: async (ctx, args) => {
    await ctx.db.users.delete({ where: { id: args.id } })

    return ok({ id: args.id }, {
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
return ok(user, { invalidate: ["users"] })

// Query uses list key
return ok(users, { keys: [["users"]] })

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
const getUser = t.query({
  args: z.object({ id: z.number() }),
  handler: async (ctx, args) => {
    // Try cache first
    const cacheKey = `users.${args.id}`
    const cached = await ctx.cache.get<User>(cacheKey)

    if (cached) {
      return ok(cached, { keys: [[cacheKey]] })
    }

    // Fetch from DB
    const user = await ctx.db.users.find(args.id)

    if (!user) {
      return err({ code: "NOT_FOUND", message: "User not found" })
    }

    // Cache the result
    await ctx.cache.set(cacheKey, user)

    return ok(user, { keys: [[cacheKey]] })
  }
})
```

### Using in Mutation

```typescript
const updateUser = t.mutation({
  args: z.object({
    id: z.number(),
    name: z.string(),
  }),
  handler: async (ctx, args) => {
    const user = await ctx.db.users.update({
      where: { id: args.id },
      data: { name: args.name }
    })

    return ok(user, {
      invalidate: [
        `users.${args.id}`,
        "users.list"
      ]
    })
  }
})
```

## Best Practices

1. **Use consistent key patterns** - Define a convention and stick to it

2. **Invalidate parent keys** - When updating an item, invalidate list keys too

3. **Use TTL for rarely changing data** - Config, settings, etc.

4. **Don't over-cache** - Cache expensive operations, not everything

5. **Clear specific keys** - Use exact keys for targeted invalidation

```typescript
// Good: Clear both specific and list
return ok(user, {
  invalidate: [
    ["users", { id: args.id }],
    ["users", "list"]
  ]
})

// Good: Use TTL for config
return ok(config, {
  keys: ["config"],
  ttl: 300000 // 5 minutes
})
```
