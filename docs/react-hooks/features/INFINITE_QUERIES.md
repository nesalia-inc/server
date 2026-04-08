# Infinite Queries

## Overview

Infinite queries enable pagination with infinite scrolling, where new data is fetched as the user scrolls.

## TanStack Query Implementation

```typescript
const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
  queryKey: ['posts'],
  queryFn: async ({ pageParam = 1 }) => {
    const response = await fetch(`/api/posts?page=${pageParam}`)
    return response.json()
  },
  initialPageParam: 1,
  getNextPageParam: (lastPage) => lastPage.nextCursor,
})

// Render pages
data.pages.map((page) => page.posts.map(post => <Post key={post.id} {...post} />))

// Load more
<button onClick={() => fetchNextPage()} disabled={!hasNextPage}>
  Load More
</button>
```

## Proposed @deessejs/server/react Implementation

### Server Side

```typescript
// Define infinite query on server
const listPosts = t.query({
  args: z.object({
    cursor: z.number().optional(),
    limit: z.number().default(10),
  }),
  handler: async (ctx, args) => {
    const posts = await ctx.db.posts.findMany({
      take: args.limit + 1, // Fetch one extra to check if there's more
      cursor: args.cursor ? { id: args.cursor } : undefined,
      orderBy: { id: 'desc' },
    })

    const hasNextPage = posts.length > args.limit
    const items = hasNextPage ? posts.slice(0, -1) : posts

    return ok({
      items,
      nextCursor: hasNextPage ? items[items.length - 1].id : undefined,
    }, {
      keys: [['posts', 'list', { limit: args.limit }]],
    })
  }
})
```

### Client Side

```typescript
import { useInfiniteQuery } from "@deessejs/server/react"

function PostList() {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery(client.posts.list, {
    args: { limit: 10 },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  })

  if (isLoading) return <Skeleton />

  return (
    <div>
      {data.pages.map((page) =>
        page.items.map((post) => <Post key={post.id} {...post} />)
      )}

      <button
        onClick={() => fetchNextPage()}
        disabled={!hasNextPage || isFetchingNextPage}
      >
        {isFetchingNextPage ? 'Loading...' : 'Load More'}
      </button>
    </div>
  )
}
```

## API Design

### useInfiniteQuery Options

```typescript
interface UseInfiniteQueryOptions<TArgs, TData> {
  args: TArgs
  getNextPageParam: (data: TData) => number | undefined
  getPreviousPageParam?: (data: TData) => number | undefined
  maxPages?: number // Limit cached pages
  enabled?: boolean
  staleTime?: number
}
```

### useInfiniteQuery Result

```typescript
interface UseInfiniteQueryResult<TData> {
  data: {
    pages: TData[]
    pageParams: number[]
  }
  fetchNextPage: () => Promise<void>
  fetchPreviousPage: () => Promise<void>
  hasNextPage: boolean
  hasPreviousPage: boolean
  isFetchingNextPage: boolean
  isFetchingPreviousPage: boolean
  isLoading: boolean
  isError: boolean
  error: Error | null
  refetch: () => Promise<void>
}
```

## Integration with Server-Driven Keys

The server defines the base cache key, and infinite queries extend it:

```typescript
// Server returns base key
ok({ items: [...], nextCursor: 10 }, {
  keys: [['posts', 'list', { limit: 10 }]]
})

// Client automatically manages pagination keys
// - First fetch: ['posts', 'list', { limit: 10 }, { cursor: undefined }]
// - Second fetch: ['posts', 'list', { limit: 10 }, { cursor: 10 }]
// - Third fetch: ['posts', 'list', { limit: 10 }, { cursor: 20 }]
```

## Considerations

1. **Server must support cursor-based pagination** - Cursor is passed as argument
2. **maxPages option** - Limit memory usage by capping cached pages
3. **Cache invalidation** - Invalidate all pages when mutation occurs
4. **Type safety** - Return types should include `items` and `nextCursor`
