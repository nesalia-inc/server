# React Hooks Specification

## Overview

`@deessejs/server/react` provides React hooks (`useQuery`, `useMutation`) that enable simple real-time synchronization from server to client for the local user.

## Core Concept

This is a **lightweight real-time sync** system (not a full WebSocket solution):

1. **Query** - Client subscribes to data. Query returns `keys` to store in client cache.
2. **Mutation** - Client modifies data. Mutation returns `invalidate` keys to refetch.

When a mutation executes, affected queries are automatically refetched. No complex setup, no WebSocket, no subscriptions management.

```
Client                        Server
  │                              │
  ├── useQuery(api.users.list) ─►│  Returns data + keys: ["users", "list"]
  │◄──────────────────────────────│
  │                              │
  │  [Cache stored locally]      │
  │                              │
  ├── useMutation(api.user.create)
  │          (creates user) ────►│  Returns invalidate: ["users", "list"]
  │◄─────────────────────────────┤
  │                              │
  ▼  [Auto-refetch affected queries]
```

## Why This Approach?

- **Simple** - No WebSocket, no complex subscriptions
- **Server-driven** - Server decides what to invalidate, client just follows
- **Local user only** - Syncs data for the current user, not broadcast to others
- **Zero configuration** - Just define keys in queries/mutations

## API Reference

### useQuery

```typescript
type UseQueryOptions<Args, Result> = {
  args: Args
  enabled?: boolean
  staleTime?: number
  refetchOnWindowFocus?: boolean
}

type UseQueryResult<Result> = {
  data: Result | undefined
  isLoading: boolean
  isError: boolean
  error: Error | null
  refetch: () => Promise<void>
}

function useQuery<Args, Success, CauseData>(
  query: Query<Ctx, Args, Success, CauseData>,
  options: UseQueryOptions<Args, Success>
): UseQueryResult<Success>
```

**Note:** The cache keys are defined in the query definition (see `@deessejs/server` SPEC.md). The hook automatically extracts and manages these keys.

### useMutation

```typescript
type UseMutationOptions<Args, Result> = {
  onSuccess?: (data: Result) => void
  onError?: (error: Error) => void
}

type UseMutationResult<Args, Result> = {
  mutate: (args: Args) => Promise<Result>
  mutateAsync: (args: Args) => Promise<Result>
  isLoading: boolean
  isError: boolean
  error: Error | null
  data: Result | undefined
}

function useMutation<Args, Success, CauseData>(
  mutation: Mutation<Ctx, Args, Success, CauseData>,
  options?: UseMutationOptions<Args, Success>
): UseMutationResult<Args, Success>
```

**Note:** The invalidate keys are defined in the mutation definition. When mutation succeeds, these keys are automatically used to refetch affected queries.

### Key Format

Keys are defined in `@deessejs/server` and consumed by `@deessejs/server/react`:

```typescript
// Simple key
"users"

// Key with params - automatically serialized
["users", { id: 1 }]

// Nested keys
["users", "list"]
["users", "detail", 1]
```

### Query Keys (defined in @deessejs/server)

```typescript
// In @deessejs/server - define keys in the query
const getUser = t.query({
  args: z.object({ id: z.number() }),
  handler: async (ctx, args): AsyncOutcome<User> => {
    const user = await ctx.db.users.find(args.id)
    return success(user, {
      keys: [["users", { id: args.id }], "users:count"]
    })
  }
})

const listUsers = t.query({
  args: z.object({ limit: z.number() }),
  handler: async (ctx, args): AsyncOutcome<User[]> => {
    const users = await ctx.db.users.list(args)
    return success(users, {
      keys: [["users", "list", { limit: args.limit }], "users:count"]
    })
  }
})
```

### Mutation Invalidate Keys (defined in @deessejs/server)

```typescript
// In @deessejs/server - define invalidate in the mutation
const createUser = t.mutation({
  args: z.object({ name: z.string(), email: z.string() }),
  handler: async (ctx, args): AsyncOutcome<User> => {
    const user = await ctx.db.users.create(args)
    return success(user, {
      invalidate: ["users:count", ["users", "list"]]
    })
  }
})

const updateUser = t.mutation({
  args: z.object({ id: z.number(), name: z.string() }),
  handler: async (ctx, args): AsyncOutcome<User> => {
    const user = await ctx.db.users.update(args.id, { name: args.name })
    return success(user, {
      invalidate: [["users", { id: args.id }], "users:count"]
    })
  }
})

const deleteUser = t.mutation({
  args: z.object({ id: z.number() }),
  handler: async (ctx, args): AsyncOutcome<void> => {
    await ctx.db.users.delete(args.id)
    return success(undefined, {
      invalidate: [["users", { id: args.id }], "users:list", "users:count"]
    })
  }
})
```

