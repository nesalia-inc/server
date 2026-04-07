# Next.js Integration

`@deessejs/drpc-next` provides Next.js integration for `@deessejs/drpc`.

## Overview

- HTTP exposure of public queries and mutations via route handlers
- Type-safe RPC calls between client and server
- Automatic cache revalidation across components (with `@deessejs/drpc/react`)

## Quick Start

```typescript
// app/api/drpc/route.ts
import { client } from "@/server/drpc"
import { toNextJsHandler } from "@deessejs/drpc-next"

export const { POST, GET } = toNextJsHandler(client)
```

The handler automatically:
- Exposes all `query()` and `mutation()` operations via HTTP
- Protects `internalQuery()` and `internalMutation()` (server-only)
- Handles JSON serialization/deserialization
- Returns typed responses

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
Client ──────► Next.js Route Handler ──────► @deessejs/drpc
                  toNextJsHandler()             │
                                              ▼
                                    query() / mutation()
                                    internalQuery() / internalMutation() (server-only)
                                              │
                                              ▼
                                         Your Handlers
                                    async (ctx, args) => Result<T>
```
