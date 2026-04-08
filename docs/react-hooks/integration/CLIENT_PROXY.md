# Client Proxy: From `client.users.list` to Cache Keys

## Overview

The Client Proxy is the bridge between the developer-friendly API (`client.users.list`) and the internal cache system. It uses JavaScript's `Proxy` to intercept property access and extract path information for cache keys and type inference.

## The Problem

Developers want to write:
```typescript
const { data } = useQuery(client.users.list, { args: { limit: 10 } })
```

But internally, TanStack Query needs:
- A query key: `["users", "list", { limit: 10 }]`
- A query function that calls the API
- Type information from the server handler

## Solution: JavaScript Proxy

### How It Works

```
client.users.list
        │
        ▼
┌───────────────────┐
│   JS Proxy        │  Intercepts property access
│   (get trap)      │  Records the path
└────────┬──────────┘
         │
         ▼
   Records: ["users", "list"]
         │
         ▼
┌───────────────────┐
│   Path Tracker    │  Stores current path
│   (Symbol key)    │  on the proxy object
└────────┬──────────┘
         │
         ▼
   Returns a function that accepts args
         │
         ▼
┌───────────────────┐
│   Query Executor  │  Builds TanStack options
│   useQuery()      │  Extracts keys from response
└───────────────────┘
```

## Implementation

### 1. Create the Public API with Proxy

```typescript
// server/api.ts
import { createPublicAPI } from "@deessejs/server"

const api = createAPI({
  router: t.router({
    users: t.router({
      list: t.query({ ... }),
      get: t.query({ ... }),
      create: t.mutation({ ... }),
    }),
  }),
})

// The magic: wrap in a Proxy
export const client = createClientProxy(api)
```

### 2. The Proxy Factory

```typescript
function createClientProxy<T extends APIRouter>(api: T): T {
  // Symbol to store path on the proxy
  const PATH_KEY = Symbol("deesse_path")

  // Recursive proxy factory
  function buildProxy(prefix: string[] = []): any {
    return new Proxy(
      // The handler is a function that accepts args
      async (args: any) => {
        // This will be handled by useQuery/useMutation
        return { __deesse_path: prefix, __deesse_args: args }
      },
      {
        get(target, prop: string) {
          // Skip special properties
          if (prop === "then" || prop === "catch") return undefined

          // Build new path
          const newPath = [...prefix, prop]

          // Return new proxy for nested access
          return buildProxy(newPath)
        },
      }
    )
  }

  return buildProxy() as T
}
```

### 3. Extract Path from Proxy

```typescript
// In useQuery hook
function useQuery(clientFunction: any, options: { args: TArgs }) {
  // Extract the path that was recorded by the proxy
  const path = clientFunction.__deesse_path
  // Example: ["users", "list"]

  // Find the corresponding handler from the API
  const handler = findHandlerByPath(api, path)
  // Example: the t.query(...) definition
}
```

### 4. Finding the Handler by Path

```typescript
function findHandlerByPath(api: APIRouter, path: string[]): Handler {
  let current: any = api

  for (const segment of path) {
    current = current[segment]
    if (!current) throw new Error(`No handler found for ${path.join(".")}`)
  }

  return current // The actual query/mutation definition
}
```

## Type Inference System

### The Challenge

```typescript
// How does TypeScript know that client.users.list returns User[]?
const { data } = useQuery(client.users.list, { args: { limit: 10 } })
//           ^^^^ Should be User[]
```

### Solution: Branded Types + Inference

```typescript
// Define a branded type for queries
type QueryMarker = { __deesse_type: "query" }
type MutationMarker = { __deesse_type: "mutation" }

interface QueryDefinition<TArgs, TResponse> {
  __deesse_type: "query"
  __deesse_args: TArgs
  __deesse_response: TResponse
}

interface MutationDefinition<TArgs, TResponse> {
  __deesse_type: "mutation"
  __deesse_args: TArgs
  __deesse_response: TResponse
}

// Type-safe proxy interface
interface DeesseClient {
  users: {
    list: QueryDefinition<{ limit: number }, User[]>
    get: QueryDefinition<{ id: number }, User>
    create: MutationDefinition<{ name: string; email: string }, User>
  }
}
```

