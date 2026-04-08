# Loading States

Handle different loading states for better UX.

## Server with TTL

```typescript
// server/api.ts
const getConfig = t.query({
  handler: async (ctx) => {
    const config = await ctx.db.config.findUnique()
    return ok(config, {
      keys: ["config"],
      ttl: 60000 // 1 minute
    })
  }
})
```

## Client States

```tsx
// Settings.tsx
"use client"
import { useQuery } from "@deessejs/server/react"
import { client } from "@/server/api"

export function Settings() {
  const { data, isLoading, isFetching, isStale, error } = useQuery(
    client.config.get,
    {}
  )

  return (
    <div>
      {isLoading && <FullPageLoader />}

      {error && <ErrorMessage error={error} />}

      {data && (
        <>
          {isFetching && <InlineSpinner />}
          <div className={isStale ? "stale" : "fresh"}>
            {data.value}
          </div>
        </>
      )}
    </div>
  )
}
```

## State Descriptions

| State | Description |
|-------|-------------|
| `isLoading` | First time fetching (no cached data) |
| `isFetching` | Currently refetching in background |
| `isStale` | Data is older than staleTime |
| `isPending` | Same as isLoading (alias) |

## Skeleton Loading

```tsx
function UserList() {
  const { data } = useQuery(client.users.list, { args: { limit: 10 } })

  if (!data) {
    return (
      <div>
        {/* Skeleton while loading */}
        {[...Array(5)].map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    )
  }

  return (
    <div>
      {data.map(user => <UserCard key={user.id} user={user} />)}
    </div>
  )
}
```

## Suspense

```tsx
// With React Suspense
function UserList() {
  return (
    <Suspense fallback={<Skeleton />}>
      <UserListInner />
    </Suspense>
  )
}

function UserListInner() {
  // Will throw if loading
  const { data } = useQuery(client.users.list, { args: {} })
  return <List users={data} />
}
```
