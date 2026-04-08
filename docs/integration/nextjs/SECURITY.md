# Security Best Practices

## Overview

`@deessejs/server-next` provides a security model that separates public operations from server-only internal operations.

## Security Model

### Operation Types

| Operation Type | Callable via HTTP | Callable from Server |
|---------------|-------------------|---------------------|
| `query()` | Yes | Yes |
| `mutation()` | Yes | Yes |
| `internalQuery()` | No | Yes |
| `internalMutation()` | No | Yes |

### Public vs Internal Operations

**Public operations** (`query()`, `mutation()`) are exposed via HTTP and can be called by anyone unless you add authentication.

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

### 3. Never Expose Internal Error Details

The handler returns error messages to clients. Make sure your handlers don't leak sensitive information:

```typescript
// Bad - leaks internal error
handler: async (ctx, args) => {
  try {
    return ok(await ctx.db.query(sql))
  } catch (e) {
    return err({ code: "ERROR", message: e.message }) // ❌ Leaks DB error
  }
}

// Good - generic error message
handler: async (ctx, args) => {
  try {
    return ok(await ctx.db.query(sql))
  } catch (e) {
    return err({ code: "INTERNAL_ERROR", message: "An error occurred" }) // ✅ Safe
  }
}
```

## Authentication

Public operations can be called by anyone. To protect them, add authentication at the middleware level or use a separate auth layer.

### Using better-auth

Combine with better-auth for full authentication:

```typescript
// app/api/auth/[...route]/route.ts
import { auth } from "@/lib/auth"
import { toNextJsHandler } from "better-auth/next-js"

export const { GET, POST, PUT, PATCH, DELETE } = toNextJsHandler(auth)
```

### Protected Routes

For protected drpc routes, you would typically:

1. Add authentication middleware to your API
2. Check `ctx.user` or similar in protected procedures

```typescript
// server/drpc.ts
const getProfile = t.query({
  handler: async (ctx, args) => {
    if (!ctx.user) {
      return err({ code: "UNAUTHORIZED", message: "Not logged in" })
    }
    return ok(await ctx.db.users.find(ctx.user.id))
  },
})
```

## Error Handling

Errors returned from handlers are serialized and returned to clients:

```typescript
// Handler returns error
return err({ code: "UNAUTHORIZED", message: "Not logged in" })

// Client receives
{
  "ok": false,
  "error": { "code": "UNAUTHORIZED", "message": "Not logged in" }
}
```

## See Also

- [SETUP.md](./SETUP.md) - Complete setup guide
- [API.md](./API.md) - API reference
- [USAGE.md](./USAGE.md) - Usage patterns
