# Auto-Invalidation: Server-Driven Cache Management

## Concept

The server response from mutations contains `invalidate` keys. The wrapper automatically triggers TanStack Query's `invalidateQueries` based on these keys.

```
Mutation Success
      │
      ▼
Server returns: { ok: true, value: { data: user, invalidate: [["users", "list"]] } }
      │
      ▼
Wrapper intercepts response
      │
      ▼
Matches cache keys: [["users", "list"], ["users", "list", { page: 1 }]]
      │
      ▼
queryClient.invalidateQueries({ predicate: matchesKeys })
      │
      ▼
TanStack Query refetches affected queries automatically
```

## Implementation

### Intercepting Mutation Results

```typescript
// magic-invalidation.ts
import { QueryClient, MutationCache, QueryCache } from '@tanstack/query-core'

export function setupAutoInvalidation(
  queryClient: QueryClient,
  mutationCache: MutationCache
) {
  mutationCache.subscribe((event) => {
    if (event.type === 'added') {
      const mutation = event.mutation

      // Wrap the mutation function
      const originalMutationFn = mutation.options.mutationFn

      mutation.options.mutationFn = async (variables) => {
        try {
          // Execute the mutation
          const result = await originalMutationFn(variables)

          // Check for invalidation keys in response
          if (isSuccessResult(result) && result.value?.invalidate) {
            const invalidateKeys = result.value.invalidate

            // Find matching queries and invalidate them
            await invalidateMatchingQueries(queryClient, invalidateKeys)
          }

          return result
        } catch (error) {
          // Optionally handle error
          throw error
        }
      }
    }
  })
}
```

### Key Matching Logic

```typescript
// key-matching.ts

type CacheKey = string | unknown[]

interface InvalidateOptions {
  exact?: boolean      // Exact key match only
  prefix?: boolean    // Prefix matching
  recursive?: boolean  // Match nested keys
}

function invalidateMatchingQueries(
  queryClient: QueryClient,
  invalidateKeys: CacheKey[],
  options: InvalidateOptions = {}
) {
  const { exact = false, prefix = true, recursive = true } = options

  return queryClient.invalidateQueries({
    predicate: (query) => {
      const queryKey = query.queryKey

      for (const invalidKey of invalidateKeys) {
        // Skip null/undefined keys
        if (!invalidKey) continue

        // Check if this query matches
        if (matchesKey(queryKey, invalidKey, { exact, prefix, recursive })) {
          return true
        }
      }

      return false
    },
  })
}

function matchesKey(
  queryKey: unknown[],
  invalidKey: CacheKey,
  options: { exact: boolean; prefix: boolean; recursive: boolean }
): boolean {
  // Convert to arrays for comparison
  const queryArr = Array.isArray(queryKey) ? queryKey : [queryKey]
  const invalidArr = Array.isArray(invalidKey) ? invalidKey : [invalidKey]

  // Exact match
  if (options.exact || queryArr.length === invalidArr.length) {
    if (JSON.stringify(queryArr) === JSON.stringify(invalidArr)) {
      return true
    }
  }

  // Prefix match
  if (options.prefix && queryArr.length >= invalidArr.length) {
    const queryPrefix = queryArr.slice(0, invalidArr.length)
    if (JSON.stringify(queryPrefix) === JSON.stringify(invalidArr)) {
      return true
    }
  }

  // Recursive match - check if any part matches
  if (options.recursive) {
    for (let i = 0; i < queryArr.length; i++) {
      const queryPart = queryArr[i]

      for (let j = 0; j < invalidArr.length; j++) {
        const invalidPart = invalidArr[j]

        // Object comparison (e.g., { id: 1 } matches { id: 1 })
        if (
          typeof queryPart === 'object' &&
          typeof invalidPart === 'object' &&
          queryPart !== null &&
          invalidPart !== null
        ) {
          if (objectsEqual(queryPart, invalidPart)) {
            return true
          }
        }

        // String comparison
        if (queryPart === invalidPart) {
          return true
        }
      }
    }
  }

  return false
}

function objectsEqual(a: any, b: any): boolean {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (typeof a !== 'object' || a === null || b === null) return false

  const keysA = Object.keys(a)
  const keysB = Object.keys(b)

  if (keysA.length !== keysB.length) return false

  for (const key of keysA) {
    if (!keysB.includes(key)) return false
    if (!objectsEqual(a[key], b[key])) return false
  }

  return true
}
```

## Prefix Invalidation

### Example: Invalidate All User Lists

