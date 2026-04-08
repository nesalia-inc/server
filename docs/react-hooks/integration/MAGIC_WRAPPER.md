# Magic Wrapper: Server-Driven TanStack Query

## Concept

The goal is to create a **transparent wrapper** around TanStack Query where the server automatically manages:
- Cache keys (what to cache)
- Invalidation (what to refetch)
- Optimistic updates
- Retry logic

The client just uses the API, and everything else happens automatically.

```
┌─────────────────────────────────────────────────────────────┐
│                     Client Code                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  useQuery(api.users.list)  // That's it!                   │
│                                                              │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│                   Magic Wrapper Layer                        │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Extract keys from query definition                      │
│  2. Build TanStack Query options                            │
│  3. Subscribe to mutation results                           │
│  4. Auto-invalidate based on server response                │
│                                                              │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│                   TanStack Query Core                       │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  QueryCache, MutationCache, QueryObserver                   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## How It Works

### 1. Server Defines Everything

```typescript
// Server: api/users.ts
const listUsers = t.query({
  args: z.object({ limit: z.number().default(10) }),
  handler: async (ctx, args) => {
    const users = await ctx.db.users.findMany({ take: args.limit })

    // Server decides cache keys
    return ok(users, {
      keys: [['users', 'list', { limit: args.limit }]]
    })
  }
})

const createUser = t.mutation({
  args: z.object({ name: z.string(), email: z.string() }),
  handler: async (ctx, args) => {
    const user = await ctx.db.users.create(args)

    // Server decides what to invalidate
    return ok(user, {
      invalidate: [['users', 'list']]
    })
  }
})
```

### 2. Client Just Uses It

```typescript
// Client: That's ALL the code needed!
import { createMagicQueryClient } from "@deessejs/server/react"

const queryClient = createMagicQueryClient({
  api: client, // The client API from @deessejs/server
})

// No configuration needed - magic happens automatically
function UserList() {
  const { data, isLoading } = useQuery(client.users.list, {
    args: { limit: 10 }
  })

  // data is automatically cached
  // When createUser mutation succeeds, this auto-refetches
  // No manual invalidation needed!

  return <List users={data} />
}

function CreateUserForm() {
  const { mutate } = useMutation(client.users.create)

  // That's it! No onSuccess callback needed
  return <Form onSubmit={mutate} />
}
```

## The Magic Implementation

### Core Wrapper: createMagicQueryClient

```typescript
import { QueryClient } from '@tanstack/query-core'
import { MutationObserver, QueryObserver } from '@tanstack/query-core'

interface MagicQueryClientOptions {
  api: DeesseAPI // The client API from @deessejs/server
  queryClient?: QueryClient
  defaultOptions?: {
    queries?: QueryObserverOptions
    mutations?: MutationObserverOptions
  }
}

