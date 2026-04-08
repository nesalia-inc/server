# @deessejs/server

This repository contains the **RPC package** of the @deessejs fullstack framework.

## What is @deessejs?

@deessejs is a **type-safe fullstack framework** for building applications across multiple platforms:

| Platform | Package | Status |
|----------|---------|--------|
| **Server RPC** | `@deessejs/server` | This repository |
| **Client** | `@deessejs/client` | Separate package |
| **Electron** | `@deessejs/electron` | Planned |
| **Expo/React Native** | `@deessejs/expo` | Planned |
| **OpenAPI** | `@deessejs/server` (built-in) | Planned |

## Repository Scope

This repository (`@deessejs/server`) focuses on the **RPC layer**:

```
@deessejs framework
└── @deessejs/server (this repo)     → Type-safe RPC operations
    ├── defineContext()                → Context definition
    ├── t.router()                     → Create router with operations
    ├── t.query()                      → Public read operations
    ├── t.mutation()                   → Public write operations
    ├── t.internalQuery()              → Server-only read operations
    ├── t.internalMutation()           → Server-only write operations
    ├── Middleware system              → Global cross-cutting concerns
    ├── Plugin system                  → Context extension
    ├── Event system                   → Pub/sub integration
    └── HTTP adapters                  → Express, Hono, Next.js, etc.
```

## Key Difference from tRPC

This package does **NOT** use "procedures" like tRPC.

### tRPC Pattern (Procedures)

```typescript
// tRPC: Chainable procedure builder pattern
const userProcedure = publicProcedure
  .input(z.object({ id: z.string() }))  // Input validation
  .output(z.object({ name: z.string() })) // Output validation
  .use(authMiddleware)                    // Per-procedure middleware
  .query(({ ctx, input }) => { ... })    // Handler
```

### @deessejs Pattern (Direct Objects)

```typescript
// @deessejs: Direct query/mutation objects
const getUser = t.query({
  args: z.object({ id: z.string() }),   // Input validation only
  handler: async (ctx, args) => { ... }  // Handler returns Result<T>
})

// Middleware is global, applied via createAPI()
const api = createAPI({
  router: t.router({ ... }),
  middleware: [authMiddleware]
})
```

### Comparison

| Aspect | tRPC | @deessejs |
|--------|------|-----------|
| **Concept** | Procedure (chainable builder) | Query/Mutation (direct object) |
| **Input validation** | `.input()` in chain | `args` property |
| **Output validation** | `.output()` in chain | Not supported |
| **Middleware** | Per-procedure via `.use()` | Global via `createAPI()` |
| **Return type** | Direct return or throw | `Result<T>` via `ok()`/`err()` |
| **Internal ops** | Manual (separate router) | Built-in (`internalQuery`, `internalMutation`) |
| **Lifecycle hooks** | Via middleware | Via `.beforeInvoke()`, `.onSuccess()`, `.onError()` |

### Why Direct Objects?

The direct object pattern simplifies the API:
- No chaining needed
- Handler receives `(ctx, args)` directly
- Returns `Result<T>` for explicit error handling
- Global middleware for cross-cutting concerns

## Architecture

### Type Safety Flow

```
Server (@deessejs/server)
    │
    │  export type AppRouter = typeof appRouter
    │  (type-only, no runtime code)
    │
    ▼
Client (@deessejs/client)
    │
    │  import type { AppRouter }
    │  createClient<AppRouter>(...)
    │
    ▼
Typed operation calls
```

### Key Packages

- `@deessejs/core` - Shared types (`Result<T>`, `ok()`, `err()`)
- `@deessejs/server` - RPC server implementation
- `@deessejs/client` - RPC client implementation

## Quick Start

### Server

```typescript
import { defineContext, t } from '@deessejs/server';
import { z } from 'zod';
import { ok } from '@deessejs/core';

const { router } = defineContext({
  context: () => ({ db: myDatabase }),
});

export const appRouter = router({
  getUser: t.query({
    args: z.object({ id: z.string() }),
    handler: async (ctx, args) => {
      const user = await ctx.db.users.find(args.id);
      return ok(user);
    }
  }),
});

export type AppRouter = typeof appRouter;
```

### Client

```typescript
import { createClient, httpBatchLink } from '@deessejs/client';
import type { AppRouter } from '@deessejs/server';

const client = createClient<AppRouter>({
  links: [httpBatchLink({ url: '/api/trpc' })],
});

const result = await client.getUser.query({ id: '123' });
if (result.ok) {
  console.log(result.value);
}
```

## Documentation

- [tRPC Architecture Analysis](./trpc-architecture.md) - Design reference
- [Hono Analysis](./hono-analysis.md) - Framework integration
- [Electron IPC Analysis](./electron-ipc-analysis.md) - Desktop support
- [Expo React Native Analysis](./expo-react-native-analysis.md) - Mobile support
- [OpenAPI Analysis](./openapi-analysis.md) - REST compatibility
- [SPEC.md](./SPEC.md) - Detailed API specification

## Status

This is an early-stage project. The RPC core is functional, but ecosystem packages (Electron, Expo, OpenAPI) are planned for future development.
