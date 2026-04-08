# Quick Start

This guide shows how to use `@deessejs/server/react` with the magic wrapper - zero configuration, automatic everything.

## Setup

### 1. Install

```bash
pnpm add @deessejs/server @deessejs/server/react
```

### 2. Create API (Server)

```typescript
// server/api.ts
import { defineContext, createAPI, createPublicAPI } from "@deessejs/server"
import { ok } from "@deessejs/server"
import { z } from "zod"

const { t, createAPI } = defineContext({
  context: { db }
})

// Query with automatic cache keys
const listUsers = t.query({
  args: z.object({
    limit: z.number().default(10)
  }),
  handler: async (ctx, args) => {
    const users = await ctx.db.users.findMany({ take: args.limit })
    return ok(users, {
      keys: [["users", "list", { limit: args.limit }]]
    })
  }
})

// Mutation with automatic invalidation
const createUser = t.mutation({
  args: z.object({
    name: z.string(),
    email: z.string().email()
  }),
  handler: async (ctx, args) => {
    const user = await ctx.db.users.create(args)
    return ok(user, {
      invalidate: [["users", "list"]]
    })
  }
})

const api = createAPI({
  router: t.router({
    users: t.router({
      list: listUsers,
      create: createUser,
    }),
  }),
})

// Client-safe API
export const client = createPublicAPI(api)
```

### 3. Setup Provider

```tsx
// app/providers.tsx
"use client"
import { QueryClientProvider } from "@deessejs/server/react"
import { client } from "./server/api"

export function Providers({ children }) {
  return (
    <QueryClientProvider client={queryClient} api={client}>
      {children}
    </QueryClientProvider>
  )
}
```

## Usage

That's it! Now just use the API:

### Queries

```tsx
// Just use the API - everything automatic!
function UserList() {
  const { data, isLoading } = useQuery(client.users.list, {
    args: { limit: 10 }
  })

  if (isLoading) return <Skeleton />

  return <List users={data} />
}
```

### Mutations

```tsx
// No configuration needed!
function CreateUserForm() {
  const { mutate } = useMutation(client.users.create)

  return (
    <Form onSubmit={mutate} />
  )
}
```

The mutation automatically:
- Calls the API
- On success: refetches `client.users.list`
- Returns the result

## What's Magic?

| Normally | With Magic |
|----------|-------------|
| Define queryKey manually | From server `keys` |
| Add onSuccess to invalidate | From server `invalidate` |
| Configure staleTime | From server `ttl` |
| Handle loading/error | Built-in |

## Complete Example

```tsx
// app/page.tsx
import { useQuery, useMutation } from "@deessejs/server/react"
import { client } from "./server/api"

export default function Dashboard() {
  // Queries - automatic caching
  const { data: users, isLoading: usersLoading } = useQuery(
    client.users.list,
    { args: { limit: 10 } }
  )

  // Mutations - automatic invalidation
  const { mutate: createUser } = useMutation(client.users.create)

  // That's it! No configuration needed.
}
```

No setup, no boilerplate, just works!
