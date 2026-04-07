# API Reference

## `toNextJsHandler`

Creates Next.js route handlers from a drpc API instance.

```typescript
import { toNextJsHandler } from "@deessejs/drpc-next"

export const { POST, GET } = toNextJsHandler(client)
```

### Supported Methods

| Method | Description |
|--------|-------------|
| `POST` | JSON body with `{ procedure: "namespace.name", args: { ... } }` |
| `GET` | Query params with `?procedure=namespace.name&args=...` |

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

The client maintains full type safety:

```typescript
// Procedure name autocomplete
const result = await client.users.get({ id: 1 })
//    ^? Result<User>

// Wrong arguments caught by TypeScript
client.users.get({ name: "John" })
//    ^? TypeScript error: 'name' does not exist
```
