# API Reference

## `createClient`

Creates a client-safe API from the full API. Filters out internal operations (`internalQuery`, `internalMutation`) at runtime so they cannot be called via HTTP.

```typescript
import { defineContext, createAPI, createClient } from "@deessejs/server"

const { t, createAPI } = defineContext({
  context: { db: myDatabase },
})

const api = createAPI({
  router: t.router({
    users: {
      list: t.query({ ... }),
      get: t.query({ ... }),
    },
  }),
})

// client only exposes public operations
export const client = createClient(api)
```

### When to Use

| API | Use Case |
|-----|----------|
| `drpc` (from `createAPI`) | Server Components, Server Actions, internal calls |
| `client` (from `createClient`) | Passed to `toNextJsHandler()` for HTTP exposure |

---

## `toNextJsHandler`

Creates Next.js route handlers from a client API instance.

```typescript
// app/api/drpc/[...slug]/route.ts
import { client } from "@/server/drpc"
import { toNextJsHandler } from "@deessejs/server-next"

export const { GET, POST, PUT, PATCH, DELETE } = toNextJsHandler(client)
```

### Route Structure

Use a **catch-all route** `[...slug]` to capture the full procedure path:

```
app/api/drpc/[...slug]/route.ts
```

This allows URLs like:
- `/api/drpc/users/list`
- `/api/drpc/users/get`
- `/api/drpc/users/create`

### Supported Methods

| Method | Description |
|--------|-------------|
| `GET` | Query operations - args via URL search params |
| `POST` | Mutation operations (create) - args via JSON body |
| `PUT` | Mutation operations (update/replace) - args via JSON body |
| `PATCH` | Mutation operations (partial update) - args via JSON body |
| `DELETE` | Mutation operations (delete) - args via JSON body |

### Options

```typescript
toNextJsHandler(client, {
  basePath: "api/drpc", // default
})
```

---

## `createRouteHandler`

**Deprecated.** Use `toNextJsHandler` instead.

Returns only the POST handler for backwards compatibility.

```typescript
import { createRouteHandler } from "@deessejs/server-next"
import { client } from "@/server/drpc"

export const POST = createRouteHandler(client)
```

---

## Request/Response Format

### GET Request (Query)

```bash
GET /api/drpc/users/get?args={"id":123}
```

### POST Request (Mutation)

```bash
POST /api/drpc/users/create
Content-Type: application/json

{
  "args": { "name": "John", "email": "john@example.com" }
}
```

### Success Response

```json
{
  "ok": true,
  "value": { "id": 123, "name": "John", "email": "john@example.com" }
}
```

### Error Response

```json
{
  "ok": false,
  "error": { "code": "NOT_FOUND", "message": "User not found" }
}
```

---

## Error Codes

| Code | Description |
|------|-------------|
| `NOT_FOUND` | Resource not found |
| `DUPLICATE` | Resource already exists |
| `VALIDATION_ERROR` | Invalid arguments |
| `UNAUTHORIZED` | Not authenticated |
| `FORBIDDEN` | Not authorized |
| `INTERNAL_ERROR` | Server error |

---

## Type Safety

The API provides type safety for procedure calls:

```typescript
// Server-side: drpc has all operations including internal ones
const stats = await drpc.users.getAdminStats({})  // ✅ Works (server-only)

// Server-side: client only has public operations
const user = await client.users.get({ id: 1 })     // ✅ Works

// TypeScript catches invalid arguments
client.users.get({ name: "John" })
//    ^? TypeScript error: 'name' does not exist
```
