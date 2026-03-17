# Queries Guide

## Overview

Queries are read operations in `@deessejs/server`. They are used to fetch data from your data sources. Queries can be either:

- **Public** (`t.query()`) - Exposed via HTTP, callable from client and server
- **Internal** (`t.internalQuery()`) - Only callable from server-side code

## Basic Query Definition

```typescript
import { defineContext } from "@deessejs/server"
import { ok, err } from "@deessejs/core"

const { t } = defineContext({
  context: { db: myDatabase }
})

const getUser = t.query({
  // Args validation with Zod
  args: z.object({
    id: z.number()
  }),

  // Handler receives context and args
  handler: async (ctx, args) => {
    const user = await ctx.db.users.find(args.id)

    if (!user) {
      return err({ code: "NOT_FOUND", message: "User not found" })
    }

    return ok(user)
  }
})
```

## Query Structure

### Args

Args are validated using Zod. The schema defines what arguments the query accepts:

```typescript
// Simple args
args: z.object({
  id: z.number()
})

// Multiple args
args: z.object({
  search: z.string().optional(),
  limit: z.number().min(1).max(100).default(10),
  offset: z.number().default(0),
})

// No args - can be omitted entirely
// args is optional
```

### Handler

The handler is an async function that receives:

- **`ctx`** - The context object with all your services (db, logger, cache, etc.)
- **`args`** - The validated arguments (inferred from your Zod schema)

The handler can return either a `Result` or a plain value:

```typescript
// With Result (recommended for explicit error handling)
handler: async (ctx, args) => {
  const user = await ctx.db.users.find(args.id)
  if (!user) {
    return err({ code: "NOT_FOUND", message: "User not found" })
  }
  return ok(user)
}

// Without Result (returns value directly)
handler: async (ctx, args) => {
  return await ctx.db.users.find(args.id)
}

// Can also throw errors
handler: async (ctx, args) => {
  const user = await ctx.db.users.find(args.id)
  if (!user) {
    throw new Error("User not found")
  }
  return user
}
```

## Return Value Options

### Basic Result

```typescript
handler: async (ctx, args) => {
  return ok({ id: 1, name: "John" })
}
```

### With Cache Keys

Queries can return cache keys to enable automatic cache invalidation:

```typescript
handler: async (ctx, args) => {
  const user = await ctx.db.users.find(args.id)

  return ok(user, {
    // Cache keys - used for invalidation
    keys: [
      ["users", "list"],                    // Invalidate all user lists
      ["users", { id: args.id }],          // Invalidate specific user
      ["users", { id: args.id, "details" }] // Invalidate user details
    ]
  })
}
```

### With TTL

You can specify a time-to-live for cached results:

```typescript
handler: async (ctx, args) => {
  const settings = await ctx.db.settings.find()

  return ok(settings, {
    keys: ["settings"],
    ttl: 60000 // 1 minute cache
  })
}
```

## Internal Queries

Internal queries are not exposed via HTTP. They can only be called from server-side code:

```typescript
// Internal query - not exposed via HTTP
const getAdminStats = t.internalQuery({
  // No args needed - omit entirely
  handler: async (ctx) => {
    // This runs only on server - safe from HTTP attacks
    return ok({
      totalUsers: await ctx.db.users.count(),
      revenue: await ctx.db.orders.sum(),
      pendingTasks: await ctx.db.tasks.count({ status: "pending" })
    })
  }
})
```

## Query Options

### Middleware

Queries support lifecycle hooks:

```typescript
const getUser = t.query({
  args: z.object({ id: z.number() }),
  handler: async (ctx, args) => {
    return await ctx.db.users.find(args.id)
  }
})
  // Run before the handler
  .beforeInvoke((ctx, args) => {
    ctx.logger.info(`Fetching user ${args.id}`)
  })
  // Run after successful execution
  .onSuccess((ctx, args, data) => {
    ctx.logger.info(`User fetched: ${data.id}`)
  })
  // Run on error
  .onError((ctx, args, error) => {
    ctx.logger.error(`Failed to fetch user: ${error.message}`)
  })
```

## Using Queries

### From Server Components

```typescript
// app/users/page.tsx
import { api } from "@/server/api"

export default async function UsersPage() {
  const result = await api.users.get({ id: 1 })

  if (result.ok) {
    return <div>{result.value.name}</div>
  }

  return <div>User not found</div>
}
```

### From Server Actions

```typescript
// app/actions.ts
"use server"

import { api } from "@/server/api"

export async function getUser(id: number) {
  const result = await api.users.get({ id })

  return result.match({
    isSuccess: (user) => user,
    isError: (error) => null,
    isLoading: () => null,
    isStale: (user) => user,
  })
}
```

### From Client Components

```typescript
// app/components/UserProfile.tsx
"use client"

import { clientApi } from "@/server/api"

export function UserProfile({ userId }: { userId: number }) {
  const [user, setUser] = useState(null)

  useEffect(() => {
    clientApi.users.get({ id: userId }).then(result => {
      if (result.ok) setUser(result.value)
    })
  }, [userId])

  if (!user) return <Loading />

  return <div>{user.name}</div>
}
```