function createMagicQueryClient(options: MagicQueryClientOptions) {
  const { api, defaultOptions } = options

  // Create or use existing QueryClient
  const queryClient = options.queryClient || new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000, // 5 minutes
        ...defaultOptions?.queries,
      },
      mutations: {
        ...defaultOptions?.mutations,
      },
    },
  })

  // Extract all queries and mutations from API
  const queries = extractQueriesFromAPI(api)
  const mutations = extractMutationsFromAPI(api)

  // Setup automatic invalidation
  setupAutoInvalidation(queryClient, mutations)

  return {
    queryClient,
    queries,
    mutations,
  }
}
```

### Extract Query Definitions

```typescript
function extractQueriesFromAPI(api: DeesseAPI): QueryDefinition[] {
  const queries: QueryDefinition[] = []

  function walk(obj: any, path: string[] = []) {
    for (const [key, value] of Object.entries(obj)) {
      if (value?.__type === 'query') {
        queries.push({
          path: [...path, key],
          key: value.key,
          args: value.args,
          // Extract cache keys from handler metadata
          getCacheKeys: value.getCacheKeys || (() => []),
        })
      } else if (typeof value === 'object') {
        walk(value, [...path, key])
      }
    }
  }

  walk(api)
  return queries
}
```

### Setup Auto-Invalidation

```typescript
function setupAutoInvalidation(
  queryClient: QueryClient,
  mutations: MutationDefinition[]
) {
  // Subscribe to mutation cache
  const mutationCache = queryClient.getMutationCache()

  mutationCache.subscribe((event) => {
    if (event.type === 'added') {
      const mutation = event.mutation

      // Get the mutation options
      const mutationFn = mutation.options.mutationFn
      const mutationKey = mutation.options.mutationKey

      // Find the mutation definition
      const mutationDef = mutations.find(m => m.key === mutationKey)

      if (mutationDef) {
        // Override the mutation to add auto-invalidation
        const originalFn = mutationFn
        mutation.options.mutationFn = async (variables) => {
          // Execute mutation
          const result = await originalFn(variables)

          // Check if result has invalidate keys
          if (result.ok && result.value?.invalidate) {
            const invalidateKeys = result.value.invalidate

            // Auto-invalidate queries with matching keys
            await queryClient.invalidateQueries({
              predicate: (query) => {
                const queryKey = query.queryKey
                return matchesKeys(queryKey, invalidateKeys)
              },
            })
          }

          return result
        }
      }
    }
  })
}

// Key matching logic
function matchesKeys(queryKey: QueryKey, invalidateKeys: CacheKey[]): boolean {
  for (const invalidKey of invalidateKeys) {
    // Exact match
    if (JSON.stringify(queryKey) === JSON.stringify(invalidKey)) {
      return true
    }

    // Prefix match
    const prefix = Array.isArray(invalidKey)
      ? invalidKey[0]
      : invalidKey

    if (queryKey[0] === prefix) {
      return true
    }
  }

  return false
}
```

## Automatic Query Building

### From API Definition to TanStack Options

```typescript
function buildQueryOptions<TQuery extends QueryDefinition>(
  queryDef: TQuery,
  clientArgs: any
): UseQueryOptions {
  // Build the query key from args
  const queryKey = buildQueryKey(queryDef, clientArgs)

  // Build the query function
  const queryFn = async ({ signal }) => {
    const result = await queryDef.execute(clientArgs, { signal })

    // Extract keys from result metadata
    if (result.ok && result.value?.keys) {
      // Store keys in query metadata for later use
      return {
        data: result.value,
        __cacheKeys: result.value.keys,
      }
    }

    return result
  }

  return {
    queryKey,
    queryFn,
    // Extract staleTime from server if available
    staleTime: queryDef.defaultStaleTime,
    // Extract retry from server if available
    retry: queryDef.defaultRetry,
  }
}

function buildQueryKey(queryDef: QueryDefinition, args: any): QueryKey {
  // Transform args to match server's cache key format
  const normalizedArgs = normalizeArgs(queryDef.args, args)
  return [queryDef.key, normalizedArgs]
}
```

## Magic useQuery Hook

```typescript
function useMagicQuery<TQuery extends Query>(
  query: TQuery,
  options: {
    args: QueryArgs<TQuery>
    enabled?: boolean
    staleTime?: number
    // ... other TanStack options
  }
) {
  const { queryClient, queries } = useMagicQueryClient()

  // Get query definition
  const queryDef = queries.find(q => q.key === query.key)

  // Build TanStack options
  const queryOptions = useMemo(() => {
    return buildQueryOptions(queryDef, options.args)
  }, [queryDef, options.args])

  // Merge with user options (user options take precedence)
  const mergedOptions = {
    ...queryOptions,
    ...options,
    // Don't let user override queryFn - we handle that
    queryFn: queryOptions.queryFn,
  }

  // Use TanStack's useQuery under the hood
  return useQuery(mergedOptions, queryClient)
}
```

## Magic useMutation Hook

```typescript
function useMagicMutation<TMutation extends Mutation>(
  mutation: TMutation,
  options?: MutationOptions
) {
  const { queryClient, mutations } = useMagicQueryClient()

  // Get mutation definition
  const mutationDef = mutations.find(m => m.key === mutation.key)

  // Build mutation options with auto-invalidation
  const mutationOptions = useMemo(() => {
    return {
      mutationKey: mutationDef.key,
      mutationFn: async (variables) => {
        const result = await mutationDef.execute(variables)

        // Auto-invalidate after success
        if (result.ok && result.value?.invalidate) {
          await queryClient.invalidateQueries({
            predicate: (query) => {
              return matchesKeys(query.queryKey, result.value.invalidate)
            }
          })
        }

        return result
      },
      ...options,
    }
  }, [mutationDef, options])

  // Use TanStack's useMutation
  return useMutation(mutationOptions, queryClient)
}
```

## Putting It All Together

### Provider Setup

```typescript
// providers.tsx
"use client"
import { QueryClientProvider } from "@deessejs/server/react"
import { client } from "./api"

