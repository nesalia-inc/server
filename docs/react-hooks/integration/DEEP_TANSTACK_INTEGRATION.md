# Deep TanStack Query Integration

## Overview

This document explores how to deeply integrate with TanStack Query's internals to create the "magic" wrapper.

## Key Integration Points

| Component | Integration Method | Purpose |
|-----------|------------------|---------|
| QueryCache | Subscribe to events | Monitor queries |
| MutationCache | Subscribe to events | Auto-invalidation |
| QueryObserver | Custom observer | Extract metadata |
| QueryBehavior | Custom behavior | Intercept fetches |
| QueryDefaults | setQueryDefaults | Apply defaults per key |

## 1. QueryCache Integration

### Subscribe to Cache Events

```typescript
// query-cache-events.ts
import { QueryCache } from '@tanstack/query-core'

function setupQueryCacheListener(queryCache: QueryCache) {
  const unsubscribe = queryCache.subscribe((event) => {
    switch (event.type) {
      case 'added':
        console.log('Query added:', event.query.queryKey)
        // Extract server keys from new queries
        break

      case 'removed':
        console.log('Query removed:', event.query.queryKey)
        break

      case 'updated':
        console.log('Query updated:', event.query.queryKey, event.action)
        // React to updates
        break

      case 'observerAdded':
        console.log('Observer added to:', event.query.queryKey)
        break

      case 'observerRemoved':
        console.log('Observer removed from:', event.query.queryKey)
        break
    }
  })

  return unsubscribe
}

// Event types
type QueryCacheNotifyEvent =
  | { type: 'added'; query: Query }
  | { type: 'removed'; query: Query }
  | { type: 'updated'; query: Query; action: QueryAction }
  | { type: 'observerAdded'; query: Query; observer: QueryObserver }
  | { type: 'observerRemoved'; query: Query; observer: QueryObserver }
  | { type: 'observerResultsUpdated'; query: Query }
  | { type: 'observerOptionsUpdated'; query: Query; observer: QueryObserver }
```

### Query Actions

```typescript
// React to specific actions
queryCache.subscribe((event) => {
  if (event.type === 'updated') {
    switch (event.action.type) {
      case 'fetch':
        // Query started fetching
        break

      case 'fetchSuccess':
        // Query fetched successfully
        const { data } = event.action
        // Extract server metadata here
        break

      case 'fetchError':
        // Query failed
        const { error } = event.action
        break

      case 'invalidate':
        // Query was invalidated
        break

      case 'setData':
        // Data was set manually
        break

      case 'clear':
        // Query was cleared
        break
    }
  }
})
```

## 2. MutationCache Integration

### Subscribe to Mutation Events

```typescript
// mutation-cache-events.ts
import { MutationCache } from '@tanstack/query-core'

function setupMutationCacheListener(mutationCache: MutationCache) {
  const unsubscribe = mutationCache.subscribe((event) => {
    switch (event.type) {
      case 'added':
        console.log('Mutation added:', event.mutation.options.mutationKey)
        // Store original mutation function
        break

      case 'success':
        // Mutation succeeded
        const { data } = event.mutation.state
        // Auto-invalidate queries
        break

      case 'error':
        // Mutation failed
        const { error } = event.mutation.state
        break

      case 'pending':
        // Mutation is running
        break

      case 'settled':
        // Mutation completed (success or error)
        break
    }
  })

  return unsubscribe
}
```

### Intercept Mutation Results

```typescript
// intercept-mutations.ts
function wrapMutationCache(queryClient: QueryClient) {
  const mutationCache = queryClient.getMutationCache()

  mutationCache.subscribe(async (event) => {
    if (event.type === 'added') {
      const mutation = event.mutation

      // Get original mutation function
      const originalFn = mutation.options.mutationFn

      // Wrap to intercept result
      mutation.options.mutationFn = async (variables) => {
        const result = await originalFn(variables)

        // Check for invalidation
        if (result.ok && result.value?.invalidate) {
          await queryClient.invalidateQueries({
            predicate: (query) => {
              return matchesServerKeys(query.queryKey, result.value.invalidate)
            },
          })
        }

        return result
      }
    }
  })
}
```

## 3. Custom QueryObserver

### Override Default Behavior

```typescript
// custom-observer.ts
import { QueryObserver, QueryClient } from '@tanstack/query-core'

class MagicQueryObserver extends QueryObserver {
  constructor(client: QueryClient, options: QueryObserverOptions) {
    super(client, {
      ...options,
      // Wrap queryFn to extract metadata
      queryFn: this.wrapQueryFn(options.queryFn),
    })
  }

  private wrapQueryFn(originalFn?: QueryFunction) {
    if (!originalFn) return undefined

    return async (context: QueryFunctionContext) => {
      const result = await originalFn(context)

      // Extract server metadata
      if (isServerResult(result)) {
        // Store keys in query metadata
        const query = context.client.getQueryCache().get(context.queryKey)

        if (query) {
          query.setMeta({
            serverKeys: result.keys,
            serverTTL: result.ttl,
          })
        }

        return result.data
      }

      return result
    }
  }
}
```

## 4. QueryBehavior (Advanced)

### Intercept Fetches

