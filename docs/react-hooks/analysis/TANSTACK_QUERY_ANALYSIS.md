# TanStack Query Analysis

This document analyzes TanStack Query (react-query) features and identifies potential improvements for `@deessejs/server/react`.

## TanStack Query Features Overview

### Query Features

| Feature | TanStack Query | @deessejs/server/react |
|---------|---------------|----------------------|
| Basic useQuery | ✅ | ✅ |
| Infinite queries | ✅ | ❌ |
| Pagination | ✅ | ❌ |
| Prefetching | ✅ | ⚠️ Basic |
| Placeholder data | ✅ | ❌ |
| Initial data | ✅ | ❌ |
| Dependent queries | ✅ | ✅ |
| Background refetch | ✅ | ❌ |
| Refetch on interval | ✅ | ❌ |
| Refetch on focus | ✅ | ❌ |
| Refetch on reconnect | ✅ | ❌ |
| Query cancellation | ✅ | ❌ |
| Query deduplication | ✅ | ❌ |
| Garbage collection | ✅ | ❌ |

### Mutation Features

| Feature | TanStack Query | @deessejs/server/react |
|---------|---------------|----------------------|
| Basic useMutation | ✅ | ✅ |
| Optimistic updates | ✅ | ⚠️ Manual |
| Rollback on error | ✅ | ⚠️ Manual |
| Mutation state | ✅ | ❌ |
| useMutationState | ✅ | ❌ |
| Multiple mutations | ✅ | ❌ |
| retry | ✅ | ❌ |

### Cache Features

| Feature | TanStack Query | @deessejs/server/react |
|---------|---------------|----------------------|
| Query cache | ✅ | ✅ |
| Mutation cache | ✅ | ❌ |
| Cache invalidation | ✅ | ✅ (server-driven) |
| Manual cache update | ✅ | ✅ |
| Persistence | ✅ | ❌ |
| Hydration/Dehydration | ✅ | ⚠️ Basic |

### Developer Experience

| Feature | TanStack Query | @deessejs/server/react |
|---------|---------------|----------------------|
| DevTools | ✅ | ❌ |
| Error boundaries | ✅ | ❌ |
| Suspense support | ✅ | ❌ |
| TypeScript support | ✅ | ✅ |
| QueryKey factory | ✅ | ❌ |

## Detailed Feature Analysis

### 1. Infinite Queries

TanStack Query supports infinite scrolling out of the box:

```typescript
// TanStack Query
const { data, fetchNextPage, hasNextPage } = useInfiniteQuery({
  queryKey: ['posts'],
  queryFn: ({ pageParam = 1 }) => fetchPosts(pageParam),
  getNextPageParam: (lastPage) => lastPage.nextCursor,
})
```

**@deessejs/server/react**: Not implemented
**Improvement**: Add infinite query support with cursor-based pagination

---

### 2. Query/Mutation State

TanStack Query provides granular state management:

```typescript
// TanStack Query - useMutationState
const mutationState = useMutationState({
  filters: { mutationKey: ['createPost'] },
})

// Access all mutation states
mutationState.forEach((state) => {
  console.log(state.status) // 'idle' | 'pending' | 'success' | 'error'
  console.log(state.isPending)
  console.log(state.isSuccess)
  console.log(state.variables)
  console.log(state.data)
  console.log(state.error)
})
```

**@deessejs/server/react**: Not implemented
**Improvement**: Add useMutationState for tracking multiple mutations

---

### 3. Optimistic Updates

TanStack Query has built-in optimistic update support:

```typescript
// TanStack Query
useMutation({
  mutationFn: createPost,
  onMutate: async (newPost) => {
    // Cancel outgoing refetches
    await queryClient.cancelQueries({ queryKey: ['posts'] })

    // Snapshot previous value
    const previousPosts = queryClient.getQueryData(['posts'])

    // Optimistically update
    queryClient.setQueryData(['posts'], (old) => [...old, newPost])

    return { previousPosts }
  },
  onError: (err, newPost, context) => {
    // Rollback
    queryClient.setQueryData(['posts'], context.previousPosts)
  },
  onSettled: () => {
    // Refetch
    queryClient.invalidateQueries({ queryKey: ['posts'] })
  },
})
```

**@deessejs/server/react**: Manual via useQueryClient
**Improvement**: Add built-in optimistic update helpers

---

### 4. Query Cancellation

TanStack Query supports aborting requests:

```typescript
// TanStack Query
useQuery({
  queryKey: ['posts', postId],
  queryFn: async ({ signal }) => {
    const response = await fetch(`/posts/${postId}`, { signal })
    return response.json()
  },
})
```

**@deessejs/server/react**: Not implemented
**Improvement**: Add AbortSignal support

---

### 5. Background Refetching

TanStack Query has extensive refetch options:

