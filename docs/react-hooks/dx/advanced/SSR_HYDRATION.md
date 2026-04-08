# SSR / RSC Hydration

Next.js App Router and React Server Components (RSC) support for instant data without loading states.

## Server-Side Rendering

### Prefetch in Layout

```tsx
// app/layout.tsx
import { QueryClient } from "@deessejs/server/react"
import { HydrationBoundary, dehydrate } from "@deessejs/server/react"
import { client } from "@/server/api"

export default async function Layout({ children }) {
  const queryClient = new QueryClient()

  // Prefetch common data at build/layout time
  await queryClient.prefetchQuery(client.config.get, {
    args: {}
  })

  // Also prefetch user-specific data
  await queryClient.prefetchQuery(client.users.me, {
    args: {}
  })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      {children}
    </HydrationBoundary>
  )
}
```

### Dehydrate Query State

```typescript
import { dehydrate } from "@deessejs/server/react"

// After prefetching, dehydrate the state
const dehydratedState = dehydrate(queryClient)

// Pass to client via props or context
return <HydrationBoundary state={dehydratedState}>{children}</HydrationBoundary>
```

## Client-Side Hydration

### QueryClientProvider

```tsx
// app/providers.tsx
"use client"
import { QueryClientProvider } from "@deessejs/server/react"
import { client } from "@/server/api"

export function Providers({ children, dehydratedState }) {
  return (
    <QueryClientProvider client={client} dehydratedState={dehydratedState}>
      {children}
    </QueryClientProvider>
  )
}
```

### Hydrated State Access

```tsx
// components/UserProfile.tsx
"use client"
import { useQuery } from "@deessejs/server/react"
import { client } from "@/server/api"

export function UserProfile() {
  // Instant data - no loading state!
  // Data comes from dehydrated state
  const { data, isLoading } = useQuery(client.users.me, {})

  if (isLoading) {
    // This won't show - data is already available
    return <Skeleton />
  }

  return <div>{data.name}</div>
}
```

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     SERVER (RSC)                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   queryClient.prefetchQuery(client.users.me, {})           │
│                         │                                   │
│                         ▼                                   │
│   ┌─────────────────────────────────────┐                  │
│   │     API Call → Server Handler       │                  │
│   │     ok(user, { keys: [...] })      │                  │
│   └─────────────────────────────────────┘                  │
│                         │                                   │
│                         ▼                                   │
│   dehydrate(queryClient) ─────────────────► JSON           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼ (HTML + dehydrated state)
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT (Browser)                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   <HydrationBoundary state={dehydratedState}>              │
│                         │                                   │
│                         ▼                                   │
│   useQuery(client.users.me, {})                            │
│        │                                                   │
│        ├─── isLoading: false (instant!)                    │
│        └─── data: { ... } (from cache)                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Partial Hydration

### Only Hydrate Critical Data

```tsx
// Only hydrate essential data, rest fetches on-demand
await queryClient.prefetchQuery(client.users.me, { args: {} })
// Don't hydrate expensive lists - they'll load normally
```

### Selective Hydration

```tsx
import { HydrationBoundary, dehydration } from "@deessejs/server/react"

// Only dehydrate specific queries
const selectiveDehydration = {
  queries: dehydrate(queryClient, {
    include: ['users', 'me'],  // Only these queries
  })
}
```

## Benefits

| Benefit | Description |
|---------|-------------|
| **No Skeleton** | Data appears instantly |
| **SEO Friendly** | Full HTML with data |
| **LCP Improved** | Largest Contentful Paint faster |
| **DX Simple** | Just prefetch + dehydrate |

## Error Boundaries

```tsx
// Hydration can fail - wrap in Error Boundary
<ErrorBoundary fallback={<Fallback />}>
  <HydrationBoundary state={dehydratedState}>
    {children}
  </HydrationBoundary>
</ErrorBoundary>
```

## TypeScript Types

```typescript
import type { DehydratedState } from "@deessejs/server/react"

interface PageProps {
  dehydratedState?: DehydratedState
}

export default function Page({ dehydratedState }: PageProps) {
  return (
    <HydrationBoundary state={dehydratedState}>
      <Content />
    </HydrationBoundary>
  )
}
```