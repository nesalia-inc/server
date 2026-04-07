# Setup Guide

Complete guide to setting up `@deessejs/drpc` with Next.js.

## 1. Define Your API

```typescript
// server/drpc.ts
import { defineContext, createAPI, createPublicAPI } from "@deessejs/drpc"
import { ok, err } from "@deessejs/core"
import { z } from "zod"

const { t, createAPI } = defineContext({
  context: { db: myDatabase },
})

// ============ PUBLIC OPERATIONS (exposed via HTTP) ============

// List users
const listUsers = t.query({
  args: z.object({
    limit: z.number().optional().default(10),
    offset: z.number().optional().default(0),
  }),
  handler: async (ctx, args) => {
    const users = await ctx.db.users.findMany({
      limit: args.limit,
      offset: args.offset,
    })
    return ok(users)
  },
})

// Get user by ID
const getUser = t.query({
  args: z.object({
    id: z.number()
  }),
  handler: async (ctx, args) => {
    const user = await ctx.db.users.find(args.id)
    if (!user) return err({ code: "NOT_FOUND", message: "User not found" })
    return ok(user)
  },
})

// Create user
const createUser = t.mutation({
  args: z.object({
    name: z.string().min(2),
    email: z.string().email()
  }),
  handler: async (ctx, args) => {
    const existing = await ctx.db.users.findByEmail(args.email)
    if (existing) return err({ code: "DUPLICATE", message: "Email already exists" })
    const user = await ctx.db.users.create(args)
    return ok(user)
  },
})

// Update user
const updateUser = t.mutation({
  args: z.object({
    id: z.number(),
    name: z.string().min(2).optional(),
    email: z.string().email().optional(),
  }),
  handler: async (ctx, args) => {
    const user = await ctx.db.users.update(args.id, {
      name: args.name,
      email: args.email,
    })
    if (!user) return err({ code: "NOT_FOUND", message: "User not found" })
    return ok(user)
  },
})

// Delete user
const deleteUser = t.mutation({
  args: z.object({
    id: z.number()
  }),
  handler: async (ctx, args) => {
    await ctx.db.users.delete(args.id)
    return ok({ success: true })
  },
})

// Search users
const searchUsers = t.query({
  args: z.object({
    query: z.string().min(1),
    limit: z.number().optional().default(10),
  }),
  handler: async (ctx, args) => {
    const users = await ctx.db.users.search(args.query, { limit: args.limit })
    return ok(users)
  },
})

// ============ INTERNAL OPERATIONS (server-only) ============

const getAdminStats = t.internalQuery({
  handler: async (ctx) => {
    const totalUsers = await ctx.db.users.count()
    return ok({ totalUsers })
  },
})

const deleteUserAdmin = t.internalMutation({
  args: z.object({
    id: z.number(),
    reason: z.string(),
  }),
  handler: async (ctx, args) => {
    await ctx.db.users.delete(args.id, { reason: args.reason })
    return ok({ success: true })
  },
})

// ============ FULL API ============

export const drpc = createAPI({
  router: t.router({
    users: t.router({
      list: listUsers,
      get: getUser,
      create: createUser,
      update: updateUser,
      delete: deleteUser,
      search: searchUsers,
    }),
  }),
})

// Client-safe API (only public operations exposed via HTTP)
export const client = createPublicAPI(drpc)
```

## 2. Expose via Route Handler

```typescript
// app/api/drpc/route.ts
import { client } from "@/server/drpc"
import { toNextJsHandler } from "@deessejs/drpc-next"

export const { POST, GET } = toNextJsHandler(client)
```

## 3. Call from Client

```typescript
// Client-side RPC call
const result = await fetch("/api/drpc", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    procedure: "users.get",
    args: { id: 123 },
  }),
})

const response = await result.json()

if (response.ok) {
  console.log(response.value) // typed user data
} else {
  console.error(response.error) // { code: "NOT_FOUND", message: "..." }
}
```

## Project Structure

```
my-app/
├── app/
│   ├── api/
│   │   └── drpc/
│   │       └── route.ts      # Route handler
│   └── admin/
│       └── page.tsx          # Server Component (uses drpc)
├── components/
│   └── UserList.tsx          # Client Component (uses client)
└── server/
    └── drpc.ts               # API definitions
```

## See Also

- [API.md](./API.md) - Route handler API reference
- [USAGE.md](./USAGE.md) - Server vs Client usage patterns
- [SECURITY.md](./SECURITY.md) - Security best practices
