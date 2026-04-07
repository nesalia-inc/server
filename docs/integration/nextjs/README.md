# Next.js Integration

`@deessejs/drpc-next` provides Next.js integration for `@deessejs/drpc`.

## Overview

- HTTP exposure of public queries and mutations via route handlers
- Type-safe RPC calls between client and server
- Automatic cache revalidation across components (with `@deessejs/drpc/react`)

## Quick Start

### 1. Create Client-Safe API

```typescript
// server/drpc.ts
import { drpc, createClient } from "@deessejs/drpc"

// drpc: full API (server-only operations + public operations)
// client: public operations only (filtered by createClient)
export const client = createClient(drpc)
```

### 2. Expose via Route Handler

```typescript
// app/api/drpc/route.ts
import { client } from "@/server/drpc"
import { toNextJsHandler } from "@deessejs/drpc-next"

export const { GET, POST, PUT, PATCH, DELETE } = toNextJsHandler(client)
```

The handler automatically:
- Exposes all `query()` and `mutation()` operations via HTTP
- Supports all standard HTTP methods (GET, POST, PUT, PATCH, DELETE)
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
┌────────────────────────────────────────────────────────────────────┐
│                         Browser                                      │
│  fetch("/api/drpc", { procedure: "users.get", args: { id: 1 } })    │
└────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────────┐
│              Next.js Route Handler                                  │
│        app/api/drpc/route.ts - toNextJsHandler(client)             │
└────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────────┐
│                     @deessejs/drpc                                   │
│                                                                      │
│  createAPI() ──────► drpc ──────► Full API (all operations)        │
│                            │                                        │
│  createClient(drpc) ───────┘                                        │
│         │                                                             │
│         ▼                                                             │
│     client ──────► Public API (query + mutation only)               │
└────────────────────────────────────────────────────────────────────┘
```