```typescript
// Server returns
{
  invalidate: [['users', 'list']]
}

// This should invalidate:
// ✅ ["users", "list"]
// ✅ ["users", "list", { page: 1 }]
// ✅ ["users", "list", { page: 2 }]
// ❌ ["users", "profile"]
```

### Implementation

```typescript
function invalidateByPrefix(
  queryClient: QueryClient,
  prefixKey: CacheKey
) {
  const prefix = Array.isArray(prefixKey) ? prefixKey : [prefixKey]
  const prefixStr = JSON.stringify(prefix)

  return queryClient.invalidateQueries({
    predicate: (query) => {
      const keyStr = JSON.stringify(query.queryKey.slice(0, prefix.length))
      return keyStr === prefixStr
    },
  })
}
```

## Smart Invalidation

### Batch Invalidation

```typescript
// Server returns multiple invalidation keys
{
  invalidate: [
    ['users', 'list'],
    ['users', 'count'],
    ['notifications']
  ]
}

// Single batched refetch
await queryClient.invalidateQueries({
  predicate: (query) => {
    return (
      matchesKey(query.queryKey, ['users', 'list'], { prefix: true }) ||
      matchesKey(query.queryKey, ['users', 'count'], { prefix: true }) ||
      matchesKey(query.queryKey, ['notifications'], { prefix: true })
    )
  },
})
```

### Selective Invalidation

```typescript
// Only invalidate active queries (currently visible)
await queryClient.invalidateQueries({
  refetchType: 'active', // Only refetch active (mounted) queries
})

// Or only inactive queries
await queryClient.invalidateQueries({
  refetchType: 'inactive', // Only refetch inactive queries
})
```

## Mutation with Context

### Rollback Support

```typescript
// Server can include previous data for rollback
const updateUser = t.mutation({
  args: z.object({ id: z.number(), name: z.string() }),
  handler: async (ctx, args) => {
    const previous = await ctx.db.users.find(args.id)

    try {
      const user = await ctx.db.users.update(args.id, { name: args.name })
      return withMetadata(user, {
        invalidate: [['users', 'list']]
      })
    } catch (error) {
      // Return previous data for rollback
      return err({
        code: 'UPDATE_FAILED',
        message: error.message,
        previous, // Client can use this to rollback
      })
    }
  }
})
```

### Client-Side Rollback

```typescript
const { mutate } = useMutation(client.users.update, {
  onError: (error, variables, context) => {
    if (error.previous) {
      // Rollback to previous data
      queryClient.setQueryData(
        ['users', { id: variables.id }],
        error.previous
      )
    }
  },
})
```

## Advanced Patterns

### Conditional Invalidation

```typescript
// Server decides what to invalidate based on result
const updateUser = t.mutation({
  args: z.object({ id: z.number(), role: z.enum(['user', 'admin']) }),
  handler: async (ctx, args) => {
    const user = await ctx.db.users.update(args.id, { role: args.role })

    // Invalidate admin list only if role changed to admin
    const invalidate = [
      ['users', { id: args.id }],
      ['users', 'list'],
    ]

    if (args.role === 'admin') {
      invalidate.push(['users', 'admins'])
    }

    return withMetadata(user, { invalidate })
  }
})
```

### Dependent Invalidation

```typescript
// Invalidate based on what was actually changed
const createOrder = t.mutation({
  args: z.object({ items: z.array(z.object({ productId: z.number() })) }),
  handler: async (ctx, args) => {
    const order = await ctx.db.orders.create(args)

    // Invalidate caches for all products in the order
    const invalidate = [
      ['orders', 'list'],
      ...args.items.map(item => ['products', { id: item.productId }])
    ]

    return withMetadata(order, { invalidate })
  }
})
```

## API Reference

### Server Response Format

```typescript
// Mutation success with invalidation
{
  ok: true,
  value: {
    data: User,
    invalidate: CacheKey[]
  }
}

// Mutation error with previous data for rollback
{
  ok: false,
  error: {
    code: string,
    message: string,
    previous?: any // For rollback
  }
}
```

### CacheKey Format

```typescript
// String key
"users"

// Array key (recommended)
["users", "list"]

// With parameters
["users", { id: 1 }]
["users", "list", { page: 1, limit: 10 }]

// Nested
["users", { id: 1 }, "posts"]
```

## Summary

1. Server returns `invalidate` keys in mutation response
2. Wrapper intercepts response
3. Matches cache keys using prefix/exact/recursive matching
4. Calls `queryClient.invalidateQueries()` with predicate
5. TanStack Query refetches affected queries automatically

This eliminates the need for manual `onSuccess` callbacks on every mutation!
