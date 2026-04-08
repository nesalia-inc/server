# Client System

The client system enables React components to interact with the server API with automatic cache synchronization.

## Packages

| Package | Description |
|---------|-------------|
| `@deessejs/server` | Server-side API definitions |
| `@deessejs/server/react` | React hooks for client-side usage |
| `@deessejs/server-next` | Next.js integration utilities |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Client                               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────┐      ┌─────────────────────┐      │
│  │  Server Components  │      │  Client Components  │      │
│  │                     │      │                     │      │
│  │  api.users.get()    │      │  useQuery()         │      │
│  │  (direct call)     │      │  useMutation()      │      │
│  └─────────────────────┘      └─────────────────────┘      │
│              │                         │                    │
│              └───────────┬─────────────┘                    │
│                          │                                  │
│              ┌───────────▼───────────┐                      │
│              │     client        │                      │
│              │  (createPublicAPI)   │                      │
│              └───────────┬───────────┘                      │
│                          │                                  │
└──────────────────────────┼──────────────────────────────────┘
                           │ HTTP
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                        Server                                │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────┐      ┌─────────────────────┐       │
│  │  createRouteHandler │      │  Direct calls       │       │
│  │  (exposes public)  │      │  (public + internal)│       │
│  └─────────────────────┘      └─────────────────────┘       │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## Public vs Internal API

### Server Side (Full Access)

```typescript
// server/api.ts
import { defineContext, createAPI, createPublicAPI } from "@deessejs/server"
import { z } from "zod"

const { t, createAPI } = defineContext({
  context: { db: myDatabase }
})

// Public query - exposed via HTTP
const getUser = t.query({
  args: z.object({
    id: z.number()
  }),
  handler: async (ctx, args) => { ... }
})

// Public mutation - exposed via HTTP
const createUser = t.mutation({
  args: z.object({
    name: z.string()
  }),
  handler: async (ctx, args) => { ... }
})

// Internal query - NOT exposed via HTTP
const getAdminStats = t.internalQuery({
  handler: async (ctx) => { ... }
})

// Internal mutation - NOT exposed via HTTP
const deleteUser = t.internalMutation({
  args: z.object({
    id: z.number()
  }),
  handler: async (ctx, args) => { ... }
})

const api = createAPI({
  router: t.router({
    users: t.router({
      get: getUser,
      create: createUser,
      getAdminStats: getAdminStats,
      delete: deleteUser,
    }),
  }),
})

// Client-safe API - only public operations
const client = createPublicAPI(api)

export { api, client }
```

### Server Components

```typescript
// app/admin/page.tsx (Server Component)
import { api } from "@/server/api"

export default async function AdminPage() {
  // Can call ALL operations (public + internal)
  const users = await api.users.get({})
  const stats = await api.users.getAdminStats({})  // ✅ Works
  await api.users.delete({ id: 1 })                // ✅ Works
}
```

### Client Components

```typescript
// app/components/UserList.tsx (Client Component)
"use client"
import { client } from "@/server/api"

async function UserList() {
  // Can only call PUBLIC operations
  const users = await client.users.get({})       // ✅ Works
  await client.users.create({ name: "John" })    // ✅ Works

  // TypeScript error - internal operations don't exist!
  const stats = await client.users.getAdminStats({})  // ❌ TS Error
  await client.users.delete({ id: 1 })               // ❌ TS Error
}
```

## HTTP Exposure

### Route Handler

```typescript
// app/api/[...slug]/route.ts
import { createRouteHandler } from "@deessejs/server-next"
import { client } from "@/server/api"

export const POST = createRouteHandler(client)
```

### Client HTTP Calls

```typescript
// Call via fetch
const response = await fetch("/api/users.get", {
  method: "POST",
  body: JSON.stringify({ args: { id: 123 } }),
})
const result = await response.json()
```

## React Hooks

Install the React package:

```bash
pnpm add @deessejs/server/react
```

### QueryClientProvider

```tsx
// app/providers.tsx
"use client"
import { QueryClientProvider } from "@deessejs/server/react"
import { client } from "@/server/api"

const queryClient = new QueryClient()

export function Providers({ children }) {
  return (
    <QueryClientProvider client={queryClient} api={client}>
      {children}
    </QueryClientProvider>
  )
}
```

### useQuery

```typescript
import { useQuery } from "@deessejs/server/react"

function UserProfile({ userId }: { userId: number }) {
  const { data, isLoading, isError, error, refetch } = useQuery(
    api.users.get,
    {
      args: { id: userId },
      enabled: !!userId,
      staleTime: 5 * 60 * 1000,
    }
  )

  if (isLoading) return <Skeleton />
  if (isError) return <Error message={error.message} />

  return <div>{data.name}</div>
}
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `args` | object | required | Arguments for the query |
| `enabled` | boolean | true | Whether to run the query |
| `staleTime` | number | 0 | Time in ms before data is stale |
| `refetchOnWindowFocus` | boolean | false | Refetch when window gains focus |

**Result:**

| Property | Type | Description |
|----------|------|-------------|
| `data` | T \| undefined | Query result data |
| `isLoading` | boolean | Initial loading state |
| `isError` | boolean | Error state |
| `error` | Error \| null | Error object |
| `refetch` | () => Promise | Manual refetch function |

### useMutation

```typescript
import { useMutation } from "@deessejs/server/react"

