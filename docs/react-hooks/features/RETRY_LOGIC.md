# Retry Logic

## Overview

Retry logic provides automatic resilience by re-executing failed requests. This is essential for handling transient network errors.

## TanStack Query Implementation

```typescript
useQuery({
  queryKey: ['posts'],
  queryFn: fetchPosts,
  // Retry options
  retry: 3, // Retry 3 times
  retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  // Retry on specific errors
  retry: (failureCount, error) => error.status !== 404,
})
```

## Proposed @deessejs/server/react Implementation

### Basic Options

```typescript
interface UseQueryOptions {
  args: Args

  // Retry configuration
  retry?: boolean | number | ((failureCount: number, error: Error) => boolean)
  retryDelay?: number | ((attemptIndex: number) => number)
  networkMode?: 'online' | 'always' | 'offlineFirst'
}
```

### Simple Retry

```typescript
// Retry 3 times on failure (default)
const { data } = useQuery(client.posts.list, {
  args: {},
  retry: 3,
})

// Retry indefinitely
const { data } = useQuery(client.posts.list, {
  args: {},
  retry: true,
})

// Don't retry
const { data } = useQuery(client.posts.list, {
  args: {},
  retry: false,
})
```

### Custom Retry Logic

```typescript
// Retry only on network errors
const { data } = useQuery(client.posts.list, {
  args: {},
  retry: (failureCount, error) => {
    // Don't retry on 4xx errors
    if (error.status >= 400 && error.status < 500) {
      return false
    }
    // Retry up to 3 times
    return failureCount < 3
  },
})

// Retry only on specific errors
const { data } = useQuery(client.posts.list, {
  args: {},
  retry: (failureCount, error) => {
    const retriableCodes = ['ECONNRESET', 'ETIMEDOUT', 'NETWORK_ERROR']
    return retriableCodes.includes(error.code)
  },
})
```

### Exponential Backoff

```typescript
// Exponential backoff: 1s, 2s, 4s, 8s...
const { data } = useQuery(client.posts.list, {
  args: {},
  retry: 3,
  retryDelay: (attemptIndex) => {
    return Math.min(1000 * 2 ** attemptIndex, 30000)
  },
})

// Linear backoff: 1s, 2s, 3s...
const { data } = useQuery(client.posts.list, {
  args: {},
  retry: 3,
  retryDelay: (attemptIndex) => attemptIndex * 1000,
})

// Fixed delay: always 1s
const { data } = useQuery(client.posts.list, {
  args: {},
  retry: 3,
  retryDelay: 1000,
})
```

## Implementation

```typescript
// Retry logic implementation
async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    retry: number | boolean | ((count: number, error: Error) => boolean)
    retryDelay: number | ((index: number) => number)
    onRetry?: (attempt: number, error: Error) => void
  }
): Promise<T> {
  let attempt = 0
  let lastError: Error

  while (true) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      // Check if we should retry
      const shouldRetry =
        options.retry === true ||
        (typeof options.retry === 'number' && attempt < options.retry) ||
        (typeof options.retry === 'function' && options.retry(attempt, error))

      if (!shouldRetry) {
        throw error
      }

      attempt++

      // Call retry callback
      options.onRetry?.(attempt, error)

      // Wait before retrying
      const delay =
        typeof options.retryDelay === 'function'
          ? options.retryDelay(attempt)
          : options.retryDelay

      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw lastError!
}
```

## Network Modes

### Online Mode (Default)

```typescript
// Only retry when online
const { data } = useQuery(client.posts.list, {
  args: {},
  networkMode: 'online',
})
```

### Always Mode

```typescript
// Queue mutations and retry regardless of network status
const { mutate } = useMutation(client.posts.create, {
  networkMode: 'always',
})
```

### Offline First

```typescript
// Try from cache first, then fetch
const { data } = useQuery(client.posts.list, {
  args: {},
  networkMode: 'offlineFirst',
  staleTime: Infinity, // Cache is always fresh
})
```

## Mutation Retry

```typescript
const { mutate } = useMutation(client.posts.create, {
  retry: 3,
  retryDelay: 1000,

  onError: (error) => {
    console.log('All retries failed:', error.message)
  },
})

// Manual retry
const { mutate, retry } = useMutation(client.posts.create)

const handleSubmit = async () => {
  try {
    await mutate({ title: 'My Post' })
  } catch (error) {
    // User can manually retry
    await retry()
  }
}
```

## Real-World Patterns

### Critical vs Non-Critical

```typescript
// Critical - retry more aggressively
const { data: user } = useQuery(client.user.profile, {
  args: {},
  retry: 5,
  retryDelay: (attempt) => Math.min(500 * attempt, 5000),
})

// Non-critical - retry less
const { data: recommendations } = useQuery(client.recommendations, {
  args: {},
  retry: 1,
})
```

### User Feedback

```typescript
function RetryButton() {
  const { data, error, refetch, isFetching } = useQuery(client.posts.list, {
    args: {},
    retry: 3,
  })

  if (error) {
    return (
      <div>
        <p>Failed to load: {error.message}</p>
        <button onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? 'Retrying...' : 'Retry'}
        </button>
      </div>
    )
  }

  return <PostList data={data} />
}
```

### Progressive Feedback

```typescript
function ProgressRetries() {
  const [retryCount, setRetryCount] = useState(0)

  const { data, error } = useQuery(client.posts.list, {
    args: {},
    retry: 3,
    retryDelay: 2000,
    onRetry: (attempt) => {
      setRetryCount(attempt)
    },
  })

  return (
    <div>
      {error && (
        <p>
          Retrying... (attempt {retryCount}/3)
        </p>
      )}
    </div>
  )
}
```

## API Reference

### Query Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `retry` | `boolean \| number \| function` | `3` | Number of retries or predicate |
| `retryDelay` | `number \| function` | `exponential` | Delay between retries |
| `networkMode` | `'online' \| 'always' \| 'offlineFirst'` | `'online'` | Network handling mode |

### Retry Function Signature

```typescript
type RetryPredicate = (
  failureCount: number,
  error: Error
) => boolean

type RetryDelay = (
  attemptIndex: number
) => number
```

## Best Practices

### 1. Exponential Backoff

```typescript
// ✅ Good - prevents server overload
retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30000)

// ❌ Bad - can overwhelm server
retryDelay: 0
```

### 2. Don't Retry 4xx Errors

```typescript
// ✅ Good - client errors shouldn't retry
retry: (count, error) => error.status < 500

// ❌ Bad - will retry forever on bad request
retry: true
```

### 3. Different Retry for Critical Data

```typescript
// Critical user data - retry more
retry: 5

// Optional features - retry less
retry: 1
```

### 4. Clear User Feedback

```typescript
// ✅ Good - user knows what's happening
onRetry: (attempt) => toast(`Retrying... (${attempt}/3)`)
```
