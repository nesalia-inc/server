# Complete Magic Architecture

## Full Implementation

### File Structure

```
src/
├── magic/
│   ├── index.ts              # Main export
│   ├── client.ts            # MagicQueryClient
│   ├── query.ts             # useQuery wrapper
│   ├── mutation.ts           # useMutation wrapper
│   ├── cache.ts              # Cache utilities
│   ├── invalidation.ts       # Auto-invalidation
│   ├── keys.ts               # Key extraction
│   └── types.ts              # Type definitions
```

### Core Types

```typescript
// types.ts
import { QueryClient, QueryObserverOptions, MutationObserverOptions } from '@tanstack/query-core'

// Server API types
type QueryDefinition = {
  key: string
  path: string[]
  args: z.ZodType
  execute: (args: any, context: FetchContext) => Promise<any>
  getCacheKeys?: (args: any) => CacheKey[]
  defaultStaleTime?: number
  defaultRetry?: number
}

type MutationDefinition = {
  key: string
  path: string[]
  args: z.ZodType
  execute: (variables: any) => Promise<any>
  invalidate?: CacheKey[]
  defaultRetry?: number
}

// Cache key types
type CacheKey = string | unknown[]

// Server response types
interface ServerResult<T> {
  ok: true
  value: {
    data: T
    keys?: CacheKey[]
    invalidate?: CacheKey[]
    ttl?: number
  }
} | {
  ok: false
  error: {
    code: string
    message: string
    previous?: any
  }
}

// Magic client types
interface MagicQueryClient {
  queryClient: QueryClient
  queries: QueryDefinition[]
  mutations: MutationDefinition[]
  api: DeesseAPI
}

interface UseQueryOptions<TArgs = any, TData = any> {
  args: TArgs
  enabled?: boolean
  staleTime?: number
  refetchOnWindowFocus?: boolean
  refetchOnReconnect?: boolean
  retry?: number | boolean | ((failureCount: number, error: Error) => boolean)
}

interface UseMutationOptions<TVariables = any, TData = any> {
  onMutate?: (variables: TVariables) => void
  onSuccess?: (data: TData, variables: TVariables) => void
  onError?: (error: Error, variables: TVariables) => void
  onSettled?: (data: TData | undefined, error: Error | null, variables: TVariables) => void
}
```

### Main Client Creation

```typescript
// client.ts
import { QueryClient } from '@tanstack/query-core'
import { extractQueriesFromAPI } from './queries'
import { extractMutationsFromAPI } from './mutations'
import { setupAutoInvalidation } from './invalidation'
import { setupQueryCacheListeners } from './cache'

export interface MagicClientOptions {
  api: DeesseAPI
  queryClient?: QueryClient
  defaultOptions?: {
    queries?: QueryObserverOptions
    mutations?: MutationObserverOptions
  }
}

export function createMagicClient(options: MagicClientOptions): MagicQueryClient {
  const { api, queryClient: providedClient, defaultOptions } = options

  // Create or use provided QueryClient
  const queryClient = providedClient || new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
        refetchOnWindowFocus: false,
        retry: 3,
        ...defaultOptions?.queries,
      },
      mutations: {
        retry: 0,
        ...defaultOptions?.mutations,
      },
    },
  })

  // Extract queries and mutations from API
  const queries = extractQueriesFromAPI(api)
  const mutations = extractMutationsFromAPI(api)

  // Setup automatic invalidation
  setupAutoInvalidation(queryClient, mutations)

  // Setup query cache listeners
  setupQueryCacheListeners(queryClient)

  return {
    queryClient,
    queries,
    mutations,
    api,
  }
}
```

### Query Extraction

```typescript
// queries.ts
import { DeesseAPI } from './api'

export function extractQueriesFromAPI(api: DeesseAPI): QueryDefinition[] {
  const queries: QueryDefinition[] = []

  function walk(obj: any, path: string[] = []) {
    for (const [key, value] of Object.entries(obj)) {
      if (value?.__type === 'query') {
        queries.push({
          key: value.key || path.join('.'),
          path: [...path, key],
          args: value.args,
          execute: value.execute,
          getCacheKeys: value.getCacheKeys,
          defaultStaleTime: value.defaultStaleTime,
          defaultRetry: value.defaultRetry,
        })
      } else if (typeof value === 'object' && value !== null) {
        walk(value, [...path, key])
      }
    }
  }

  walk(api)
  return queries
}
```

### Mutation Extraction

