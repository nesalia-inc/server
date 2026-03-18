# Automatic Cache Keys Extraction

## Concept

Instead of manually defining query keys on the client, the server returns cache keys in the response. The wrapper automatically extracts and manages these keys.

```
Server Query Response
        │
        ▼
{ ok: true, value: { data: [...], keys: [["users", "list", {limit: 10}]] } }
        │
        ▼
Wrapper extracts keys from response
        │
        ▼
TanStack Query caches with these keys
        │
        ▼
Automatic key-based invalidation when mutation occurs
```

## Server Response Format

### Query Response

```typescript
// Server returns data + cache keys
{
  ok: true,
  value: {
    data: User[],
    keys: [
      ["users", "list", { limit: 10 }],
      ["users", "count"]
    ]
  }
}

// Optional TTL
{
  ok: true,
  value: {
    data: Config,
    keys: ["config"],
    ttl: 60000  // 1 minute
  }
}
```

### Mutation Response

```typescript
// Server returns invalidation keys
{
  ok: true,
  value: {
    data: CreatedUser,
    invalidate: [
      ["users", "list"],
      ["users", "count"]
    ]
  }
}
```

## Implementation

### Query Response Interceptor

```typescript
// magic-query.ts
import { QueryObserver } from '@tanstack/query-core'

interface QueryCacheMeta {
  keys?: CacheKey[]
  ttl?: number
}

interface CachedValue<T> {
  data: T
  meta: QueryCacheMeta
}

export function wrapQueryFn<TQueryFnData>(
  queryFn: () => Promise<TQueryFnData>,
  options: QueryObserverOptions
): () => Promise<CachedValue<TQueryFnData>> {
  return async ({ signal, ...context }) => {
    // Execute original query function
    const result = await queryFn.call(null, { signal, ...context })

    // Check if result contains cache metadata
    if (isResultWithMeta(result)) {
      // Extract cache keys
      const keys = result.keys || []
      const ttl = result.ttl

      // Return wrapped result with metadata
      return {
        data: result.data,
        meta: { keys, ttl },
      }
    }

    // No metadata - return as-is
    return {
      data: result,
      meta: {},
    }
  }
}

// Type guard to check if result has metadata
function isResultWithMeta(result: any): result is { data: any; keys?: CacheKey[]; ttl?: number } {
  return result && typeof result === 'object' && 'data' in result
}
```

### Custom QueryObserver

```typescript
// custom-observer.ts
import { QueryObserver, QueryClient } from '@tanstack/query-core'

class MagicQueryObserver extends QueryObserver {
  constructor(
    client: QueryClient,
    options: QueryObserverOptions
  ) {
    super(client, {
      ...options,
      queryFn: this.wrapQueryFn(options.queryFn),
    })
  }

  private wrapQueryFn(originalFn: QueryFunction | undefined) {
    if (!originalFn) return undefined

    return async (context: QueryFunctionContext) => {
      const result = await originalFn(context)

      // Extract and store keys in query metadata
      if (isResultWithMeta(result)) {
        // Store keys in query state for later access
        this.updateQueryKeyCache(context.queryKey, result.keys)

        // Apply TTL if present
        if (result.ttl) {
          this.applyTTL(context.queryKey, result.ttl)
        }

        return result.data
      }

      return result
    }
  }

  private updateQueryKeyCache(queryKey: QueryKey, keys?: CacheKey[]) {
    if (!keys) return

    const queryCache = this.client.getQueryCache()

    // Store the server-defined keys
    queryCache.setQueryKeyMeta(queryKey, { serverKeys: keys })
  }

  private applyTTL(queryKey: QueryKey, ttl: number) {
    const query = this.client.getQueryCache().build(this.client, {
      queryKey,
    })

    // Mark query as stale after TTL
    setTimeout(() => {
      query.invalidate()
    }, ttl)
  }
}
```

### QueryCache Extension

```typescript
// query-cache-magic.ts
import { QueryCache } from '@tanstack/query-core'

interface QueryKeyMeta {
  serverKeys?: CacheKey[]
  originalData?: unknown
}

const metaMap = new Map<string, QueryKeyMeta>()

export class MagicQueryCache extends QueryCache {
  setQueryKeyMeta(queryKey: QueryKey, meta: QueryKeyMeta) {
    const hash = hashQueryKey(queryKey)
    metaMap.set(hash, meta)
  }

  getQueryKeyMeta(queryKey: QueryKey): QueryKeyMeta | undefined {
    const hash = hashQueryKey(queryKey)
    return metaMap.get(hash)
  }

  // Get all queries that match a given server key
  findByServerKey(serverKey: CacheKey): Query[] {
    const queries = this.getAll()

    return queries.filter((query) => {
      const meta = this.getQueryKeyMeta(query.queryKey)
      return meta?.serverKeys?.some((key) => keysEqual(key, serverKey))
    })
  }

  // Invalidate by server key
  async invalidateByServerKey(serverKey: CacheKey) {
    const queries = this.findByServerKey(serverKey)

    await Promise.all(
      queries.map((query) => query.invalidate())
    )
  }
}

function hashQueryKey(key: QueryKey): string {
  return JSON.stringify(key)
}

function keysEqual(a: CacheKey, b: CacheKey): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
```

