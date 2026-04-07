# API Reference

## `createClient`

Creates a client-safe API from the full API. Filters out internal operations (`internalQuery`, `internalMutation`) so they cannot be called via HTTP.

```typescript
import { drpc, createClient } from "@deessejs/drpc"

// drpc contains all operations (including internal ones)
// client only contains public operations (query, mutation)
export const client = createClient(drpc)
```

### When to Use

| API | Use Case |
|-----|----------|
| `drpc` | Server Components, Server Actions, internal calls |
| `client` | Passed to `toNextJsHandler()` for HTTP exposure |

---

## `toNextJsHandler`

Creates Next.js route handlers from a client API instance.

```typescript
import { client } from "@/server/drpc"
import { toNextJsHandler } from "@deessejs/drpc-next"

export const { GET, POST, PUT, PATCH, DELETE } = toNextJsHandler(client)
```

### Supported Methods

| Method | Description |
|--------|-------------|
| `GET` | Query operations - args via URL search params |
| `POST` | Mutation operations (create) - args via JSON body |
| `PUT` | Mutation operations (update/replace) - args via JSON body |
| `PATCH` | Mutation operations (partial update) - args via JSON body |
| `DELETE` | Mutation operations (delete) - args via JSON body |

All methods extract the procedure name from the URL path (e.g., `/api/users.get` → `users.get` procedure).

### Example

```typescript
// app/api/drpc/route.ts
import { client } from "@/server/drpc"
import { toNextJsHandler } from "@deessejs/drpc-next"

export const { POST, GET } = toNextJsHandler(client)
```

---

## `createRouteHandler`

For more control over the route handler configuration. Returns only POST handler.

```typescript
import { createRouteHandler } from "@deessejs/drpc-next"
import { client } from "@/server/drpc"

export const POST = createRouteHandler(client)
```

---

## Request/Response Format

### Request (POST)

```bash
POST /api/drpc
Content-Type: application/json

{
  "procedure": "users.get",
  "args": { "id": 123 }
}
```

### Request (GET)

```bash
GET /api/drpc?procedure=users.get&args={"id":123}
```

### Response (Success)

```json
{
  "ok": true,
  "value": { "id": 123, "name": "John", "email": "john@example.com" }
}
```

### Response (Error)

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

The API maintains full type safety for both server and client usage:

```typescript
// Server-side: drpc has all operations including internal ones
const stats = await drpc.users.getAdminStats({})  // ✅ Works

// Server-side: client only has public operations
const user = await client.users.get({ id: 1 })     // ✅ Works

// TypeScript catches invalid arguments
client.users.get({ name: "John" })
//    ^? TypeScript error: 'name' does not exist
```
