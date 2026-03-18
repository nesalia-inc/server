# Advanced Patterns

Real-world patterns for complex applications.

## Dependent Queries

### Server

```typescript
// server/api.ts
const getUser = t.query({
  args: z.object({ id: z.number() }),
  handler: async (ctx, args) => {
    const user = await ctx.db.users.findUnique({ where: { id: args.id } })
    if (!user) return err({ code: "NOT_FOUND" })
    return withMetadata(user, { keys: [["users", { id: args.id }]] })
  }
})

const getUserPosts = t.query({
  args: z.object({ userId: z.number() }),
  handler: async (ctx, args) => {
    const posts = await ctx.db.posts.findMany({
      where: { authorId: args.userId }
    })
    return withMetadata(posts, {
      keys: [["posts", "byUser", { userId: args.userId }]]
    })
  }
})
```

### Client

```tsx
// UserProfile.tsx
"use client"
import { useQuery } from "@deessejs/server/react"
import { client } from "@/server/api"

export function UserProfile({ userId }: { userId: number }) {
  // Query 1: Fetch user
  const { data: user } = useQuery(client.users.get, {
    args: { id: userId }
  })

  // Query 2: Automatically runs when userId is available
  const { data: posts } = useQuery(client.posts.byUser, {
    args: { userId },
    enabled: !!user // Only runs when user is loaded
  })

  return (
    <div>
      <h1>{user?.name}</h1>
      <h2>Posts</h2>
      {posts?.map(post => <Post key={post.id} post={post} />)}
    </div>
  )
}
```

## Pagination

### Server

```typescript
// server/api.ts
const listUsers = t.query({
  args: z.object({
    page: z.number().default(1),
    limit: z.number().default(10),
  }),
  handler: async (ctx, args) => {
    const [users, total] = await Promise.all([
      ctx.db.users.findMany({
        skip: (args.page - 1) * args.limit,
        take: args.limit,
        orderBy: { createdAt: 'desc' }
      }),
      ctx.db.users.count()
    ])

    return withMetadata({
      items: users,
      total,
      page: args.page,
      totalPages: Math.ceil(total / args.limit),
    }, {
      keys: [["users", "list", { page: args.page, limit: args.limit }]]
    })
  }
})
```

### Client

```tsx
// UserList.tsx
"use client"
import { useState } from "react"
import { useQuery } from "@deessejs/server/react"
import { client } from "@/server/api"

export function UserList() {
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery(client.users.list, {
    args: { page, limit: 10 }
  })

  return (
    <div>
      {isLoading ? (
        <Skeleton />
      ) : (
        <>
          {data.items.map(user => (
            <UserCard key={user.id} user={user} />
          ))}

          <div className="pagination">
            <button
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
            >
              Previous
            </button>
            <span>Page {data.page} of {data.totalPages}</span>
            <button
              disabled={page >= data.totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  )
}
```

## Optimistic Updates

### Server (with rollback support)

```typescript
// server/api.ts
const toggleLike = t.mutation({
  args: z.object({ postId: z.number() }),
  handler: async (ctx, args) => {
    const existing = await ctx.db.likes.findUnique({
      where: { postId_userId: { postId: args.postId, userId: ctx.userId }}
    })

    if (existing) {
      await ctx.db.likes.delete({ where: { id: existing.id } })
      return withMetadata({ liked: false }, {
        invalidate: [["posts", { id: args.postId }]]
      })
    }

    await ctx.db.likes.create({
      data: { postId: args.postId, userId: ctx.userId }
    })
    return withMetadata({ liked: true }, {
      invalidate: [["posts", { id: args.postId }]]
    })
  }
})
```

### Client

```tsx
// LikeButton.tsx
"use client"
import { useMutation, useQueryClient } from "@deessejs/server/react"
import { client } from "@/server/api"

export function LikeButton({ postId, initialLiked }: { postId: number, initialLiked: boolean }) {
  const queryClient = useQueryClient()

  const { mutate } = useMutation(client.posts.toggleLike, {
    // Manual optimistic update
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["posts"] })

      // Snapshot
      const previous = queryClient.getQueryData(["posts", { id: postId }])

      // Optimistic update
      queryClient.setQueryData(["posts", { id: postId }], (old: any) => ({
        ...old,
        liked: !old.liked,
        likesCount: old.liked ? old.likesCount - 1 : old.likesCount + 1
      }))

      return { previous }
    },
    onError: (err, vars, context) => {
      // Rollback
      queryClient.setQueryData(
        ["posts", { id: postId }],
        context.previous
      )
    }
  })

  return (
    <button onClick={() => mutate({ postId })}>
      {initialLiked ? "Unlike" : "Like"}
    </button>
  )
}
```