```typescript
// mutations.ts
export function extractMutationsFromAPI(api: DeesseAPI): MutationDefinition[] {
  const mutations: MutationDefinition[] = []

  function walk(obj: any, path: string[] = []) {
    for (const [key, value] of Object.entries(obj)) {
      if (value?.__type === 'mutation') {
        mutations.push({
          key: value.key || path.join('.'),
          path: [...path, key],
          args: value.args,
          execute: value.execute,
          invalidate: value.invalidate,
          defaultRetry: value.defaultRetry,
        })
      } else if (typeof value === 'object' && value !== null) {
        walk(value, [...path, key])
      }
    }
  }

  walk(api)
  return mutations
}
```

### Auto-Invalidation

```typescript
// invalidation.ts
import { QueryClient, MutationCache } from '@tanstack/query-core'

export function setupAutoInvalidation(
  queryClient: QueryClient,
  mutations: MutationDefinition[]
) {
  const mutationCache = queryClient.getMutationCache()

  mutationCache.subscribe((event) => {
    if (event.type === 'added') {
      const mutation = event.mutation
      const mutationKey = mutation.options.mutationKey as string

      // Find mutation definition
      const mutationDef = mutations.find(m => m.key === mutationKey)

      if (mutationDef) {
        // Wrap mutation function to intercept result
        const originalFn = mutation.options.mutationFn as any

        mutation.options.mutationFn = async (variables: any) => {
          try {
            const result = await originalFn(variables)

            // Auto-invalidate based on server response
            if (result.ok && result.value?.invalidate) {
              await invalidateByKeys(queryClient, result.value.invalidate)
            }

            return result
          } catch (error) {
            throw error
          }
        }
      }
    }
  })
}

async function invalidateByKeys(
  queryClient: QueryClient,
  invalidateKeys: CacheKey[]
) {
  await queryClient.invalidateQueries({
    predicate: (query) => {
      return invalidateKeys.some(invalidKey =>
        matchesKey(query.queryKey, invalidKey)
      )
    },
  })
}

function matchesKey(queryKey: unknown[], invalidKey: CacheKey): boolean {
  const queryArr = Array.isArray(queryKey) ? queryKey : [queryKey]
  const invalidArr = Array.isArray(invalidKey) ? invalidKey : [invalidKey]

  // Exact match
  if (JSON.stringify(queryArr) === JSON.stringify(invalidArr)) {
    return true
  }

  // Prefix match
  if (queryArr.length >= invalidArr.length) {
    const prefix = queryArr.slice(0, invalidArr.length)
    if (JSON.stringify(prefix) === JSON.stringify(invalidArr)) {
      return true
    }
  }

  return false
}
```

### React Hooks

```typescript
// query.ts
import { useQuery as useTanStackQuery, UseQueryOptions as TanStackQueryOptions } from '@tanstack/query-core'
import { useMemo } from 'react'
import { useMagicClient } from './provider'
import { QueryDefinition } from './types'

export function useMagicQuery<TDef extends QueryDefinition>(
  queryDef: TDef,
  options: {
    args: any
    enabled?: boolean
    staleTime?: number
    retry?: number
  }
) {
  const { queryClient, queries } = useMagicClient()

  // Build query options
  const queryOptions = useMemo(() => {
    return buildQueryOptions(queryDef, options.args, {
      staleTime: options.staleTime,
      retry: options.retry,
    })
  }, [queryDef, options.args, options.staleTime, options.retry])

  // Add enabled
  if (options.enabled === false) {
    queryOptions.enabled = false
  }

  // Use TanStack Query
  return useTanStackQuery(queryOptions, queryClient)
}

function buildQueryOptions(
  queryDef: QueryDefinition,
  args: any,
  overrides?: Partial<TanStackQueryOptions>
): TanStackQueryOptions {
  return {
    queryKey: [queryDef.key, args],
    queryFn: async ({ signal }) => {
      const result = await queryDef.execute(args, { signal })

      // Extract data from server result
      if (result.ok) {
        return result.value.data
      }

      // Throw error
      throw new Error(result.error.message)
    },
    staleTime: queryDef.defaultStaleTime || overrides?.staleTime || 30000,
    retry: queryDef.defaultRetry || overrides?.retry || 3,
    ...overrides,
  }
}
```

