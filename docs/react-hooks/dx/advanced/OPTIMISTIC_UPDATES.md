# Optimistic Updates

Update UI immediately before server responds, rollback on error.

## Server

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

## Client

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

      // Snapshot previous data
      const previous = queryClient.getQueryData(["posts", { id: postId }])

      // Optimistically update
      queryClient.setQueryData(["posts", { id: postId }], (old: any) => ({
        ...old,
        liked: !old.liked,
        likesCount: old.liked ? old.likesCount - 1 : old.likesCount + 1
      }))

      return { previous }
    },
    onError: (err, vars, context) => {
      // Rollback on error
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

## Flow

| Step | Description |
|------|-------------|
| 1 | User clicks like button |
| 2 | `onMutate` fires - UI updates immediately |
| 3 | Server mutation runs |
| 4 | On success: query refetches to sync |
| 5 | On error: `onError` fires - UI rolls back |

## When to Use

- Like/Unlike buttons
- Toggle actions
- Quick form submissions
- Any action where instant feedback improves UX
