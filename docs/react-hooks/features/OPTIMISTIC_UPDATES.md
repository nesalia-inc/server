# Optimistic Updates

## Overview

Optimistic updates provide immediate feedback by updating the UI before the server responds. If the server fails, the UI rolls back to the previous state.

## TanStack Query Implementation

```typescript
const queryClient = useQueryClient()

useMutation({
  mutationFn: updatePost,
  // Called before mutation
  onMutate: async (newPost) => {
    // Cancel outgoing refetches
    await queryClient.cancelQueries({ queryKey: ['posts', newPost.id] })

    // Snapshot previous value
    const previousPost = queryClient.getQueryData(['posts', newPost.id])

    // Optimistically update
    queryClient.setQueryData(['posts', newPost.id], newPost)

    return { previousPost }
  },
  // Called on error
  onError: (err, newPost, context) => {
    // Rollback to previous value
    queryClient.setQueryData(['posts', newPost.id], context.previousPost)
  },
  // Always refetch after error or success
  onSettled: (data, err, variables) => {
    queryClient.invalidateQueries({ queryKey: ['posts', variables.id] })
  },
})
```

## Proposed @deessejs/server/react Implementation

### Option 1: Built-in Optimistic Helper

```typescript
import { useMutation, useQueryClient } from "@deessejs/server/react"

function UpdatePostButton({ postId, title }) {
  const queryClient = useQueryClient()

  const { mutate } = useMutation(client.posts.update, {
    // Optimistic update configuration
    optimisticUpdate: {
      // Query key to update
      queryKey: ['posts', postId],
      // Update function
      updater: (oldData, newData) => newData,
      // Rollback on error (automatic)
      rollback: true,
    },
  })

  return <button onClick={() => mutate({ id: postId, title })}>Update</button>
}
```

### Option 2: Manual with useQueryClient

```typescript
import { useMutation, useQueryClient } from "@deessejs/server/react"

function UpdatePostForm({ postId }) {
  const queryClient = useQueryClient()

  const { mutate } = useMutation(client.posts.update, {
    onMutate: async (newData) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['posts'] })

      // Snapshot previous value
      const previousPosts = queryClient.getQueryData(['posts'])

      // Optimistically update
      queryClient.setQueryData(['posts', postId], (old) => ({
        ...old,
        ...newData,
      }))

      return { previousPosts }
    },
    onError: (err, variables, context) => {
      // Rollback
      queryClient.setQueryData(['posts', postId], context.previousPosts)
    },
    onSettled: () => {
      // Refetch
      queryClient.invalidateQueries({ queryKey: ['posts'] })
    },
  })

  return <Form onSubmit={mutate} />
}
```

### Option 3: Server-Driven Rollback

```typescript
// Server returns previous state on error
const updatePost = t.mutation({
  args: z.object({ id: z.number(), title: z.string() }),
  handler: async (ctx, args) => {
    try {
      const post = await ctx.db.posts.update(args.id, { title: args.title })
      return ok(post, {
        invalidate: [['posts', 'list']]
      })
    } catch (error) {
      // Return previous state for rollback
      const previous = await ctx.db.posts.find(args.id)
      return err({
        code: 'UPDATE_FAILED',
        message: error.message,
        previous, // Client can use this to rollback
      })
    }
  }
})
```

## Advanced Patterns

### Optimistic Delete

```typescript
const { mutate } = useMutation(client.posts.delete, {
  onMutate: async (deleteData) => {
    await queryClient.cancelQueries({ queryKey: ['posts'] })

    // Snapshot
    const previousPosts = queryClient.getQueryData(['posts'])

    // Optimistically remove
    queryClient.setQueryData(['posts'], (old) =>
      old.filter((post) => post.id !== deleteData.id)
    )

    return { previousPosts }
  },
  onError: (err, variables, context) => {
    queryClient.setQueryData(['posts'], context.previousPosts)
  },
})
```

### Optimistic Create

```typescript
const { mutate } = useMutation(client.posts.create, {
  onMutate: async (newPost) => {
    await queryClient.cancelQueries({ queryKey: ['posts'] })

    const previousPosts = queryClient.getQueryData(['posts'])

    // Optimistically add with temporary ID
    const optimisticPost = {
      ...newPost,
      id: `temp-${Date.now()}`,
      createdAt: new Date(),
    }

    queryClient.setQueryData(['posts'], (old) => [
      optimisticPost,
      ...old,
    ])

    return { previousPosts, optimisticPost }
  },
  onError: (err, variables, context) => {
    // Remove optimistic post
    queryClient.setQueryData(['posts'], (old) =>
      old.filter((post) => post.id !== context.optimisticPost.id)
    )
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ['posts'] })
  },
})
```

### Optimistic Toggle

```typescript
const { mutate } = useMutation(client.posts.toggle, {
  onMutate: async ({ id, currentStatus }) => {
    await queryClient.cancelQueries({ queryKey: ['posts', id] })

    const previous = queryClient.getQueryData(['posts', id])

    // Toggle immediately
    queryClient.setQueryData(['posts', id], {
      ...previous,
      status: currentStatus === 'active' ? 'inactive' : 'active',
    })

    return { previous }
  },
  onError: (err, variables, context) => {
    queryClient.setQueryData(['posts', variables.id], context.previous)
  },
})
```

## API Design

### useMutation with optimisticUpdate

```typescript
interface OptimisticUpdateOptions<TData, TVariables> {
  // Single query to update
  queryKey?: QueryKey
  // Or multiple queries
  queryKeys?: QueryKey[]
  // Update function - receives old data and new variables
  updater: (oldData: TData | undefined, variables: TVariables) => TData
  // Rollback on error (default: true)
  rollback?: boolean
  // Custom rollback function
  onRollback?: (context: OptimisticContext<TData, TVariables>) => void
}

interface OptimisticContext<TData, TVariables> {
  previousData: TData | undefined
  variables: TVariables
  error: Error
}
```

## Best Practices

1. **Always cancel queries** - Prevent race conditions
2. **Snapshot previous state** - Needed for rollback
3. **Use temporary IDs** - For optimistic creates
4. **Invalidate on settled** - Ensure server sync
5. **Handle network errors** - Rollback is essential