## Usage Examples

### Basic Query

```typescript
import { useQuery } from "@deessejs/server/react"

function UserProfile({ userId }: { userId: number }) {
  const { data, isLoading, error } = useQuery(api.users.get, {
    args: { id: userId }
  })

  if (isLoading) return <Loading />
  if (error) return <Error error={error} />

  return <div>{data.name}</div>
}
```

### Query with Automatic Caching

```typescript
import { useQuery } from "@deessejs/server/react"

function UserList() {
  const { data, isLoading } = useQuery(api.users.list, {
    args: { limit: 10 }
  })

  // Cache keys are automatically extracted and stored:
  // - ["users", "list", { limit: 10 }]
  // - "users:count"

  if (isLoading) return <Loading />
  return <List users={data} />
}
```

### Mutation with Automatic Invalidation

```typescript
import { useMutation } from "@deessejs/server/react"

function CreateUserForm() {
  const { mutate, isLoading } = useMutation(api.users.create)

  const handleSubmit = async (data: { name: string; email: string }) => {
    const result = await mutate(data)

    // Cache is automatically invalidated:
    // - "users:count" → refetched
    // - ["users", "list"] → refetched
  }

  return (
    <Form onSubmit={handleSubmit} disabled={isLoading} />
  )
}
```

### Optimistic Updates

```typescript
import { useMutation, useQueryClient } from "@deessejs/server/react"

function UpdateUserButton({ userId, name }: { userId: number; name: string }) {
  const queryClient = useQueryClient()

  const { mutate } = useMutation(api.users.update, {
    onSuccess: (data) => {
      // Update cache directly after mutation succeeds
      queryClient.setQueryData(["users", { id: userId }], data)
    }
  })

  return <button onClick={() => mutate({ id: userId, name })}>Update</button>
}
```

### Dependent Queries

```typescript
function UserPosts({ userId }: { userId: number }) {
  // Only fetch when userId is available
  const { data: user } = useQuery(api.users.get, {
    args: { id: userId },
    enabled: !!userId
  })

  const { data: posts } = useQuery(api.posts.listByUser, {
    args: { userId },
    enabled: !!user
  })

  return <div>{posts}</div>
}
```

### Manual Refetch

```typescript
function RefreshableUserList() {
  const { data, refetch, isLoading } = useQuery(api.users.list, {
    args: { limit: 10 }
  })

  return (
    <div>
      <button onClick={() => refetch()}>Refresh</button>
      {isLoading && <Spinner />}
      <List users={data} />
    </div>
  )
}
```

### Mutation with Rollback

```typescript
import { useMutation, useQueryClient } from "@deessejs/server/react"

function UpdateUserForm({ userId }: { userId: number }) {
  const queryClient = useQueryClient()

  const { mutate } = useMutation(api.users.update, {
    onSuccess: () => {
      // Invalidate cache
    },
    onError: (error, variables, context) => {
      // Rollback to previous data
      if (context?.previousData) {
        queryClient.setQueryData(["users", { id: userId }], context.previousData)
      }
    }
  })

  // Store previous data for rollback
  const handleUpdate = async (data: { name: string }) => {
    const previousData = queryClient.getQueryData(["users", { id: userId }])

    // Optimistically update
    queryClient.setQueryData(["users", { id: userId }], { id: userId, ...data })

    try {
      await mutate({ id: userId, ...data })
    } catch {
      // Rollback on error
      queryClient.setQueryData(["users", { id: userId }], previousData)
    }
  }
}
```

## Advanced Usage

### Matching Keys for Invalidation

```typescript
const createUser = t.mutation({
  args: z.object({ name: z.string() }),
  handler: async (ctx, args): AsyncOutcome<User> => {
    const user = await ctx.db.users.create(args)
    return success(user, {
      // Invalidate all user-related queries
      invalidate: {
        key: "users",
        matcher: (cacheKey: string) => cacheKey.startsWith("users")
      }
    })
  }
})
```