### Via HTTP

```typescript
// Call from any HTTP client
const response = await fetch("/api/users.get", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    args: { id: 1 }
  })
})

const result = await response.json()
```

## Advanced Patterns

### Paginated Results

```typescript
const listUsers = t.query({
  args: z.object({
    page: z.number().default(1),
    limit: z.number().default(10),
  }),

  handler: async (ctx, args) => {
    const [users, total] = await Promise.all([
      ctx.db.users.findMany({
        take: args.limit,
        skip: (args.page - 1) * args.limit,
        orderBy: { createdAt: "desc" }
      }),
      ctx.db.users.count()
    ])

    return ok({
      items: users,
      page: args.page,
      limit: args.limit,
      total,
      hasMore: args.page * args.limit < total
    }, {
      keys: ["users", "list", { page: args.page }]
    })
  }
})
```

### Filtering & Sorting

```typescript
const searchUsers = t.query({
  args: z.object({
    query: z.string().optional(),
    role: z.enum(["admin", "user", "guest"]).optional(),
    sortBy: z.enum(["name", "createdAt"]).default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  }),

  handler: async (ctx, args) => {
    const where = {
      ...(args.query && {
        OR: [
          { name: { contains: args.query } },
          { email: { contains: args.query } }
        ]
      }),
      ...(args.role && { role: args.role })
    }

    const users = await ctx.db.users.findMany({
      where,
      orderBy: { [args.sortBy]: args.sortOrder }
    })

    return ok(users)
  }
})
```

### Related Data

```typescript
const getUserWithPosts = t.query({
  args: z.object({ id: z.number() }),

  handler: async (ctx, args) => {
    const user = await ctx.db.users.findUnique({
      where: { id: args.id },
      include: {
        posts: {
          where: { published: true },
          take: 10
        },
        _count: {
          select: { posts: true, comments: true }
        }
      }
    })

    if (!user) {
      return err({ code: "NOT_FOUND", message: "User not found" })
    }

    return ok(user)
  }
})
```

### Caching

```typescript
const getConfig = t.query({
  // No args needed - omit entirely
  handler: async (ctx) => {
    // Check cache first
    const cached = await ctx.cache.get("app:config")
    if (cached) {
      return ok(cached)
    }

    // Fetch from DB
    const config = await ctx.db.config.findUnique()

    // Cache for 5 minutes
    await ctx.cache.set("app:config", config, 300000)

    return ok(config)
  }
})
```

## Error Handling

### With Result Type

```typescript
handler: async (ctx, args) => {
  const user = await ctx.db.users.find(args.id)

  if (!user) {
    return err({
      code: "NOT_FOUND",
      message: "User not found",
      details: { userId: args.id }
    })
  }

  if (!user.active) {
    return err({
      code: "INACTIVE_USER",
      message: "User account is inactive"
    })
  }

  return ok(user)
}
```

### Error Types

```typescript
// Define error types
type NotFoundError = {
  code: "NOT_FOUND"
  message: string
  resource: string
}

type PermissionError = {
  code: "PERMISSION_DENIED"
  message: string
  requiredRole: string
}

type NotFoundError | PermissionError

handler: async (ctx, args) => {
  const user = await ctx.db.users.find(args.id)

  if (!user) {
    return err({
      code: "NOT_FOUND",
      message: "User not found",
      resource: "user"
    })
  }

  if (ctx.userId !== user.id && ctx.role !== "admin") {
    return err({
      code: "PERMISSION_DENIED",
      message: "You don't have permission",
      requiredRole: "admin"
    })
  }

  return ok(user)
}
```

## Best Practices

1. **Use Zod for args validation** - It's built-in and provides great DX

2. **Return Result for explicit errors** - Makes error handling explicit

3. **Use cache keys** - Enables automatic cache invalidation on mutations

4. **Keep handlers focused** - Each query should do one thing

5. **Use internal queries for sensitive data** - Don't expose admin operations via HTTP

6. **Add TTL for rarely changing data** - Reduces database load

7. **Use pagination** - Always limit results for list queries

```typescript
// Good: Explicit error handling with cache keys
const getUser = t.query({
  args: z.object({ id: z.number() }),
  handler: async (ctx, args) => {
    const user = await ctx.db.users.find(args.id)
    if (!user) {
      return err({ code: "NOT_FOUND", message: "User not found" })
    }
    return ok(user, { keys: ["users", { id: args.id }] })
  }
})

// Good: Pagination with cache keys
const listUsers = t.query({
  args: z.object({
    page: z.number().default(1),
    limit: z.number().default(10),
  }),
  handler: async (ctx, args) => {
    // ... implementation
    return ok({ items, total }, {
      keys: ["users", "list", { page: args.page }]
    })
  }
})
```

## Related

- [Mutations](MUTATIONS.md) - Write operations
- [Context](SPEC.md#defineContext) - Context definition
- [Cache Invalidation](SPEC.md#cache-invalidation) - How cache keys work
