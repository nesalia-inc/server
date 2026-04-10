# Next.js Integration

`@deessejs/server-next` provides Next.js integration for `@deessejs/server`.

## Overview

- HTTP exposure of public queries and mutations via route handlers
- Type-safe RPC calls between client and server
- Automatic cache revalidation across components (with `@deessejs/server/react`)

## Quick Start

### 1. Create API and Client

```typescript
// server/drpc.ts
import { defineContext, createAPI, createClient } from "@deessejs/server"
import { ok, err } from "@deessejs/fp" // See /deesse-fp for Result patterns
import { z } from "zod"

const { t, createAPI } = defineContext({
  context: { db: myDatabase },
})

// Define procedures
const listUsers = t.query({
  args: z.object({ limit: z.number().optional().default(10) }),
  handler: async (ctx, args) => {
    return ok(await ctx.db.users.findMany({ limit: args.limit }))
  },
})

// Create APIs
export const drpc = createAPI({
  router: t.router({ users: { list: listUsers } }),
})
export const client = createClient(drpc)
```

### 2. Expose via Route Handler

```typescript
// app/api/drpc/[...slug]/route.ts - Catch-all route for procedure calls
import { client } from "@/server/drpc"
import { toNextJsHandler } from "@deessejs/server-next"

export const { GET, POST, PUT, PATCH, DELETE } = toNextJsHandler(client)
```

### 3. Call from Browser

```typescript
// Procedure name in URL path, args in query string or body
const response = await fetch("/api/drpc/users/list?args={\"limit\":10}", {
  method: "GET",
})

const { ok, value, error } = await response.json()
```

The handler automatically:
- Exposes all `query()` and `mutation()` operations via HTTP
- Supports all standard HTTP methods (GET, POST, PUT, PATCH, DELETE)
- Protects `internalQuery()` and `internalMutation()` (server-only)
- Handles JSON serialization/deserialization
- Returns correct DRPC result format

## Documentation

| Document | Description |
|----------|-------------|
| [SETUP.md](./SETUP.md) | Complete setup guide with full CRUD example |
| [API.md](./API.md) | API reference for route handlers |
| [USAGE.md](./USAGE.md) | Usage patterns and examples |
| [SECURITY.md](./SECURITY.md) | Security model and best practices |

## Security Model

| Operation Type | Callable via HTTP | Callable from Server |
|---------------|-------------------|---------------------|
| `query()` | Yes | Yes |
| `mutation()` | Yes | Yes |
| `internalQuery()` | No | Yes |
| `internalMutation()` | No | Yes |

## Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                         Browser                                      │
│  fetch("/api/drpc/users/get?args={\"id\":1}", { method: "GET" })    │
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
