# Usage Patterns

## Architecture Overview

```
┌────────────────────────────────────────────────────────────────────┐
│                         Browser                                      │
│  fetch("/api/drpc/users/get?args={\"id\":1}", { method: "GET" })   │
└────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────────┐
│           Next.js Catch-All Route                                   │
│      app/api/drpc/[...slug]/route.ts - toNextJsHandler(client)     │
└────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────────┐
│                     @deessejs/server                                   │
│                                                                      │
│  createAPI() ──────► drpc ──────► Full API (all operations)        │
│                            │                                        │
│  createClient(drpc) ───────┘                                        │
│         │                                                             │
│         ▼                                                             │
│     client ──────► Public API (query + mutation only)               │
└────────────────────────────────────────────────────────────────────┘
```

### Key Functions

| Function | Purpose |
|----------|---------|
| `createAPI()` | Creates full API with all operations (internal + public) |
| `createClient()` | Creates client-safe API (filters internal operations) |
| `toNextJsHandler()` | Exposes client API via Next.js route handler |

## Server Components

Use the full `drpc` API to access all operations including internal ones:

```typescript
// app/admin/page.tsx (Server Component)
import { drpc } from "@/server/drpc"

export default async function AdminPage() {
  // Can call ALL operations directly
  const user = await drpc.users.get({ id: 1 })
  const users = await drpc.users.list({ limit: 10 })
  const stats = await drpc.users.getAdminStats({})  // ✅ Internal works
  await drpc.users.delete({ id: 1 })                  // ✅ Internal works

  return <Dashboard stats={stats} />
}
```

## Client Components (Browser)

From the browser, call procedures via HTTP through the route handler:

```typescript
// app/components/UserList.tsx (Client Component)
"use client"

// Browser-side: call via HTTP fetch
const result = await fetch("/api/drpc/users/get?args={\"id\":1}", {
  method: "GET",
})

const response = await result.json()
// response: { ok: true, value: { id: 1, name: "John", ... } }
```

The `client` API is passed to `toNextJsHandler()` in the route handler, which:
- Exposes public operations (`query`, `mutation`) via HTTP
- Filters out internal operations (`internalQuery`, `internalMutation`)

## With Authentication

You can combine multiple route handlers in the same Next.js application:

```typescript
// app/api/auth/[...route]/route.ts - better-auth
import { auth } from "@/lib/auth"
import { toNextJsHandler } from "better-auth/next-js"

export const { GET, POST, PUT, PATCH, DELETE } = toNextJsHandler(auth)
```

```typescript
// app/api/drpc/[...slug]/route.ts - drpc
import { client } from "@/server/drpc"
import { toNextJsHandler } from "@deessejs/server-next"

export const { GET, POST, PUT, PATCH, DELETE } = toNextJsHandler(client)
```

## CRUD Examples

All procedure calls from the browser use fetch to the route handler.

### List with Pagination

```typescript
// GET request - procedure name in URL path
const response = await fetch("/api/drpc/users/list?args={\"limit\":10,\"offset\":0}", {
  method: "GET",
})

const { ok, value, error } = await response.json()
if (ok) {
  console.log(value) // { items: [...], total: 100 }
}
```

### Get Single Resource

```typescript
// GET request
const response = await fetch("/api/drpc/users/get?args={\"id\":1}", {
  method: "GET",
})

const { ok, value, error } = await response.json()
if (ok) {
  console.log(value.name) // "John"
} else {
  console.error(error.message) // "User not found"
}
```

### Create Resource

```typescript
// POST request - args in JSON body
const response = await fetch("/api/drpc/users/create", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    args: { name: "John", email: "john@example.com" },
  }),
})

const { ok, value, error } = await response.json()
if (ok) {
  console.log(value.id) // 123
}
```

### Update Resource

```typescript
// PUT or PATCH request
const response = await fetch("/api/drpc/users/update", {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    args: { id: 1, name: "Jane" },
  }),
})

const { ok, value } = await response.json()
if (ok) {
  console.log(value.name) // "Jane"
}
```

### Delete Resource

```typescript
// DELETE request
const response = await fetch("/api/drpc/users/delete", {
  method: "DELETE",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    args: { id: 1 },
  }),
})

const { ok, value } = await response.json()
if (ok) {
  console.log(value.success) // true
}
```

### Search

```typescript
// GET request with query params
const response = await fetch("/api/drpc/users/search?args={\"query\":\"john\",\"limit\":5}", {
  method: "GET",
})

const { ok, value } = await response.json()
if (ok) {
  console.log(value) // [...]
}
```

## Error Handling

```typescript
const response = await fetch("/api/drpc/users/create", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    args: { email: "invalid-email" },
  }),
})

const { ok, error } = await response.json()

if (!ok) {
  switch (error.code) {
    case "VALIDATION_ERROR":
      console.log("Invalid input")
      break
    case "DUPLICATE":
      console.log("Email already exists")
      break
    default:
      console.log("Unknown error")
  }
}
```

## See Also

- [SETUP.md](./SETUP.md) - Complete setup guide
- [API.md](./API.md) - API reference
- [SECURITY.md](./SECURITY.md) - Security best practices
