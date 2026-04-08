# Comparison: Without vs With Magic

This document shows the difference in developer experience between using TanStack Query directly vs using the magic wrapper.

## Query Example

### Without Magic (TanStack Query Direct)

```tsx
// components/UserList.tsx
import { useQuery, useQueryClient } from "@tanstack/react-query"

export function UserList() {
  const queryClient = useQueryClient()

  // Need to define queryKey manually
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["users", "list", { limit: 10 }],
    queryFn: async () => {
      const res = await fetch("/api/users?limit=10")
      if (!res.ok) throw new Error("Failed to fetch")
      return res.json()
    },
    // Need to configure options manually
    staleTime: 5 * 60 * 1000,
    retry: 3,
    refetchOnWindowFocus: false,
  })

  return (
    <div>
      {isLoading && <Skeleton />}
      {error && <Error message={error.message} />}
      {data?.map(user => <UserCard key={user.id} user={user} />)}
    </div>
  )
}
```

### With Magic

```tsx
// components/UserList.tsx
import { useQuery } from "@deessejs/server/react"
import { client } from "@/server/api"

export function UserList() {
  // Just use the API - everything automatic!
  const { data, isLoading, error } = useQuery(client.users.list, {
    args: { limit: 10 }
  })

  return (
    <div>
      {isLoading && <Skeleton />}
      {error && <Error message={error.message} />}
      {data?.map(user => <UserCard key={user.id} user={user} />)}
    </div>
  )
}
```

## Mutation Example

### Without Magic

```tsx
// components/CreateUser.tsx
import { useMutation, useQueryClient } from "@tanstack/react-query"

export function CreateUserForm() {
  const queryClient = useQueryClient()

  const { mutate, isPending } = useMutation({
    mutationKey: ["users", "create"],
    mutationFn: async (data: { name: string; email: string }) => {
      const res = await fetch("/api/users", {
        method: "POST",
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error("Failed to create")
      return res.json()
    },
    // Need to manually invalidate cache
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["users", "list"],
      })
    },
    onError: (error) => {
      console.error(error)
    },
  })

  return (
    <form onSubmit={() => mutate({ name: "John", email: "john@example.com" })}>
      <button disabled={isPending}>
        {isPending ? "Creating..." : "Create"}
      </button>
    </form>
  )
}
```

### With Magic

```tsx
// components/CreateUser.tsx
import { useMutation } from "@deessejs/server/react"
import { client } from "@/server/api"

export function CreateUserForm() {
  // No configuration needed!
  const { mutate, isPending } = useMutation(client.users.create)

  return (
    <form onSubmit={() => mutate({ name: "John", email: "john@example.com" })}>
      <button disabled={isPending}>
        {isPending ? "Creating..." : "Create"}
      </button>
    </form>
  )
}
```

## Update with Invalidation

### Without Magic

```tsx
// components/EditUser.tsx
import { useMutation, useQueryClient } from "@tanstack/react-query"

export function EditUserButton({ userId }: { userId: number }) {
  const queryClient = useQueryClient()

  const { mutate } = useMutation({
    mutationKey: ["users", "update"],
    mutationFn: async (data: { id: number; name: string }) => {
      const res = await fetch(`/api/users/${data.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: data.name }),
      })
      return res.json()
    },
    // Need to invalidate both the specific user AND the list
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["users"],
      })
    },
  })

  return <button onClick={() => mutate({ id: userId, name: "New Name" })}>
    Update
  </button>
}
```

### With Magic

```tsx
// components/EditUser.tsx
import { useMutation } from "@deessejs/server/react"
import { client } from "@/server/api"

