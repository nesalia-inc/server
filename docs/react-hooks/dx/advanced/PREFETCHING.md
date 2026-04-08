# Prefetching

Load data before it's needed for instant display.

## Prefetch on Hover

```tsx
// UserCard.tsx
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

## Prefetch on Button Click

```tsx
// Dashboard.tsx
"use client"
import { useQueryClient } from "@deessejs/server/react"
import { client } from "@/server/api"

export function Dashboard() {
  const queryClient = useQueryClient()

  // Prefetch for better UX
  const handleShowUsers = () => {
    queryClient.prefetchQuery(client.users.list, {
      args: { limit: 10 }
    })
    setShowUsers(true)
  }

  return (
    <div>
      <button onClick={handleShowUsers}>Show Users</button>
      {showUsers && <UserList />}
    </div>
  )
}
```

## Prefetch in Layout

```tsx
// app/layout.tsx
import { dehydrate } from "@deessejs/server/react"
import { HydrationBoundary } from "@deessejs/server/react"

export default async function Layout({ children }) {
  const queryClient = new QueryClient()

  // Prefetch common data at build/layout time
  await queryClient.prefetchQuery(client.config.get, {
    args: {}
  })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      {children}
    </HydrationBoundary>
  )
}
```

## Benefits

| Benefit | Description |
|---------|-------------|
| Faster UX | Data ready before user needs it |
| Reduced latency | No loading spinner on navigate |
| Better perception | App feels more responsive |