```typescript
// mutation.ts
import { useMutation as useTanStackMutation, UseMutationOptions as TanStackMutationOptions } from '@tanstack/query-core'
import { useMemo } from 'react'
import { useMagicClient } from './provider'
import { MutationDefinition } from './types'

export function useMagicMutation<TDef extends MutationDefinition>(
  mutationDef: TDef,
  options?: {
    onMutate?: (variables: any) => void
    onSuccess?: (data: any, variables: any) => void
    onError?: (error: Error, variables: any) => void
    onSettled?: (data: any, error: Error | null, variables: any) => void
  }
) {
  const { queryClient, mutations } = useMagicClient()

  // Build mutation options
  const mutationOptions = useMemo(() => {
    return buildMutationOptions(mutationDef, options)
  }, [mutationDef, options])

  // Use TanStack Mutation
  return useTanStackMutation(mutationOptions, queryClient)
}

function buildMutationOptions(
  mutationDef: MutationDefinition,
  userOptions?: any
): TanStackMutationOptions {
  return {
    mutationKey: [mutationDef.key],
    mutationFn: async (variables: any) => {
      const result = await mutationDef.execute(variables)

      if (!result.ok) {
        throw new Error(result.error.message)
      }

      return result.value.data
    },
    onMutate: userOptions?.onMutate,
    onSuccess: userOptions?.onSuccess,
    onError: userOptions?.onError,
    onSettled: userOptions?.onSettled,
  }
}
```

### Provider

```typescript
// provider.tsx
import { createContext, useContext, ReactNode } from 'react'
import { QueryClient } from '@tanstack/query-core'
import { MagicQueryClient, createMagicClient } from './client'

const MagicClientContext = createContext<MagicQueryClient | null>(null)

interface ProviderProps {
  children: ReactNode
  api: DeesseAPI
  queryClient?: QueryClient
}

export function QueryClientProvider({
  children,
  api,
  queryClient,
}: ProviderProps) {
  const magicClient = useMemo(
    () => createMagicClient({ api, queryClient }),
    [api, queryClient]
  )

  return (
    <MagicClientContext.Provider value={magicClient}>
      {children}
    </MagicClientContext.Provider>
  )
}

export function useQueryClient(): MagicQueryClient {
  const client = useContext(MagicClientContext)
  if (!client) {
    throw new Error('useQueryClient must be used within QueryClientProvider')
  }
  return client
}
```

### Main Export

```typescript
// index.ts
export { QueryClientProvider, useQueryClient } from './provider'
export { createMagicClient } from './client'
export { useQuery } from './query'
export { useMutation } from './mutation'

// Types
export type { QueryDefinition, MutationDefinition, CacheKey } from './types'
```

## Usage

### Setup

```typescript
// app/providers.tsx
"use client"
import { QueryClientProvider } from "@deessejs/server/react"
import { client } from "./api"

export function Providers({ children }) {
  return (
    <QueryClientProvider client={queryClient} api={client}>
      {children}
    </QueryClientProvider>
  )
}
```

### Client Code (Magic!)

```typescript
// components/UserList.tsx
"use client"
import { useMagicQuery, useMagicMutation } from "@deessejs/server/react/magic"
import { client } from "./api"

export function UserList() {
  // Just use the API - everything automatic!
  const { data, isLoading } = useMagicQuery(client.users.list, {
    args: { limit: 10 }
  })

  if (isLoading) return <Skeleton />

  return <List users={data} />
}

export function CreateUserForm() {
  // No configuration needed!
  const { mutate } = useMagicMutation(client.users.create)

  return <Form onSubmit={mutate} />
}
```

## How It Works

```
┌──────────────────────────────────────────────────────────────┐
│                      Magic Client                             │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  1. Extract queries/mutations from API                        │
│  2. Create TanStack QueryClient                             │
│  3. Setup auto-invalidation listener                         │
│                                                               │
└───────────────────────┬──────────────────────────────────────┘
                        │
┌───────────────────────▼──────────────────────────────────────┐
│                      useMagicQuery                            │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  1. Build TanStack QueryOptions from query def               │
│  2. Add server keys to queryKey                             │
│  3. Wrap queryFn to extract result                          │
│  4. Pass to useQuery                                        │
│                                                               │
└───────────────────────┬──────────────────────────────────────┘
                        │
┌───────────────────────▼──────────────────────────────────────┐
│                      useMagicMutation                         │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  1. Build TanStack MutationOptions                          │
│  2. Wrap mutationFn to intercept result                     │
│  3. Auto-invalidate on success                              │
│  4. Pass to useMutation                                     │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

## Summary

The magic wrapper:
1. **Extracts** definitions from the API at runtime
2. **Transforms** them into TanStack Query options
3. **Wraps** functions to intercept results
4. **Auto-invalidates** based on server response
5. **Eliminates** all boilerplate

Server drives everything, client just uses the API - truly magic!
