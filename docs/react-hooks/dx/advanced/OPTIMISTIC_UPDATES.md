# Optimistic Updates

Update UI immediately before server responds, with automatic rollback on error. Zero boilerplate.

## Philosophy

DeesseJS removes the boilerplate. You define **what** changes, not **how** to manage the cache.

---

## Option 1: Server Instructions (Recommended)

The server declares what changes, DeesseJS SDK applies automatically.

### Server

```typescript
// server/api.ts
import { z } from "zod"

const toggleLike = t.mutation({
  args: z.object({
    postId: z.number()
  }),
  handler: async (ctx, args) => {
    const existing = await ctx.db.likes.findUnique({
      where: { postId_userId: { postId: args.postId, userId: ctx.userId }}
    })

    const isLiked = !!existing

    if (isLiked) {
      await ctx.db.likes.delete({ where: { id: existing.id } })
    } else {
      await ctx.db.likes.create({ data: { postId: args.postId, userId: ctx.userId } })
    }

    // Server declares the optimistic changes
    return ok({ liked: !isLiked }, {
      invalidate: [["posts", { id: args.postId }]],
      optimistic: [
        { key: keys.posts.byId(args.postId), path: "liked", value: !isLiked },
        { key: keys.posts.byId(args.postId), path: "likesCount", delta: isLiked ? -1 : 1 }
      ]
    })
  }
})
```

### Client

```tsx
// LikeButton.tsx - ZERO BOILERPLATE
"use client"
import { useMutation, useQuery } from "@deessejs/server/react"
import { client, keys } from "@/server/api"

export function LikeButton({ postId }: { postId: number }) {
  const { data: post } = useQuery(client.posts.get, { args: { id: postId } })
  const { mutate } = useMutation(client.posts.toggleLike)

  // Display the cached value - SDK handles optimistic updates automatically
  if (!post) return null

  return (
    <button onClick={() => mutate({ postId })}>
      {post.liked ? "❤️" : "🤍"} {post.likesCount}
    </button>
  )
}
```

That's it. The SDK reads `optimistic` from the response and applies changes before the promise resolves.

---

## Option 2: useOptimisticMutation (React 19)

For cases needing explicit control, use the combined hook with React 19's useOptimistic.

### Client

```tsx
// LikeButton.tsx
"use client"
import { useOptimisticMutation, useQuery } from "@deessejs/server/react"
import { client } from "@/server/api"

export function LikeButton({ postId }: { postId: number }) {
  const { data: post } = useQuery(client.posts.get, { args: { id: postId } })

  const [optimisticPost, toggleLike] = useOptimisticMutation(
    client.posts.toggleLike,
    post,
    (state, vars) => ({
      ...state,
      liked: !state.liked,
      likesCount: state.liked ? state.likesCount - 1 : state.likesCount + 1
    })
  )

  if (!post) return null

  return (
    <button onClick={() => toggleLike({ postId })}>
      {optimisticPost.liked ? "❤️" : "🤍"} {optimisticPost.likesCount}
    </button>
  )
}
```

### How it works

```typescript
// Simplified implementation of useOptimisticMutation
function useOptimisticMutation(apiFn, initialState, updateFn) {
  const [optimisticState, setOptimistic] = useOptimistic(initialState, updateFn)
  const mutation = useMutation(apiFn)

  const mutate = (vars) => {
    startTransition(async () => {
      setOptimistic(vars)              // 1. Instant UI update (React 19)
      await mutation.mutateAsync(vars) // 2. Server call + auto-invalidation
    })
  }

  return [optimisticState, mutate, mutation]
}
```

---

## Comparison

| Aspect | Old Way (TanStack) | DeesseJS |
|--------|-------------------|----------|
| Lines of code | ~25 | 3-8 |
| Boilerplate | cancelQueries, setQueryData, rollback | None |
| Type safety | Manual | Automatic inference |
| Rollback | Manual in onError | Automatic (React 19) |
| Server control | Client decides | Server declares |

---

## When to Use

- **Option 1 (Server Instructions)**: Most cases - server drives the logic
- **Option 2 (useOptimisticMutation)**: Complex UI transformations, animations, or when you need more control

Both approaches eliminate the need to touch `queryClient` directly.