### Full Type-Safe Proxy

```typescript
function createClientProxy<T extends APIRouter>(api: T): T {
  const PROXY_DATA = Symbol("deesse_proxy_data")

  function buildProxy(segments: string[]): any {
    // Create a function that can be called
    const executor = (args: any) => {
      return {
        __deesse_path: segments,
        __deesse_args: args,
      }
    }

    // Attach path info to the function
    Object.defineProperty(executor, PROXY_DATA, {
      value: { path: segments },
      enumerable: false,
    })

    return new Proxy(executor, {
      get(target, prop: string) {
        if (prop === PROXY_DATA) {
          return target[PROXY_DATA]
        }
        if (prop === "then" || prop === "catch") {
          return undefined
        }

        // Continue building the path
        return buildProxy([...segments, prop])
      },
    })
  }

  return buildProxy([]) as T
}
```

### Type Extraction Utilities

```typescript
// Extract query return type from API
type QueryResponse<TAPI, TPath extends string[]> = TPath extends [
  infer First,
  ...infer Rest
]
  ? First extends keyof TAPI
    ? Rest extends []
      ? TAPI[First] extends { __deesse_response: infer R }
        ? R
        : never
      : QueryResponse<TAPI[First], Rest>
    : never
  : never

// Usage
type UserListResponse = QueryResponse<typeof client, ["users", "list"]>
// = User[]
```

## Cache Key Generation

### From Path to Query Key

```typescript
function buildQueryKey(
  path: string[],      // ["users", "list"]
  args: any           // { limit: 10 }
): QueryKey {
  // Step 1: Normalize args (stable stringify)
  const normalizedArgs = stableStringify(args)
  // { limit: 10 } -> { limit: 10 } (sorted keys)

  // Step 2: Build the key
  return [...path, normalizedArgs]
  // ["users", "list", { limit: 10 }]
}

// Stable stringify - sorts object keys alphabetically
function stableStringify(obj: any): any {
  if (typeof obj !== "object" || obj === null) return obj

  if (Array.isArray(obj)) {
    return obj.map(stableStringify)
  }

  return Object.keys(obj)
    .sort()
    .reduce((result, key) => {
      result[key] = stableStringify(obj[key])
      return result
    }, {} as any)
}
```

### Key Matching for Invalidation

```typescript
// Server returns: invalidate: [["users", "list"]]
// Query key: ["users", "list", { limit: 10 }]

function matchesKey(queryKey: QueryKey, invalidateKey: CacheKey): boolean {
  // Exact match
  if (JSON.stringify(queryKey) === JSON.stringify(invalidateKey)) {
    return true
  }

  // Prefix match - invalidateKey is a prefix of queryKey
  if (queryKey.slice(0, invalidateKey.length).every(
    (k, i) => JSON.stringify(k) === JSON.stringify(invalidateKey[i])
  )) {
    return true
  }

  return false
}

// Usage
queryClient.invalidateQueries({
  predicate: (query) => {
    return invalidateKeys.some((key) => matchesKey(query.queryKey, key))
  },
})
```

## Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        DEVELOPER CODE                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   const { data } = useQuery(client.users.list, {                   │
│     args: { limit: 10 }                                            │
│   })                                                                │
│                                                                     │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        PROXY INTERCEPTION                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   client.users.list                                                │
│         │                                                          │
│         ▼                                                          │
│   ┌─────────────────────────────────────────┐                       │
│   │  Proxy get trap: prop = "users"         │                       │
│   │  Path becomes: ["users"]               │                       │
│   │  Returns new proxy                      │                       │
│   └─────────────────────────────────────────┘                       │
│         │                                                          │
│         ▼                                                          │
│   ┌─────────────────────────────────────────┐                       │
│   │  Proxy get trap: prop = "list"          │                       │
│   │  Path becomes: ["users", "list"]         │                       │
│   │  Returns executable function             │                       │
│   └─────────────────────────────────────────┘                       │
│                                                                     │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        PATH EXTRACTION                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   useQuery receives:                                               │
│   - path: ["users", "list"]                                        │
│   - args: { limit: 10 }                                           │
│                                                                     │
│   Looks up handler in API:                                        │
│   - handler = api.users.list (the t.query)                         │
│                                                                     │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        OPTIONS BUILDING                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   queryKey: ["users", "list", { limit: 10 }]  (stable stringify)   │
│                                                                     │
│   queryFn: async () => {                                           │
│     const result = await handler.execute({ limit: 10 })            │
│     // Result: ok(users, { keys: [["users", "list"]] })            │
│     return result.value.data                                       │
│   }                                                                 │
│                                                                     │
│   staleTime: 5 * 60 * 1000  (from handler config)                  │
│                                                                     │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        TANSTACK QUERY                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   - Stores query with key ["users", "list", { limit: 10 }]         │
│   - Executes queryFn                                              │
│   - Caches result                                                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## TypeScript Complete Example

