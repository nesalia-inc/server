# Placeholder Data

## Overview

Placeholder data allows showing temporary data while a query is loading, providing a smoother user experience.

## TanStack Query Implementation

```typescript
// Keep previous data while fetching new data
useQuery({
  queryKey: ['posts'],
  queryFn: fetchPosts,
  placeholderData: (previousData) => previousData,
})

// Using keepPreviousData helper
import { keepPreviousData } from '@tanstack/query'

useQuery({
  queryKey: ['posts', page],
  queryFn: () => fetchPosts(page),
  placeholderData: keepPreviousData,
})
```

## Proposed @deessejs/server/react Implementation

### Basic Placeholder

```typescript
function UserList() {
  const { data, isLoading } = useQuery(client.users.list, {
    args: { limit: 10 },
    placeholder: [],
  })

  return (
    <ul>
      {data.map((user) => <UserItem key={user.id} user={user} />)}
    </ul>
  )
}

// When loading, returns placeholder []
// When loaded, returns actual data
```

### With Custom Placeholder

```typescript
function PostList() {
  const { data, isLoading } = useQuery(client.posts.list, {
    args: { limit: 10 },
    placeholder: {
      items: [],
      total: 0,
      isPlaceholder: true,
    },
  })

  // Show skeleton based on placeholder
  if (data?.isPlaceholder) {
    return <PostListSkeleton />
  }

  return <PostList posts={data.items} />
}
```

### Keep Previous Data

```typescript
function PaginatedList({ page }) {
  const { data, isFetching } = useQuery(client.posts.list, {
    args: { page, limit: 10 },
    placeholder: 'keepPrevious', // Keep previous data while fetching
  })

  return (
    <div>
      {data?.map((post) => <Post key={post.id} post={post} />)}

      {isFetching && (
        // Show loading indicator but keep previous content
        <LoadingSpinner />
      )}
    </div>
  )
}
```

### Implementation

```typescript
// useQuery with placeholder
function useQuery(query, options) {
  const [placeholderData, setPlaceholderData] = useState(options.placeholder)

  // If using 'keepPrevious', store previous data
  const [previousData, setPreviousData] = useState(null)

  const { data, isLoading } = result

  // Apply placeholder logic
  useEffect(() => {
    if (options.placeholder === 'keepPrevious') {
      if (!isLoading && data) {
        setPreviousData(data)
      }
    } else if (options.placeholder !== undefined) {
      setPlaceholderData(options.placeholder)
    }
  }, [options.placeholder, isLoading])

  // Return placeholder during loading
  if (isLoading) {
    return {
      data: previousData || placeholderData,
      isLoading: true,
      isPlaceholder: !!previousData,
    }
  }

  return {
    data,
    isLoading: false,
    isPlaceholder: false,
  }
}
```

## Skeleton Integration

```typescript
// Server returns skeleton structure
const listUsers = t.query({
  args: z.object({ limit: z.number() }),
  handler: async (ctx, args) => {
    const users = await ctx.db.users.findMany({ take: args.limit })

    return ok({
      items: users,
      total: users.length,
    }, {
      keys: [['users', 'list', { limit: args.limit }]]
    })
  }
})

// Client shows skeleton
function UserList() {
  const { data } = useQuery(client.users.list, {
    args: { limit: 10 },
    placeholder: {
      items: Array(10).fill(null),
      total: 0,
      isPlaceholder: true,
    },
  })

  return (
    <ul>
      {data.items.map((user, index) => (
        user?.isPlaceholder ? (
          <UserSkeleton key={index} />
        ) : (
          <UserItem key={user.id} user={user} />
        )
      ))}
    </ul>
  )
}
```

## Use Cases

### Pagination

```typescript
function PaginatedUsers({ page }) {
  const { data, isLoading } = useQuery(client.users.list, {
    args: { page, limit: 20 },
    placeholder: 'keepPrevious',
  })

  return (
    <div>
      {data?.map((user) => <UserItem key={user.id} user={user} />)}

      {isLoading && (
        // Previous data remains visible
        <LoadingMore />
      )}

      <Pagination
        page={page}
        onChange={(newPage) => navigate(newPage)}
      />
    </div>
  )
}
```

### Filters

```typescript
function FilteredList({ filter }) {
  const { data, isLoading } = useQuery(client.posts.list, {
    args: { filter },
    placeholder: 'keepPrevious',
  })

  return (
    <div>
      {data?.map((post) => <Post key={post.id} post={post} />)}

      {isLoading && <Spinner />}
    </div>
  )
}
```

### Search

```typescript
function SearchResults({ query }) {
  const { data, isLoading } = useQuery(client.search.posts, {
    args: { q: query },
    placeholder: [],
    staleTime: 0, // Always fresh search results
  })

  return (
    <div>
      {data?.map((result) => <Result key={result.id} {...result} />)}

      {isLoading && <SearchSkeleton />}
    </div>
  )
}
```

## API Design

### Options

```typescript
interface UseQueryOptions {
  args: Args
  placeholder?: T | 'keepPrevious'
}
```

### Result

```typescript
interface UseQueryResult<T> {
  data: T | undefined
  isLoading: boolean
  isPlaceholder: boolean // True when showing placeholder
  isFetching: boolean // True when fetching in background
}
```

## Best Practices

1. **Use for stable data** - Best for lists, not unique items
2. **Match data structure** - Placeholder should match real data shape
3. **Consider 'keepPrevious'** - For pagination and filters
4. **Combine with skeleton** - Show visual loading state
5. **Don't overuse** - Not needed for all queries