function CreateUserForm() {
  const { mutate, mutateAsync, isLoading, isError, error, data } = useMutation(
    api.users.create
  )

  const handleSubmit = async (formData: { name: string }) => {
    try {
      const user = await mutate(formData)
      console.log("Created:", user)
    } catch (e) {
      console.error("Error:", error.message)
    }
  }

  return <Form onSubmit={handleSubmit} disabled={isLoading} />
}
```

**Options:**

| Option | Type | Description |
|--------|------|-------------|
| `onSuccess` | (data) => void | Callback on success |
| `onError` | (error) => void | Callback on error |

**Result:**

| Property | Type | Description |
|----------|------|-------------|
| `mutate` | (args) => void | Execute mutation (fire and forget) |
| `mutateAsync` | (args) => Promise | Execute mutation with Promise |
| `isLoading` | boolean | Mutation in progress |
| `isError` | boolean | Error state |
| `error` | Error \| null | Error object |
| `data` | T \| undefined | Result data |

## Cache System

### Query Cache Keys

Queries return cache keys that are stored in the client:

```typescript
// Server definition
import { z } from "zod"

const getUser = t.query({
  args: z.object({
    id: z.number()
  }),
  handler: async (ctx, args) => {
    const user = await ctx.db.users.find(args.id)
    return withMetadata(user, { keys: [["users", { id: args.id }]] })
  }
})
```

### Mutation Invalidation

Mutations return invalidation keys that trigger refetch:

```typescript
// Server definition
const createUser = t.mutation({
  args: z.object({
    name: z.string()
  }),
  handler: async (ctx, args) => {
    const user = await ctx.db.users.create(args)
    return withMetadata(user, { invalidate: [["users", "list"]] })
  }
})
```

### Automatic Flow

```
1. useQuery(api.users.list)
   │
   ▼
2. Fetch from server
   │
   ▼
3. Server returns: { value: [...], keys: [["users", "list"]] }
   │
   ▼
4. Client stores cache with keys

---

5. useMutation(api.users.create)
   │
   ▼
6. Server processes mutation
   │
   ▼
7. Server returns: { value: user, invalidate: [["users", "list"]] }
   │
   ▼
8. Client automatically refetches queries with matching keys
```

### Manual Cache Manipulation

```typescript
import { useQueryClient } from "@deessejs/server/react"

function UpdateUserButton({ userId, name }) {
  const queryClient = useQueryClient()

  const { mutate } = useMutation(api.users.update, {
    onSuccess: (data) => {
      // Direct cache update
      queryClient.setQueryData(["users", { id: userId }], data)
    }
  })

  return <button onClick={() => mutate({ id: userId, name })}>Update</button>
}
```

## Next.js Integration

### SSR with Hydration

```typescript
// app/users/page.tsx (Server Component)
import { dehydrate, HydrationBoundary } from "@deessejs/server/react"
import { api } from "@/server/api"
import { UserList } from "./UserList"

export default async function UsersPage() {
  const queryClient = new QueryClient()

  // Prefetch on server
  await queryClient.prefetchQuery(api.users.list, {
    args: { limit: 10 }
  })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <UserList />
    </HydrationBoundary>
  )
}
```

### clientComponent

```typescript
// components/TaskList.tsx
"use client"
import { clientComponent } from "@deessejs/server-next"

export const TaskList = clientComponent({
  query: api.tasks.list,
  args: { limit: 10 },
  render: ({ data }) => {
    return <ul>{data.map(task => <li>{task.title}</li>)}</ul>
  }
})
```

## Best Practices

### 1. Use client for Client Components

```typescript
// ❌ Wrong - uses full API
import { api } from "@/server/api"

// ✅ Correct - uses public API only
import { client } from "@/server/api"
```

### 2. Define Cache Keys in Queries

```typescript
// ✅ Good - keys defined
const getUser = t.query({
  handler: async (ctx, args) => {
    return withMetadata(user, { keys: [["users", { id: args.id }]] })
  }
})

// ❌ Bad - no keys
const getUser = t.query({
  handler: async (ctx, args) => {
    return ok(user)
  }
})
```

### 3. Define Invalidate in Mutations

```typescript
// ✅ Good - invalidation defined
const createUser = t.mutation({
  handler: async (ctx, args) => {
    return withMetadata(user, { invalidate: [["users", "list"]] })
  }
})

// ❌ Bad - no invalidation
const createUser = t.mutation({
  handler: async (ctx, args) => {
    return ok(user)
  }
})
```

### 4. Use enabled for Dependent Queries

```typescript
// Only fetch posts when user is loaded
const { data: user } = useQuery(api.users.get, {
  args: { id: userId },
  enabled: !!userId
})

const { data: posts } = useQuery(api.posts.listByUser, {
  args: { userId },
  enabled: !!user // Only runs when user is loaded
})
```

## Security Summary

| Operation | Callable via HTTP | Callable from Server |
|-----------|-------------------|---------------------|
| `query()` | ✅ Yes | ✅ Yes |
| `mutation()` | ✅ Yes | ✅ Yes |
| `internalQuery()` | ❌ No | ✅ Yes |
| `internalMutation()` | ❌ No | ✅ Yes |

This ensures sensitive operations (admin actions, privileged mutations) remain secure and can only be called from server-side code.