```typescript
useQuery({
  queryKey: ['posts'],
  // Refetch every 30 seconds
  refetchInterval: 30000,
  // Refetch when window gains focus
  refetchOnWindowFocus: true,
  // Refetch when reconnecting
  refetchOnReconnect: true,
  // Continue refetching in background
  refetchIntervalInBackground: false,
})
```

**@deessejs/server/react**: Not implemented
**Improvement**: Add refetch options

---

### 6. Placeholder Data

TanStack Query supports placeholder data while loading:

```typescript
useQuery({
  queryKey: ['posts'],
  placeholderData: (previousData) => previousData,
  // Or with suspense
  placeholderData: keepPreviousData,
})
```

**@deessejs/server/react**: Not implemented
**Improvement**: Add placeholder data support

---

### 7. Cache Persistence

TanStack Query supports persisting cache to storage:

```typescript
// Persist to localStorage
import { persistQueryClient } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'

const persister = createSyncStoragePersister({
  storage: window.localStorage,
})

persistQueryClient({
  queryClient,
  persister,
  maxAge: 1000 * 60 * 60 * 24, // 24 hours
})
```

**@deessejs/server/react**: Not implemented
**Improvement**: Add cache persistence

---

### 8. DevTools

TanStack Query has official DevTools:

```typescript
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <YourApp />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
```

**@deessejs/server/react**: Not implemented
**Improvement**: Build DevTools

---

### 9. Query Deduplication

TanStack Query automatically deduplicates requests:

```typescript
// Same query key within 5 minutes (default) uses cached result
useQuery({ queryKey: ['posts', 1] })
useQuery({ queryKey: ['posts', 1] }) // Uses cached result
```

**@deessejs/server/react**: Not implemented
**Improvement**: Add request deduplication

---

### 10. Retry Logic

TanStack Query has built-in retry:

```typescript
useQuery({
  queryKey: ['posts'],
  // Retry 3 times on failure
  retry: 3,
  // Custom retry delay
  retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  // Retry based on error
  retry: (failureCount, error) => error.status !== 404,
})
```

**@deessejs/server/react**: Not implemented
**Improvement**: Add retry options

---

### 11. Suspense Support

TanStack Query integrates with React Suspense:

```typescript
useSuspenseQuery({
  queryKey: ['posts'],
  // Throws error if failed
  throwOnError: true,
})
```

**@deessejs/server/react**: Not implemented
**Improvement**: Add suspense support

---

### 12. Mutation Key

TanStack Query supports mutation keys:

```typescript
useMutation({
  mutationKey: ['createPost'],
  mutationFn: createPost,
})

// Track specific mutations
const state = useMutationState({
  filters: { mutationKey: ['createPost'] },
})
```

**@deessejs/server/react**: Not implemented
**Improvement**: Add mutation keys

---

### 13. Query Key Factory

TanStack Query has helpers for building query keys:

```typescript
// Custom queryKey factory
const queryKeys = {
  allPosts: ['posts'] as const,
  post: (id: number) => ['posts', id] as const,
  posts: (filters) => ['posts', 'list', filters] as const,
}

useQuery({ queryKey: queryKeys.post(1) })
useQuery({ queryKey: queryKeys.posts({ status: 'published' }) })
```

**@deessejs/server/react**: Use defineCacheKeys
**Status**: Already available (better type safety)

---

### 14. Error Boundaries

TanStack Query supports error boundaries:

```typescript
import { ErrorBoundary } from '@tanstack/react-query-error-boundary'

function App() {
  return (
    <ErrorBoundary
      fallbackRender={({ reset }) => (
        <div>
          Something went wrong
          <button onClick={() => reset()}>Try again</button>
        </div>
      )}
    >
      <YourApp />
    </ErrorBoundary>
  )
}
```

**@deessejs/server/react**: Not implemented
**Improvement**: Add error boundary integration

---

## Summary: Priority Improvements

### High Priority

1. **Infinite Queries** - Common use case for lists
2. **Optimistic Updates** - Better UX for mutations
3. **DevTools** - Debugging is essential
4. **Cache Persistence** - Offline support

### Medium Priority

5. **Background Refetching** - Keep data fresh
6. **Placeholder Data** - Smoother UX
7. **Mutation State** - Track multiple mutations
8. **Retry Logic** - Resilience

### Low Priority

9. **Suspense Support** - Alternative to loading states
10. **Query Cancellation** - Advanced use cases
11. **Error Boundaries** - Graceful error handling

## Architecture Comparison

### TanStack Query Flow

```
User Action → Query Key → Query Cache → Fetch → Update Cache → Notify
```

### @deessejs/server/react Flow

```
Server Query → Returns Keys → Client Cache → Auto-invalidate on Mutation
```

### Key Difference

TanStack Query is **client-driven** - the client decides what to fetch and when to invalidate.

@deessejs/server/react is **server-driven** - the server defines cache keys and invalidation, client just follows.

This is actually an advantage for @deessejs/server/react as it simplifies the API but limits some advanced use cases.
