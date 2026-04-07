# Security Best Practices

## Overview

`@deessejs/drpc-next` provides a security model that separates public operations from server-only internal operations.

## Security Model

### Operation Types

| Operation Type | Callable via HTTP | Callable from Server |
|---------------|-------------------|---------------------|
| `query()` | Yes | Yes |
| `mutation()` | Yes | Yes |
| `internalQuery()` | No | Yes |
| `internalMutation()` | No | Yes |

### Public vs Internal Operations

**Public operations** (`query()`, `mutation()`) are exposed via HTTP and can be called by anyone.

**Internal operations** (`internalQuery()`, `internalMutation()`) are never exposed via HTTP and can only be called from server-side code.

## Best Practices

### 1. Use Internal Operations for Sensitive Data

```typescript
// server/drpc.ts
const getUserStats = t.internalQuery({
  handler: async (ctx) => {
    const stats = await ctx.db.query(`
      SELECT COUNT(*) as count, AVG(age) as avg_age FROM users
    `)
    return ok(stats)
  },
})

// NOT exposed via HTTP - only callable from server code
```

### 2. Separate Public and Internal Data

```typescript
// server/drpc.ts
// Public - returns safe user info
const getUser = t.query({
  args: z.object({ id: z.number() }),
  handler: async (ctx, args) => {
    const user = await ctx.db.users.find(args.id)
    if (!user) return err({ code: "NOT_FOUND" })
    return ok({ id: user.id, name: user.name }) // No sensitive fields
  },
})

// Internal - returns sensitive data, never exposed
const getUserAdmin = t.internalQuery({
  args: z.object({ id: z.number() }),
  handler: async (ctx, args) => {
    return ok(await ctx.db.users.findFull(args.id))
  },
})
```

### 3. Validate Input in Route Handlers

```typescript
// app/api/drpc/route.ts
import { client } from "@/server/drpc"
import { toNextJsHandler } from "@deessejs/drpc-next"

// The handler already validates:
// - Procedure name exists
// - Args match the schema
// - User is authenticated (if using auth middleware)
export const { POST, GET } = toNextJsHandler(client)
```

### 4. Use Authentication Middleware

```typescript
// For protected routes, use middleware
import { client, withAuth } from "@/server/drpc"
import { toNextJsHandler } from "@deessejs/drpc-next"

const authClient = withAuth(client, {
  requireAuth: true,
})

export const { POST, GET } = toNextJsHandler(authClient)
```

## Authentication

Combine with better-auth for full authentication:

```typescript
// app/api/auth/[...route]/route.ts
import { auth } from "@/lib/auth"
import { toNextJsHandler } from "better-auth/next-js"

export const { POST, GET } = toNextJsHandler(auth)
```

```typescript
// app/api/drpc/route.ts
import { client } from "@/server/drpc"
import { toNextJsHandler } from "@deessejs/drpc-next"

export const { POST, GET } = toNextJsHandler(client)
```

## Error Handling

Errors are serialized and returned to clients:

```typescript
// Handler returns error
return err({ code: "UNAUTHORIZED", message: "Not logged in" })

// Client receives
{
  "ok": false,
  "error": { "code": "UNAUTHORIZED", "message": "Not logged in" }
}
```

Never expose internal error details (stack traces, database errors) to clients.

## Rate Limiting

Consider adding rate limiting middleware for public endpoints:

```typescript
import { client } from "@/server/drpc"
import { toNextJsHandler } from "@deessejs/drpc-next"
import { rateLimit } from "@/lib/rate-limit"

const rateLimitedClient = withRateLimit(client, {
  limit: 100,
  window: 60, // 100 requests per minute
})

export const { POST, GET } = toNextJsHandler(rateLimitedClient)
```

## See Also

- [SETUP.md](./SETUP.md) - Complete setup guide
- [API.md](./API.md) - API reference
- [USAGE.md](./USAGE.md) - Usage patterns