### Conditional Invalidation

```typescript
const updateUser = t.mutation({
  args: z.object({ id: z.number(), role: z.enum(["user", "admin"]) }),
  handler: async (ctx, args): AsyncOutcome<User> => {
    const user = await ctx.db.users.update(args.id, { role: args.role })

    // Only invalidate admin list if role changed to admin
    const shouldInvalidateAdminList = args.role === "admin"

    return success(user, {
      invalidate: [
        ["users", { id: args.id }],
        shouldInvalidateAdminList ? "users:admin" : null
      ].filter(Boolean)
    })
  }
})
```

### Batch Invalidation

```typescript
const createOrder = t.mutation({
  args: z.object({ items: z.array(z.object({ productId: z.number(), quantity: z.number() })) }),
  handler: async (ctx, args): AsyncOutcome<Order> => {
    const order = await ctx.db.orders.create(args)

    // Invalidate all related caches
    return success(order, {
      invalidate: [
        "orders",
        ["orders", "list"],
        "stats:daily",
        "stats:monthly",
        ...args.items.map(item => ["products", { id: item.productId }])
      ]
    })
  }
})
```

### Prefetching

```typescript
import { useQueryClient } from "@deessejs/server/react"

function UserButton({ userId }: { userId: number }) {
  const queryClient = useQueryClient()

  const handleHover = () => {
    // Prefetch user data on hover
    queryClient.prefetchQuery(api.users.get, {
      args: { id: userId }
    })
  }

  return <button onMouseEnter={handleHover}>View Profile</button>
}
```

## Configuration

### Query Client Provider

```tsx
import { QueryClient, QueryClientProvider } from "@deessejs/server/react"
import { api } from "./api"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false,
      retry: 1
    }
  }
})

function App() {
  return (
    <QueryClientProvider client={queryClient} api={api}>
      <YourApp />
    </QueryClientProvider>
  )
}
```

### Custom Cache Implementation

```typescript
import { createQueryClient } from "@deessejs/server/react"

const queryClient = createQueryClient({
  // Custom storage (e.g., IndexedDB, Redis)
  storage: {
    get: (key: string) => customGet(key),
    set: (key: string, data: unknown) => customSet(key, data),
    delete: (key: string) => customDelete(key),
    keys: () => customKeys()
  },

  // Custom serializer
  serializer: {
    stringify: (key: string | Record<string, unknown>) => JSON.stringify(key),
    parse: (serialized: string) => JSON.parse(serialized)
  }
})
```

## Type Safety

### Full Type Inference

```typescript
// Args and return types are fully inferred
const { data } = useQuery(api.users.get, {
  args: { id: 1 }
})

// data is typed as User | undefined
// error is typed as Cause<{ id: number }> | null
```

### Custom Context

```typescript
type CustomContext = {
  db: Database
  logger: Logger
}

function MyComponent() {
  // Uses custom context with full type safety
  const { data } = useQuery<CustomContext>(api.users.get, {
    args: { id: 1 }
  })
}
```

## Error Handling

```typescript
function CreateUserForm() {
  const { mutate, error, isError } = useMutation(api.users.create)

  const handleSubmit = async (data: { name: string; email: string }) => {
    try {
      await mutate(data)
    } catch (e) {
      // Error is already handled by useMutation
      // Access error details:
      // e.name === "DUPLICATE" → email already exists
      // e.data.field === "email" → which field caused the error
    }
  }

  return (
    <Form onSubmit={handleSubmit}>
      {isError && <ErrorMessage>{error.message}</ErrorMessage>}
    </Form>
  )
}
```

## SSR / Next.js Support

```typescript
// app/users/page.tsx
import { dehydrate, HydrationBoundary } from "@deessejs/server/react"
import { api } from "@/api"

export default async function UsersPage() {
  const queryClient = new QueryClient()

  // Prefetch on server
  await queryClient.prefetchQuery(api.users.list, {
    args: { limit: 10 }
  })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <UserList />
    </HydrationBoundary>
  )
}
```

## Future Considerations

- Optimistic mutation with rollback
- Query persistence to localStorage
- Pagination support
- Background refetching
