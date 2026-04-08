# API Reference

Complete API reference for `@deessejs/server`.

## Overview

```typescript
import {
  defineContext,
  createAPI,
  createPublicAPI,
  createClient,
  createLocalExecutor,
  ok,
  err,
  withMetadata,
  defineCacheKeys,
  defineEvents,
  plugin,
  QueryBuilder,
  Query,
  Mutation,
  InternalQuery,
  InternalMutation,
  Router,
  Middleware,
  Plugin,
  Result,
  CacheKey,
  WithMetadata,
  EventRegistry,
  EventPayload,
} from "@deessejs/server"
```

## Documentation Structure

### Core Concepts

| Document | Description |
|----------|-------------|
| [api/DEFINING_CONTEXT.md](api/DEFINING_CONTEXT.md) | `defineContext()` - Entry point for creating typed context |
| [api/T_QUERY_BUILDER.md](api/T_QUERY_BUILDER.md) | Query builder (`t`) - Methods for defining procedures |
| [api/CREATE_API.md](api/CREATE_API.md) | API creation functions |

### API Functions

| Function | Description |
|----------|-------------|
| `defineContext()` | Creates typed context with query builder |
| `createAPI()` | Creates full API instance |
| `createPublicAPI()` | Creates client-safe API (filters internal operations) |
| `createClient()` | Alias for `createPublicAPI` |
| `createLocalExecutor()` | Creates executor for testing |

### Query Builder Methods

| Method | Type | Description |
|--------|------|-------------|
| `t.query()` | Public | Public read operations |
| `t.mutation()` | Public | Public write operations |
| `t.internalQuery()` | Internal | Private read operations (not exposed via HTTP) |
| `t.internalMutation()` | Internal | Private write operations (not exposed via HTTP) |
| `t.router()` | - | Hierarchical routing |
| `t.middleware()` | - | Create middleware |
| `t.on()` | - | Event listeners |

### Result Helpers

| Function | Description |
|----------|-------------|
| `ok(value)` | Create success result |
| `err(error)` | Create error result |
| `withMetadata(value, meta)` | Attach cache keys/invalidation |

### Schema Helpers

| Function | Description |
|----------|-------------|
| `defineCacheKeys(schema)` | Create typed cache key registry |
| `defineEvents(schema)` | Create typed event registry |
| `plugin(config)` | Create plugin |

### Types

| Type | Description |
|------|-------------|
| `Result<Success, Error>` | Result type with `ok`/`err` |
| `CacheKey` | Cache key type |
| `WithMetadata<T, Keys>` | Value with cache metadata |
| `Plugin<Ctx>` | Plugin definition |
| `Middleware<Ctx, Args>` | Middleware definition |
| `EventRegistry` | Event registry type |
| `EventPayload<T>` | Event payload type |
| `APIInstance<Ctx, TRoutes>` | API instance type |

---

## Security Model

| Operation | Callable via HTTP | Callable from Server |
|-----------|-------------------|---------------------|
| `t.query()` | ✅ Yes | ✅ Yes |
| `t.mutation()` | ✅ Yes | ✅ Yes |
| `t.internalQuery()` | ❌ No | ✅ Yes |
| `t.internalMutation()` | ❌ No | ✅ Yes |

---

## Next.js Integration

```typescript
import { toNextJsHandler } from "@deessejs/server-next"

export const { POST, GET } = toNextJsHandler(client)
```

See [integration/NEXTJS.md](../integration/NEXTJS.md) for full documentation.

---

## Quick Links

- [api/DEFINING_CONTEXT.md](api/DEFINING_CONTEXT.md) - Getting started
- [api/T_QUERY_BUILDER.md](api/T_QUERY_BUILDER.md) - Defining procedures
- [api/CREATE_API.md](api/CREATE_API.md) - Creating and configuring API
- [queries/](queries/) - Detailed query/mutation documentation
- [CACHE.md](CACHE.md) - Cache system
- [MIDDLEWARE.md](MIDDLEWARE.md) - Middleware system
