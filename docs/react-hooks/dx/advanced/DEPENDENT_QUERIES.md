# Dependent Queries

Run a query only when another query has data.

## Server

```typescript
// server/api.ts
const getUser = t.query({
  args: z.object({ id: z.number() }),
  handler: async (ctx, args) => {
    const user = await ctx.db.users.findUnique({ where: { id: args.id } })
    if (!user) return err({ code: "NOT_FOUND" })
    return ok(user, { keys: [["users", { id: args.id }]] })
  }
})

const getUserPosts = t.query({
  args: z.object({ userId: z.number() }),
  handler: async (ctx, args) => {
    const posts = await ctx.db.posts.findMany({
      where: { authorId: args.userId }
    })
    return ok(posts, {
      keys: [["posts", "byUser", { userId: args.userId }]]
    })
  }
})
```

## Client

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

## How It Works

| Step | Description |
|------|-------------|
| 1 | First query fetches user |
| 2 | `enabled: !!user` waits for user to exist |
| 3 | Once user is loaded, second query automatically runs |
| 4 | No manual dependency tracking needed |