## Automatic Key Generation

### Fallback Keys

If server doesn't return keys, generate them automatically:

```typescript
// auto-key.ts
function generateFallbackKey(queryKey: QueryKey): CacheKey {
  // Convert TanStack key to server-style key
  // ["users", "list", { limit: 10 }] → ["users", "list"]

  if (queryKey.length === 0) return []

  const [first, ...rest] = queryKey

  // First element is usually the entity name
  const key: CacheKey = [first]

  // Add params if they're simple (not complex objects)
  const simpleParams = rest.filter(
    (p) => typeof p !== 'object' || p === null
  )

  if (simpleParams.length > 0) {
    key.push(...simpleParams)
  }

  return key
}

// Example:
// TanStack: ["users", "list", { limit: 10 }]
// Server:    ["users", "list"]
```

### Key Normalization

```typescript
// normalize-key.ts
function normalizeKey(key: CacheKey): string {
  if (typeof key === 'string') return key

  return key
    .map((part, index) => {
      if (typeof part === 'object' && part !== null) {
        // Sort object keys for consistent hashing
        const sorted = Object.keys(part)
          .sort()
          .map((k) => `${k}=${part[k]}`)
          .join(':')

        return index === 0 ? sorted : `{${sorted}}`
      }
      return String(part)
    })
    .join(':')
}

// Examples:
// ["users", "list"] → "users:list"
// ["users", { id: 1 }] → "users:{id=1}"
// ["users", { id: 1 }, "posts"] → "users:{id=1}:posts"
```

## Integration with TanStack Query

### Custom QueryOptions

```typescript
// build-query-options.ts
function buildMagicQueryOptions<TQuery extends Query>(
  query: TQuery,
  args: any
): UseQueryOptions {
  return {
    // Build key from args (matching server's key format)
    queryKey: buildQueryKey(query.key, args),

    // Wrap the query function to extract keys
    queryFn: async (context) => {
      const result = await query.execute(args, { signal: context.signal })

      // Store keys in query metadata
      if (result.ok && result.value.keys) {
        const queryCache = context.client.getQueryCache()
        queryCache.setQueryKeyMeta(context.queryKey, {
          serverKeys: result.value.keys,
        })
      }

      return result.value.data
    },

    // Optional: staleTime from server TTL
    staleTime: result?.value?.ttl || 5 * 60 * 1000,
  }
}
```

### Cache Extraction Hook

```typescript
// use-query.ts
function useMagicQuery<TQuery extends Query>(
  query: TQuery,
  options: { args: QueryArgs<TQuery> }
) {
  const queryClient = useQueryClient()
  const magicCache = queryClient.getQueryCache() as MagicQueryCache

  // Get stored keys for this query
  const storedMeta = useMemo(() => {
    const key = buildQueryKey(query.key, options.args)
    return magicCache.getQueryKeyMeta(key)
  }, [query, options.args])

  // Build query options
  const queryOptions = useMemo(() => {
    return buildMagicQueryOptions(query, options.args)
  }, [query, options.args])

  // Pass to TanStack
  return useQuery(queryOptions, queryClient)
}
```

## Using Keys for Invalidation

### Automatic Invalidation Flow

```typescript
// auto-invalidate.ts
mutationCache.subscribe(async (event) => {
  if (event.type === 'success') {
    const mutation = event.mutation
    const result = mutation.state.data

    // Check for invalidate keys
    if (result?.invalidate) {
      const queryCache = mutation.client.getQueryCache() as MagicQueryCache

      // Invalidate all queries that have matching server keys
      for (const invalidKey of result.invalidate) {
        await queryCache.invalidateByServerKey(invalidKey)
      }
    }
  }
})
```

### Query Example

```typescript
// Server definition
const listUsers = t.query({
  args: z.object({ limit: z.number() }),
  handler: async (ctx, args) => {
    const users = await ctx.db.users.findMany({ take: args.limit })

    return withMetadata(users, {
      keys: [
        ['users', 'list'],
        ['users', 'list', { limit: args.limit }],
        ['users', 'count']
      ]
    })
  }
})

// Client usage - keys are automatic!
const { data } = useQuery(client.users.list, {
  args: { limit: 10 }
})
// Automatically cached with keys: ["users", "list"], ["users", "list", {limit: 10}]

// Mutation
const createUser = t.mutation({
  handler: async (ctx, args) => {
    return withMetadata(user, {
      invalidate: [['users', 'list']]
    })
  }
})

// After mutation - queries with ["users", "list"] are automatically refetched
```

## Summary

1. Server returns `keys` in query response
2. Wrapper extracts keys from response
3. Keys stored in query cache metadata
4. Mutations return `invalidate` keys
5. Wrapper finds queries with matching server keys
6. TanStack Query automatically refetches

This creates a fully automatic, server-driven caching system!
