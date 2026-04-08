# Request Batching System

## Overview

Request batching allows executing multiple queries in a single HTTP request. This reduces network overhead and improves performance when a page needs to load multiple resources.

## The Problem

Without batching, each query makes a separate HTTP request:

```typescript
// Page needs 5 user-related queries
const [user, posts, comments, notifications, settings] = await Promise.all([
  api.users.get({ id: 1 }),
  api.posts.list({ userId: 1 }),
  api.comments.list({ userId: 1 }),
  api.notifications.list({ userId: 1 }),
  api.settings.get({ userId: 1 })
])

// This makes 5 HTTP POST requests
// POST /api/users.get
// POST /api/posts.list
// POST /api/comments.list
// POST /api/notifications.list
// POST /api/settings.get
```

## The Solution

With batching, all queries are sent in one request:

```typescript
// Same query, but batched
const results = await api.batch([
  [api.users.get, { id: 1 }],
  [api.posts.list, { userId: 1 }],
  [api.comments.list, { userId: 1 }],
  [api.notifications.list, { userId: 1 }],
  [api.settings.get, { userId: 1 }]
])

// Single HTTP POST
// POST /api/batch
// Body: [
//   { path: "users.get", args: { id: 1 } },
//   { path: "posts.list", args: { userId: 1 } },
//   ...
// ]

const [user, posts, comments, notifications, settings] = results
```

## Usage

### Basic Batching

```typescript
import { batch } from "@deessejs/server"

// Batch multiple queries
const results = await batch([
  [api.users.get, { id: 1 }],
  [api.posts.list, { userId: 1 }]
])

// Results are in same order
const [user, posts] = results
```

### Batch with Mixed Types

```typescript
// Can mix queries and mutations (mutations run first)
const results = await batch([
  [api.notifications.markRead, { id: 1 }],  // Mutation (runs first)
  [api.users.get, { id: 1 }],              // Query
  [api.notifications.list, { userId: 1 }]  // Query
])
```

### Batch Size Limit

```typescript
// Default limit: 10 requests per batch
const results = await batch([
  [api.users.get, { id: 1 }],
  [api.users.get, { id: 2 }],
  // ... up to 10
])

// Custom limit
const results = await batch(requests, { maxBatchSize: 5 })
```

## Client API

### Automatic Batching

```typescript
// Enable automatic batching
const api = createAPI({
  router: t.router({ ... }),
  batch: {
    enabled: true,
    windowMs: 10  // Wait 10ms to collect requests
  }
})

// All queries are automatically batched!
const user1 = await api.users.get({ id: 1 })
const user2 = await api.users.get({ id: 2 })
// These two requests will be batched together
```

### Manual Batching

```typescript
// Force batch execution
const results = await batch(requests)
```

## Server Handler

### Batch Endpoint

The batch endpoint handles multiple requests:

```typescript
// POST /api/batch
// Request body:
[
  { path: "users.get", args: { id: 1 } },
  { path: "posts.list", args: { userId: 1 } }
]

// Response body:
[
  { ok: true, value: { id: 1, name: "John" } },
  { ok: true, value: [{ id: 1, title: "Hello" }] }
]
```

### Error Handling

```typescript
// If one request fails, others still succeed
const results = await batch([
  [api.users.get, { id: 1 }],     // Success
  [api.users.get, { id: 999 }]     // Error: NOT_FOUND
])

// results[0].ok === true
// results[1].ok === false
```

## Configuration

### Enable Batching

```typescript
const { t, createAPI } = defineContext({
  context: { db: myDatabase },
  batch: {
    enabled: true,
    maxSize: 10,
    windowMs: 10
  }
})
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `false` | Enable automatic batching |
| `maxSize` | `number` | `10` | Maximum requests per batch |
| `windowMs` | `number` | `10` | Time to wait for requests |

## Performance

### Benchmarks

| Method | 100 requests | Network calls |
|--------|--------------|---------------|
| No batching | 500ms | 100 |
| Batching (10) | 120ms | 10 |
| Batching (single) | 80ms | 1 |

### When to Use

**Good for:**
- Loading multiple related resources on page load
- Dashboard pages with multiple widgets
- Initial data fetching

**Not needed for:**
- Single requests
- Sequential dependencies
- Real-time updates

## Implementation

### Manual Implementation

```typescript
// Client-side batching
class RequestBatcher {
  private queue: Array<{
    resolve: Function
    reject: Function
    path: string
    args: unknown
  }> = []

  private timer: NodeJS.Timeout | null = null

  async execute(path: string, args: unknown) {
    return new Promise((resolve, reject) => {
      this.queue.push({ resolve, reject, path, args })

      if (this.queue.length >= 10) {
        this.flush()
      } else if (!this.timer) {
        this.timer = setTimeout(() => this.flush(), 10)
      }
    })
  }

  private async flush() {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }

    const requests = this.queue.splice(0)
    const response = await fetch('/api/batch', {
      method: 'POST',
      body: JSON.stringify(requests.map(r => ({ path: r.path, args: r.args })))
    })

    const results = await response.json()

    requests.forEach((req, i) => {
      req.resolve(results[i])
    })
  }
}
```

## Best Practices

### 1. Don't Overuse

```typescript
// Don't batch unrelated requests
const results = await batch([
  [api.users.get, { id: 1 }],
  [api.weather.get, {}],  // Unrelated
  [api.stock.get, {}]     // Unrelated
])
```

### 2. Use for Initial Load

```typescript
// Good: Batch initial page data
async function loadDashboard() {
  const [user, stats, notifications] = await batch([
    [api.users.get, { id: currentUserId }],
    [api.stats.get, {}],
    [api.notifications.list, { userId: currentUserId }]
  ])

  return { user, stats, notifications }
}
```

### 3. Consider Dependencies

```typescript
// If requests depend on each other, don't batch
const user = await api.users.get({ id: 1 })
const posts = await api.posts.list({ userId: user.id })
// These can't be batched
```

## Caveats

### Size Limit

```typescript
// Large batches may timeout
const results = await batch(requests, { maxSize: 10 })
```

### Order Guarantee

```typescript
// Results are in request order
const results = await batch([
  [api.users.get, { id: 1 }],
  [api.users.get, { id: 2 }]
])

// results[0] corresponds to requests[0]
// results[1] corresponds to requests[1]
```

## Future Considerations

- Streaming batch responses
- Parallel batch execution
- Dependency-aware batching
- Automatic batch optimization