## Real-time Updates

### Server

```typescript
// server/api.ts
const subscribeToPosts = t.subscription({
  args: z.object({ channel: z.string().default("posts") }),
  handler: async function* (ctx, args) {
    const emitter = ctx.db.emitter

    for await (const event of emitter.subscribe(args.channel)) {
      yield { event }
    }
  }
})

const createPost = t.mutation({
  args: z.object({ title: z.string() }),
  handler: async (ctx, args) => {
    const post = await ctx.db.posts.create(args)
    ctx.db.emitter.emit("posts", { type: "created", post })
    return withMetadata(post, {
      invalidate: [["posts", "list"]]
    })
  }
})
```

### Client

```tsx
// components/PostStream.tsx
"use client"
import { useQuery, useMutation } from "@deessejs/server/react"
import { useEffect } from "react"
import { client } from "@/server/api"

export function PostStream() {
  const { data: posts } = useQuery(client.posts.list, {
    args: { limit: 50 }
  })

  // Listen for real-time updates
  useEffect(() => {
    const unsubscribe = client.posts.subscribe((event) => {
      // Auto-refetch on new event
      client.posts.list.invalidate()
    })

    return unsubscribe
  }, [])

  return (
    <div>
      {posts?.map(post => <PostCard key={post.id} post={post} />)}
    </div>
  )
}
```

## Prefetching

### Client

```tsx
// components/UserCard.tsx
"use client"
import { useQueryClient } from "@deessejs/server/react"
import { client } from "@/server/api"

export function UserCard({ userId }: { userId: number }) {
  const queryClient = useQueryClient()

  const { data: user } = useQuery(client.users.get, {
    args: { id: userId }
  })

  // Prefetch on hover
  const handleMouseEnter = () => {
    queryClient.prefetchQuery(client.users.get, {
      args: { id: userId }
    })
  }

  return (
    <div onMouseEnter={handleMouseEnter}>
      {user?.name}
    </div>
  )
}
```

## Error Handling

### Server

```typescript
// server/api.ts
const createUser = t.mutation({
  args: z.object({
    name: z.string().min(2),
    email: z.string().email(),
  }),
  handler: async (ctx, args) => {
    const existing = await ctx.db.users.findUnique({
      where: { email: args.email }
    })

    if (existing) {
      return err({
        code: "DUPLICATE_EMAIL",
        message: "Email already exists",
        field: "email"
      })
    }

    const user = await ctx.db.users.create(args)
    return withMetadata(user, {
      invalidate: [["users", "list"]]
    })
  }
})
```

### Client

```tsx
// components/CreateUser.tsx
"use client"
import { useState } from "react"
import { useMutation } from "@deessejs/server/react"
import { client } from "@/server/api"

export function CreateUserForm() {
  const [error, setError] = useState<string | null>(null)

  const { mutate, isPending } = useMutation(client.users.create, {
    onError: (err) => {
      if (err.code === "DUPLICATE_EMAIL") {
        setError("Email already exists")
      } else {
        setError("Failed to create user")
      }
    }
  })

  return (
    <form onSubmit={() => mutate({ name: "John", email: "test@example.com" })}>
      {error && <div className="error">{error}</div>}
      <button type="submit" disabled={isPending}>
        Create
      </button>
    </form>
  )
}
```

## Loading States

### Server

```typescript
// With TTL for stale-while-revalidate
const getConfig = t.query({
  handler: async (ctx) => {
    const config = await ctx.db.config.findUnique()
    return withMetadata(config, {
      keys: ["config"],
      ttl: 60000 // 1 minute
    })
  }
})
```

### Client

```tsx
// components/Settings.tsx
"use client"
import { useQuery } from "@deessejs/server/react"
import { client } from "@/server/api"

export function Settings() {
  const { data, isLoading, isFetching, isStale } = useQuery(
    client.config.get,
    {}
  )

  return (
    <div>
      {isLoading ? (
        <Skeleton />
      ) : (
        <>
          {isFetching && <Spinner />}
          <div className={isStale ? "stale" : "fresh"}>
            {data?.value}
          </div>
        </>
      )}
    </div>
  )
}
```

## Summary

The magic wrapper handles:
- ✅ Caching (from server `keys`)
- ✅ Invalidation (from server `invalidate`)
- ✅ TTL (from server `ttl`)
- ✅ Dependent queries (`enabled`)
- ✅ Prefetching
- ✅ Error handling
- ✅ Loading states

Just use the API!
