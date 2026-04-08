# Background Refetching

## Overview

Background refetching keeps data fresh by automatically refetching at intervals, on window focus, or on network reconnect.

## TanStack Query Implementation

```typescript
useQuery({
  queryKey: ['posts'],
  queryFn: fetchPosts,
  // Refetch every 30 seconds
  refetchInterval: 30000,
  // Continue refetching in background (when tab not visible)
  refetchIntervalInBackground: true,
  // Refetch when window gains focus
  refetchOnWindowFocus: true,
  // Refetch when network reconnects
  refetchOnReconnect: true,
  // Custom refetch logic
  refetchOnWindowFocus: (query) => {
    // Only refetch if data is stale
    return query.state.isStale
  },
})
```

## Proposed @deessejs/server/react Implementation

### Basic Options

```typescript
interface UseQueryOptions {
  args: Args
  enabled?: boolean
  staleTime?: number

  // Background refetching
  refetchInterval?: number | false
  refetchIntervalInBackground?: boolean
  refetchOnWindowFocus?: boolean | 'always'
  refetchOnReconnect?: boolean | 'always'

  // Manual
  refetch?: () => Promise<void>
}
```

### Implementation

```typescript
// useQuery hook with background refetching
function useQuery(query, options) {
  const queryClient = useQueryClient()

  // Window focus handler
  useEffect(() => {
    if (!options.refetchOnWindowFocus) return

    const handleFocus = () => {
      const queryState = queryClient.getQueryState(query.queryKey)

      // Only refetch if stale
      if (queryState?.isStale) {
        queryClient.refetchQuery(query.queryKey)
      }
    }

    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [options.refetchOnWindowFocus])

  // Network reconnect handler
  useEffect(() => {
    if (!options.refetchOnReconnect) return

    const handleOnline = () => {
      const queryState = queryClient.getQueryState(query.queryKey)

      if (queryState?.isStale) {
        queryClient.refetchQuery(query.queryKey)
      }
    }

    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [options.refetchOnReconnect])

  // Interval refetch
  useEffect(() => {
    if (!options.refetchInterval) return

    const intervalId = setInterval(() => {
      queryClient.refetchQuery(query.queryKey)
    }, options.refetchInterval)

    // Don't refetch when tab is hidden (unless specified)
    if (!options.refetchIntervalInBackground) {
      const handleVisibility = () => {
        if (document.hidden) {
          clearInterval(intervalId)
        } else {
          // Restart interval
          queryClient.refetchQuery(query.queryKey)
        }
      }
      document.addEventListener('visibilitychange', handleVisibility)
      return () => {
        clearInterval(intervalId)
        document.removeEventListener('visibilitychange', handleVisibility)
      }
    }

    return () => clearInterval(intervalId)
  }, [options.refetchInterval, options.refetchIntervalInBackground])
}
```

### Usage Examples

```typescript
// Auto-refresh every 30 seconds
const { data } = useQuery(client.posts.list, {
  args: {},
  refetchInterval: 30000,
})

// Refetch on window focus
const { data } = useQuery(client.user.profile, {
  args: { userId },
  refetchOnWindowFocus: true,
})

// Refetch on reconnect
const { data } = useQuery(client.settings.all, {
  args: {},
  refetchOnReconnect: true,
})

// Always refetch on focus (even if not stale)
const { data } = useQuery(client.notifications.unread, {
  args: {},
  refetchOnWindowFocus: 'always',
})

// Continuous refetch even in background
const { data } = useQuery(client.liveScores, {
  args: {},
  refetchInterval: 5000,
  refetchIntervalInBackground: true,
})
```

## Advanced Patterns

### Stale Time Integration

```typescript
const { data } = useQuery(client.posts.list, {
  args: {},
  staleTime: 60000, // Data is fresh for 60 seconds
  refetchInterval: 30000, // But check every 30 seconds
})

// Stale time check
const isStale = (query) => {
  if (!options.staleTime) return true
  const age = Date.now() - query.state.dataUpdatedAt
  return age > options.staleTime
}
```

### Conditional Refetch

```typescript
const { data } = useQuery(client.posts.list, {
  args: {},
  refetchOnWindowFocus: (query) => {
    // Only refetch if user was inactive for more than 5 minutes
    const inactiveTime = Date.now() - query.state.dataUpdatedAt
    return inactiveTime > 5 * 60 * 1000
  },
})
```

### Global Configuration

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      staleTime: 30000,
    },
  },
})

// Per-query override
const { data } = useQuery(client.posts.list, {
  args: {},
  staleTime: 60000, // Override global
  refetchOnWindowFocus: false, // Disable for this query
})
```

### Focus Manager (Custom Implementation)

```typescript
import { focusManager } from "@deessejs/server/react"

// Custom focus handling
focusManager.setEventListener((handleFocus) => {
  window.addEventListener('focus', handleFocus)
  window.addEventListener('blur', handleFocus)

  return () => {
    window.removeEventListener('focus', handleFocus)
    window.removeEventListener('blur', handleFocus)
  }
})

// Check if focused
const isFocused = focusManager.isFocused()
```

### Online Manager (Custom Implementation)

```typescript
import { onlineManager } from "@deessejs/server/react"

// Custom online handling
onlineManager.setEventListener((handleOnline) => {
  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOnline)

  return () => {
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOnline)
  }
})

// Check if online
const isOnline = onlineManager.isOnline()
```

## Real-World Use Cases

### Live Data (Stock Prices, Sports)

```typescript
function StockTicker({ symbol }) {
  const { data } = useQuery(client.stocks.price, {
    args: { symbol },
    refetchInterval: 1000, // Every second
    refetchIntervalInBackground: false,
  })

  return <div>{data.price}</div>
}
```

### Notifications Badge

```typescript
function NotificationBadge() {
  const { data } = useQuery(client.notifications.unread, {
    args: {},
    refetchInterval: 60000, // Every minute
    refetchOnWindowFocus: true,
  })

  return <Badge count={data?.count} />
}
```

### User Session Refresh

```typescript
function UserProfile() {
  const { data } = useQuery(client.auth.me, {
    args: {},
    staleTime: 300000, // 5 minutes
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  })

  return <Profile user={data} />
}
```

### Collaborative Data (Multiple Users)

```typescript
function DocumentEditor({ docId }) {
  const { data } = useQuery(client.documents.get, {
    args: { id: docId },
    refetchInterval: 5000, // Check for changes
    refetchOnWindowFocus: true,
  })

  return <Editor document={data} />
}
```

## Performance Considerations

### 1. Avoid Excessive Refetching

```typescript
// ❌ Bad - Too frequent
refetchInterval: 100

// ✅ Good - Reasonable interval
refetchInterval: 30000
```

### 2. Use Stale Time

```typescript
// ❌ Bad - Always refetch
refetchInterval: 30000

// ✅ Good - Respect stale time
refetchInterval: 30000
staleTime: 60000
```

### 3. Disable in Background

```typescript
// ✅ Good - Save resources
refetchIntervalInBackground: false
```

### 4. Conditional Refetch

```typescript
// ✅ Good - Only refetch when needed
refetchOnWindowFocus: (query) => query.state.isStale
```

## API Reference

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `refetchInterval` | `number \| false` | `false` | Interval in ms |
| `refetchIntervalInBackground` | `boolean` | `false` | Continue in background |
| `refetchOnWindowFocus` | `boolean \| 'always'` | `false` | Refetch on focus |
| `refetchOnReconnect` | `boolean \| 'always'` | `true` | Refetch on reconnect |
| `staleTime` | `number` | `0` | Time before data is stale |
