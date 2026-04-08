# Setup Guide

Complete guide to setting up `@deessejs/server` with Next.js.

## 1. Define Your API

```typescript
// server/drpc.ts
import { defineContext, createAPI, createClient } from "@deessejs/server"
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

// Client-safe API - filters internal operations, passed to route handler
export const client = createClient(drpc)
```

## 2. Expose via Route Handler

```typescript
// app/api/drpc/[...slug]/route.ts - Catch-all route
import { client } from "@/server/drpc"
import { toNextJsHandler } from "@deessejs/server-next"

export const { GET, POST, PUT, PATCH, DELETE } = toNextJsHandler(client)
```

## 3. Call from Client

```typescript
// Client-side RPC call - procedure name in URL path
const response = await fetch("/api/drpc/users/get?args={\"id\":1}", {
  method: "GET",
})

const { ok, value, error } = await response.json()

if (ok) {
  console.log(value) // typed user data
} else {
  console.error(error) // { code: "NOT_FOUND", message: "..." }
}
```

## Project Structure

```
my-app/
├── app/
│   ├── api/
│   │   └── drpc/
│   │       └── [...slug]/
│   │           └── route.ts  # Catch-all route handler
│   └── admin/
│       └── page.tsx          # Server Component (uses drpc directly)
├── components/
│   └── UserList.tsx          # Client Component (calls via fetch)
└── server/
    └── drpc.ts               # API definitions
```

## See Also

- [API.md](./API.md) - Route handler API reference
- [USAGE.md](./USAGE.md) - Server vs Client usage patterns
- [SECURITY.md](./SECURITY.md) - Security best practices