export function EditUserButton({ userId }: { userId: number }) {
  // Automatic invalidation from server!
  const { mutate } = useMutation(client.users.update)

  return <button onClick={() => mutate({ id: userId, name: "New Name" })}>
    Update
  </button>
}
```

### Server Defines Invalidation

```typescript
// server/api.ts
import { z } from "zod"

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
    // Server decides what to invalidate!
    return ok(user, {
      invalidate: [
        ["users", { id: args.id }],  // Specific user
        ["users", "list"]            // List
      ]
    })
  }
})
```

## Dependent Queries

### Without Magic

```tsx
// components/UserPosts.tsx
import { useQuery } from "@tanstack/react-query"

export function UserPosts({ userId }: { userId: number }) {
  // Need to manually handle dependency
  const { data: user } = useQuery({
    queryKey: ["users", userId],
    queryFn: () => fetchUser(userId),
    enabled: !!userId,  // Manual dependency
  })

  const { data: posts } = useQuery({
    queryKey: ["posts", "byUser", userId],
    queryFn: () => fetchPostsByUser(user?.id),
    enabled: !!user?.id,  // Manual dependency
  })

  return <div>{/* ... */}</div>
}
```

### With Magic

```tsx
// components/UserPosts.tsx
import { useQuery } from "@deessejs/server/react"
import { client } from "@/server/api"

export function UserPosts({ userId }: { userId: number }) {
  // Just works!
  const { data: user } = useQuery(client.users.get, {
    args: { id: userId }
  })

  const { data: posts } = useQuery(client.posts.byUser, {
    args: { userId },
    enabled: !!user  // Still need enabled for conditional
  })

  return <div>{/* ... */}</div>
}
```

## Pagination

### Without Magic

```tsx
// components/UserList.tsx
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"

export function UserList() {
  const [page, setPage] = useState(1)

  const { data } = useQuery({
    queryKey: ["users", "list", { page, limit: 10 }],
    queryFn: () => fetchUsers(page, 10),
  })

  return (
    <div>
      {data?.items.map(user => <UserCard key={user.id} user={user} />)}
      <button onClick={() => setPage(p => p - 1)} disabled={page === 1}>
        Previous
      </button>
      <button onClick={() => setPage(p => p + 1)} disabled={!data?.hasMore}>
        Next
      </button>
    </div>
  )
}
```

### With Magic

```tsx
// components/UserList.tsx
import { useQuery } from "@deessejs/server/react"
import { client } from "@/server/api"
import { useState } from "react"

export function UserList() {
  const [page, setPage] = useState(1)

  // Exactly the same - no difference for pagination
  const { data } = useQuery(client.users.list, {
    args: { page, limit: 10 }
  })

  return (
    <div>
      {data.items.map(user => <UserCard key={user.id} user={user} />)}
      <button onClick={() => setPage(p => p - 1)} disabled={page === 1}>
        Previous
      </button>
      <button onClick={() => setPage(p => p + 1)} disabled={page >= data.totalPages}>
        Next
      </button>
    </div>
  )
}
```

## Summary Table

| Feature | Standard (TanStack Query) | DeesseJS Magic |
|---------|--------------------------|----------------|
| **Cache Keys** | Manual definition (risk of desync) | Automatic (from server) |
| **Invalidation** | Manual `onSuccess: () => invalidate()` | Declarative in handler |
| **Pagination** | Hard to sync | Server-driven metadata |
| **Type Safety** | Often need to import types | Full inference via Proxy |
| **Boilerplate** | ~30 lines | ~5 lines |
| **Maintenance** | High (manual sync) | Low (server as source) |
| **Learning Curve** | Steep | Flat |
| **SSR/RSC** | Manual dehydrate/rehydrate | Built-in |
| **Optimistic Updates** | Manual callbacks | Optional helpers |

## When to Use Each

### Use Without Magic (Direct TanStack Query)
- Need custom fetch logic
- Complex caching strategies
- WebSocket subscriptions
- Fine-grained control

### Use With Magic
- Standard CRUD operations
- Server-driven caching
- Rapid development
- Simple use cases

The magic wrapper handles 90% of use cases with 10% of the code!