const { queryClient, queries, mutations } = createMagicQueryClient({
  api: client,
})

export function Providers({ children }) {
  return (
    <QueryClientProvider
      client={queryClient}
      queries={queries}
      mutations={mutations}
    >
      {children}
    </QueryClientProvider>
  )
}
```

### User Code (Magic!)

```typescript
// That's ALL the client needs to write!

function UserList() {
  // Automatic caching based on server response
  const { data, isLoading } = useQuery(client.users.list, {
    args: { limit: 10 }
  })

  // Automatic refetch on mutation success
  return <List users={data} />
}

function CreateUser() {
  // Automatic invalidation - no callbacks needed!
  const { mutate } = useMutation(client.users.create)

  return <Form onSubmit={mutate} />
}

function UserProfile({ userId }) {
  // Dependent queries work automatically
  const { data: user } = useQuery(client.users.get, {
    args: { id: userId }
  })

  const { data: posts } = useQuery(client.posts.listByUser, {
    args: { userId: user?.id },
    enabled: !!user // Only runs when user is loaded
  })

  return <Profile user={user} posts={posts} />
}
```

## Comparison: Without vs With Magic

### Without Magic (Current)

```typescript
// Client must manually handle everything

function UserList() {
  const queryClient = useQueryClient()

  const { data } = useQuery({
    queryKey: ['users', 'list', limit],
    queryFn: () => client.users.list({ limit }),
  })

  return <List users={data} />
}

function CreateUserForm() {
  const queryClient = useQueryClient()

  const { mutate } = useMutation({
    mutationFn: (data) => client.users.create(data),
    onSuccess: () => {
      // Manual invalidation!
      queryClient.invalidateQueries({
        queryKey: ['users', 'list']
      })
    },
  })

  return <Form onSubmit={mutate} />
}
```

### With Magic

```typescript
// Just use the API - everything else is automatic

function UserList() {
  const { data } = useQuery(client.users.list, {
    args: { limit: 10 }
  })

  return <List users={data} />
}

function CreateUserForm() {
  const { mutate } = useMutation(client.users.create)

  return <Form onSubmit={mutate} />
}
```

## Benefits

| Aspect | Without Magic | With Magic |
|--------|--------------|------------|
| Cache Keys | Manual definition | From server |
| Invalidation | Manual callbacks | Automatic |
| Type Safety | Partial | Full |
| Boilerplate | Lots | Minimal |
| Mutations | Manual setup | Works out of box |
| Retry Logic | Manual | From server config |

## Summary

The magic wrapper:
1. **Extracts** query/mutation definitions from the API
2. **Transforms** them into TanStack Query options
3. **Intercepts** mutation results for auto-invalidation
4. **Eliminates** all boilerplate for the developer

The server drives everything, the client just uses the API - truly magic!