```typescript
// custom-behavior.ts
import { QueryBehavior, Query } from '@tanstack/query-core'

const magicQueryBehavior: QueryBehavior = {
  onFetch: async (fetchContext, query) => {
    // Called before every fetch

    // Access fetch options
    const { fetchOptions, signal } = fetchContext

    // Can modify request before fetch
    const modifiedOptions = {
      ...fetchOptions,
      headers: {
        ...fetchOptions?.headers,
        'X-Magic-Header': 'true',
      },
    }

    // Log fetch
    console.log('Magic fetch:', query.queryKey)

    // Let original behavior continue
    // (this is for advanced use cases)
  },
}

// Apply to specific queries
const queryOptions = {
  queryKey: ['users'],
  behavior: magicQueryBehavior,
}
```

## 5. Query/Mutation Defaults

### Set Defaults Per Key

```typescript
// defaults.ts
function setupQueryDefaults(queryClient: QueryClient) {
  // Set default stale time for all "users" queries
  queryClient.setQueryDefaults(['users', 'list'], {
    staleTime: 30 * 1000, // 30 seconds
    refetchOnWindowFocus: true,
  })

  // Set default for all "config" queries
  queryClient.setQueryDefaults(['config'], {
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  })

  // Set defaults for mutations
  queryClient.setMutationDefaults(['createUser'], {
    retry: 2,
  })
}
```

### Extract Defaults from Server

```typescript
// server-defaults.ts
function extractDefaultsFromAPI(api: DeesseAPI) {
  // Walk API and extract default options from query/mutation definitions
  const defaults = {
    queries: {} as Record<string, QueryObserverOptions>,
    mutations: {} as Record<string, MutationObserverOptions>,
  }

  function walk(obj: any, path: string[] = []) {
    for (const [key, value] of Object.entries(obj)) {
      if (value?.__type === 'query') {
        // Extract defaults
        defaults.queries[path.join('.')] = {
          staleTime: value.defaultStaleTime || 30000,
          retry: value.defaultRetry || 3,
          ...value.defaultOptions,
        }
      } else if (value?.__type === 'mutation') {
        defaults.mutations[path.join('.')] = {
          retry: value.defaultRetry || 0,
          ...value.defaultOptions,
        }
      } else if (typeof value === 'object') {
        walk(value, [...path, key])
      }
    }
  }

  walk(api)

  // Apply to query client
  Object.entries(defaults.queries).forEach(([key, options]) => {
    queryClient.setQueryDefaults([key], options)
  })

  Object.entries(defaults.mutations).forEach(([key, options]) => {
    queryClient.setMutationDefaults([key], options)
  })
}
```

## 6. Direct Cache Manipulation

### Get/Set Query Data

```typescript
// cache-manipulation.ts
// Directly manipulate the cache

// Get cached data
const data = queryClient.getQueryData(['users', 'list'])

// Set cached data
queryClient.setQueryData(['users', 'list'], (old) => {
  return [...old, newUser]
})

// Get query state (includes metadata)
const state = queryClient.getQueryState(['users', 'list'])
console.log(state.status) // 'pending' | 'success' | 'error'
console.log(state.dataUpdatedAt) // timestamp

// Remove query
queryClient.removeQueries(['users', 'list'])

// Reset query
queryClient.resetQueries(['users', 'list'])
```

### Batch Operations

```typescript
// batch-operations.ts
// Get data from multiple queries

const queries = queryClient.getQueriesData({
  queryKey: ['users'], // Match all "users" queries
})

queries.forEach(([queryKey, data]) => {
  console.log(queryKey, data)
})

// Update multiple queries
queryClient.setQueriesData(
  { queryKey: ['users'] },
  (old) => old?.map((user) => ({ ...user, cached: true }))
)
```

## 7. Query State Inspection

### Inspect Query State

```typescript
// query-inspection.ts
function inspectQueries(queryClient: QueryClient) {
  const queries = queryClient.getQueries()

  queries.forEach((query) => {
    const state = query.state

    console.log({
      key: query.queryKey,
      status: state.status, // 'pending' | 'success' | 'error'
      data: state.data,
      error: state.error,
      isStale: query.isStale(),
      isActive: query.isActive(),
      dataUpdatedAt: new Date(state.dataUpdatedAt).toLocaleString(),
      errorUpdatedAt: new Date(state.errorUpdatedAt).toLocaleString(),
      fetchCount: state.fetchFailureCount,
      observers: query.observers.length,
    })
  })
}
```

## Complete Integration Example

```typescript
// magic-client.ts
import { QueryClient } from '@tanstack/query-core'
import { DeesseAPI } from './api'

export function createMagicClient(api: DeesseAPI) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
        refetchOnWindowFocus: false,
      },
    },
  })

  // 1. Extract and apply defaults from API
  extractDefaultsFromAPI(api, queryClient)

  // 2. Setup cache listeners
  const queryCache = queryClient.getQueryCache()
  const mutationCache = queryClient.getMutationCache()

  // 3. Monitor queries
  setupQueryCacheListener(queryCache)

  // 4. Auto-invalidate on mutations
  setupMutationCacheListener(mutationCache, queryClient)

  return {
    queryClient,
    api,
  }
}
```

## Summary

TanStack Query provides rich internal APIs:
- **QueryCache** - Monitor query lifecycle
- **MutationCache** - Intercept mutation results
- **QueryObserver** - Customize query behavior
- **QueryBehavior** - Intercept fetches
- **Defaults** - Apply options per key
- **Direct Access** - Get/set cache directly

These enable building a truly "magical" server-driven wrapper!
