# Core Documentation

This folder contains the core documentation for `@deessejs/server`.

## Structure

| File | Description |
|------|-------------|
| [API.md](./API.md) | Complete API reference for all exports, types, and functions |
| [queries/](./queries/) | Detailed documentation for queries and mutations |
| [CACHE.md](./CACHE.md) | Cache system with keys and invalidation |
| [MIDDLEWARE.md](./MIDDLEWARE.md) | Middleware system for intercepting requests |

## Quick Links

### Getting Started

1. Read [API.md](./API.md) for an overview of all available functions
2. Check [queries/README.md](./queries/README.md) to learn how to define procedures

### Key Concepts

- **[queries/](./queries/)** - Learn about `t.query()`, `t.mutation()`, and internal operations
- **[CACHE.md](./CACHE.md)** - Understand cache keys and invalidation
- **[MIDDLEWARE.md](./MIDDLEWARE.md)** - Add middleware to procedures

## Example

```typescript
import { defineContext } from "@deessejs/server"
import { z } from "zod"

const { t, createAPI } = defineContext({
  context: {
    db: myDatabase,
  },
})

const api = createAPI({
  router: t.router({
    users: {
      get: t.query({
        args: z.object({ id: z.number() }),
        handler: async (ctx, args) => {
          const user = await ctx.db.users.find(args.id)
          if (!user) return err({ code: "NOT_FOUND", message: "User not found" })
          return ok(user)
        },
      }),
    },
  }),
})
```

## Next Steps

- [API.md](./API.md) - Complete function and type reference
- [queries/](./queries/) - Procedures (queries, mutations, internal)
- [CACHE.md](./CACHE.md) - Cache management
- [MIDDLEWARE.md](./MIDDLEWARE.md) - Request middleware