```typescript
// ===== SERVER SIDE =====

// Define the API with full types
const api = createAPI({
  router: t.router({
    users: t.router({
      list: t.query({
        args: z.object({ limit: z.number().default(10) }),
        handler: async (ctx, args) => {
          const users = await ctx.db.users.findMany({ take: args.limit })
          return ok(users, {
            keys: [["users", "list", { limit: args.limit }]]
          })
        },
      }),
      get: t.query({
        args: z.object({ id: z.number() }),
        handler: async (ctx, args) => {
          const user = await ctx.db.users.findUnique({ where: { id: args.id } })
          if (!user) return err({ code: "NOT_FOUND" })
          return ok(user, { keys: [["users", { id: args.id }]] })
        },
      }),
      create: t.mutation({
        args: z.object({
          name: z.string(),
          email: z.string().email(),
        }),
        handler: async (ctx, args) => {
          const user = await ctx.db.users.create(args)
          return ok(user, { invalidate: [["users", "list"]] })
        },
      }),
    }),
  }),
})

// Create public API (strips internals)
export const client = createPublicAPI(api)

// ===== CLIENT SIDE =====

// TypeScript automatically infers:
// - client.users.list is QueryDefinition<{limit: number}, User[]>
// - client.users.get is QueryDefinition<{id: number}, User>
// - client.users.create is MutationDefinition<{name: string; email: string}, User>

function UserList() {
  // data is typed as User[]
  const { data, isLoading } = useQuery(client.users.list, {
    args: { limit: 10 }
  })

  if (isLoading) return <Skeleton />

  return (
    <ul>
      {data.map(user => (
        <li key={user.id}>{user.name}</li>
      ))}
    </ul>
  )
}

function CreateUser() {
  // mutate is typed with args: { name: string; email: string }
  // onSuccess callback has typed data: User
  const { mutate, isPending } = useMutation(client.users.create, {
    onSuccess: (data) => {
      // data is User - full type inference!
      console.log("Created:", data.id)
    },
    onError: (error) => {
      // error has typed code from server
      if (error.code === "DUPLICATE_EMAIL") {
        // Handle specific error
      }
    },
  })

  return (
    <button onClick={() => mutate({ name: "John", email: "john@example.com" })}>
      Create
    </button>
  )
}
```

## Benefits

| Aspect | How the Proxy Solves It |
|--------|------------------------|
| **Developer Experience** | `client.users.list` is intuitive and IDE-friendly |
| **Type Safety** | Full inference from server handler types |
| **Cache Keys** | Automatic generation from path + args |
| **Navigation** | Cmd+Click on client.users.list goes to server handler |
| **Magic** | No manual key definition needed |

## Key Implementation Details

1. **Stable Stringify**: Sort object keys alphabetically so `{ limit: 10 }` and `{ 10: limit }` produce the same cache key

2. **Prefix Matching**: Invalidating `["users", "list"]` should invalidate `["users", "list", { limit: 10 }]` and `["users", "list", { page: 2 }]`

3. **Proxy Chain**: Each property access creates a new proxy, building the path incrementally

4. **Symbol Storage**: Use symbols to store metadata on the proxy without polluting the object

5. **Handler Lookup**: Map the path array to the actual server handler for execution

The proxy is the magic that makes the entire system feel seamless while maintaining full type safety!