# Next.js Integration Specification

## Overview

`@deessejs/drpc-next` provides a Next.js integration for `@deessejs/drpc` that enables:
1. HTTP exposure of public queries and mutations via route handlers
2. Automatic cache revalidation across components (with `@deessejs/drpc/react`)
3. Type-safe RPC calls between client and server

## Quick Start

The simplest way to expose your drpc API in Next.js:

```typescript
// app/api/drpc/route.ts
import { drpc } from "@/server/drpc"
import { toNextJsHandler } from "@deessejs/drpc-next"

export const { POST, GET } = toNextJsHandler(drpc)
```

That's it. The handler automatically:
- Exposes all `query()` and `mutation()` operations via HTTP
- Protects `internalQuery()` and `internalMutation()` (server-only)
- Handles JSON serialization/deserialization
- Returns typed responses

## Security Model

Next.js route handlers are exposed via HTTP and can be called by anyone. Use this package's architecture to protect sensitive operations:

- Use `query()` / `mutation()` for public operations (exposed via HTTP)
- Use `internalQuery()` / `internalMutation()` for private operations (server-only)

| Operation Type | Callable via HTTP | Callable from Server |
|---------------|-------------------|---------------------|
| `query()` | Yes | Yes |
| `mutation()` | Yes | Yes |
| `internalQuery()` | No | Yes |
| `internalMutation()` | No | Yes |

## API Reference

### toNextJsHandler

Creates Next.js route handlers from a drpc API instance.

```typescript
import { toNextJsHandler } from "@deessejs/drpc-next"

export const { POST, GET } = toNextJsHandler(drpc)
```

The handler supports both POST and GET requests:
- **POST** - JSON body with `{ procedure: "namespace.name", args: { ... } }`
- **GET** - Query params with `?procedure=namespace.name&args=...`

### createRouteHandler (Alternative)

For more control over the route handler configuration:

```typescript
import { createRouteHandler } from "@deessejs/drpc-next"
import { drpc } from "@/server/drpc"

export const POST = createRouteHandler(drpc)
```

## Setup

### 1. Define Your API

```typescript
// server/drpc.ts
import { defineContext, createAPI, createPublicAPI } from "@deessejs/drpc"
import { ok, err } from "@deessejs/core"
import { z } from "zod"

const { t, createAPI } = defineContext({
  context: { db: myDatabase },
})

// Public operations (exposed via HTTP)
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

const createUser = t.mutation({
  args: z.object({
    name: z.string().min(2),
    email: z.string().email()
  }),
  handler: async (ctx, args) => {
    const user = await ctx.db.users.create(args)
    return ok(user)
  },
})

// Internal operations (server-only)
const deleteUser = t.internalMutation({
  args: z.object({
    id: z.number()
  }),
  handler: async (ctx, args) => {
    await ctx.db.users.delete(args.id)
    return ok({ success: true })
  },
})

const getAdminStats = t.internalQuery({
  handler: async (ctx) => {
    const totalUsers = await ctx.db.users.count()
    return ok({ totalUsers })
  },
})

// Full API for server usage
export const drpc = createAPI({
  router: t.router({
    users: t.router({
      get: getUser,
      create: createUser,
      delete: deleteUser,
      getAdminStats: getAdminStats,
    }),
  }),
})

// Client-safe API (only public operations)
export const client = createPublicAPI(drpc)
```

### 2. Expose via Route Handler

```typescript
// app/api/drpc/route.ts
import { drpc } from "@/server/drpc"
import { toNextJsHandler } from "@deessejs/drpc-next"

export const { POST, GET } = toNextJsHandler(drpc)
```

### 3. Call from Client

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

## Usage Patterns

### Server vs Client API

**Server Components** - Use full `drpc` API:

```typescript
// app/admin/page.tsx (Server Component)
import { drpc } from "@/server/drpc"

export default async function AdminPage() {
  // Can call ALL operations
  const users = await drpc.users.get({ id: 1 })
  const stats = await drpc.users.getAdminStats({})  // Works
  await drpc.users.delete({ id: 1 })                 // Works

  return <Dashboard stats={stats} />
}
```

**Client Components** - Use `client` API:

```typescript
// app/components/UserList.tsx (Client Component)
"use client"
import { client } from "@/server/drpc"

export function UserList() {
  // Can only call PUBLIC operations
  const users = await client.users.get({ id: 1 })     // Works
  await client.users.create({ name: "John" })          // Works

  // TypeScript error - internal operations not available
  const stats = await client.users.getAdminStats({})   // TS Error
  await client.users.delete({ id: 1 })                 // TS Error
}
```

### With Authentication

You can combine multiple route handlers in the same Next.js application:

```typescript
// app/api/auth/[...route]/route.ts - better-auth
import { auth } from "@/lib/auth"
import { toNextJsHandler } from "better-auth/next-js"

export const { POST, GET } = toNextJsHandler(auth)
```

```typescript
// app/api/drpc/route.ts - drpc
import { drpc } from "@/server/drpc"
import { toNextJsHandler } from "@deessejs/drpc-next"

export const { POST, GET } = toNextJsHandler(drpc)
```

### Request/Response Format

**Request:**

```bash
POST /api/drpc
Content-Type: application/json

{
  "procedure": "users.get",
  "args": { "id": 123 }
}
```

**Response:**

```json
{
  "ok": true,
  "value": { "id": 123, "name": "John", "email": "john@example.com" }
}
```

**Error Response:**

```json
{
  "ok": false,
  "error": { "code": "NOT_FOUND", "message": "User not found" }
}
```

### Cache Invalidation (with React Integration)

When using `@deessejs/drpc/react`, mutations automatically invalidate related queries:

```typescript
// Mutations return invalidation keys
const createUser = t.mutation({
  args: z.object({
    name: z.string().min(2),
    email: z.string().email()
  }),
  handler: async (ctx, args) => {
    const user = await ctx.db.users.create(args)
    return ok(user)
  },
  invalidate: ["users.list", "users.count"],
})
```

Components subscribed to these cache keys will automatically refetch after the mutation.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Client                                │
│  fetch("/api/drpc", { procedure: "users.get", args: {...} })│
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Next.js Route Handler                          │
│         toNextJsHandler(drpc) / createRouteHandler()       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    @deessejs/drpc                           │
│                                                             │
│  query() / mutation() ──────► Exposed via HTTP             │
│  internalQuery() / internalMutation() ──────► Server-only  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Your Handlers                            │
│         async (ctx, args) => Result<T, E>                  │
└─────────────────────────────────────────────────────────────┘
```

## Caveats & Considerations

### Security

- Route handlers are HTTP-exposed by default
- Always use `internalQuery()` / `internalMutation()` for sensitive operations
- Consider using authentication middleware for protected routes

### Performance

- Use specific cache keys to avoid unnecessary refetches
- Avoid over-fetching - only query the data you need
- Consider using `refetchOnWindowFocus: false` for frequently updated data

### Mental Model

This is a **cache invalidation system**, not a real-time subscription system:

```
WRONG:  Component A sees Component B's mutation instantly via WebSocket
RIGHT:  Component A's query is invalidated and refetched after Component B's mutation
```

### When to Use

- Dashboard-like pages with multiple components
- Forms that need to refresh lists after submission
- Lists that need to stay in sync with mutations

### When NOT to Use

- Real-time requirements (use WebSockets instead)
- Highly interactive applications (consider SWR/TanStack Query directly)
- Server Components with simple data fetching (use standard patterns)

## Future Considerations

- Suspense integration
- Server Actions integration
- Middleware for auth
- Parallel queries
- Infinite queries
