# Plan: `defineContext()`, `t.query/mutation()`, and `createAPI()`

## Overview

This document outlines the implementation plan for the context-aware API system consisting of `defineContext()`, `t.query()`, `t.mutation()`, and `createAPI()`. This system builds upon the standalone `query()` and `mutation()` functions defined in [reports/query-mutations.md](./query-mutations.md) and adds a router layer similar to tRPC.

This plan is based on analysis of the actual documentation in `docs/core/api/` and reflects the intended design accurately.

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         createAPI()                            │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                      API Router                           │ │
│  │  ┌─────────────────┐  ┌───────────────────────────────┐  │ │
│  │  │ defineContext() │  │         t (QueryBuilder)       │  │ │
│  │  │                 │  │  t.query() / t.mutation()    │  │ │
│  │  │  Returns {t,    │  │  t.router() / t.middleware() │  │ │
│  │  │   createAPI}     │  │  t.on() / t.internalQuery() │  │ │
│  │  └─────────────────┘  └───────────────────────────────┘  │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │   execute()      │
                    │  Entry point     │
                    └─────────────────┘
```

### Key Components

| Component | Purpose |
|-----------|---------|
| `defineContext()` | Entry point - defines context and returns `t` query builder |
| `t` (QueryBuilder) | Provides `t.query()`, `t.mutation()`, `t.router()`, etc. |
| `createAPI()` | Creates API instance with router and execution capabilities |
| `createPublicAPI()` | Filters out internal operations for client-safe API |
| `createLocalExecutor()` | Creates executor for testing |

---

## 2. `defineContext()` Design

### Signature (from docs/core/api/DEFINING_CONTEXT.md)

```typescript
function defineContext<Ctx, Plugins extends Plugin<Ctx>[]>(
  config: {
    context: Ctx
    plugins?: Plugins
    events?: EventRegistry
  }
): {
  t: QueryBuilder<Ctx>
  createAPI: (config: { router: Router; middleware?: Middleware<Ctx>[] }) => APIInstance<Ctx>
}
```

### Key Design Points

1. **Context is provided directly**, not via a factory function
2. **Returns `{ t, createAPI }`** - `t` is the query builder, `createAPI` is a factory
3. **Plugins and Events are optional** - can be added later

### Usage Pattern

```typescript
import { defineContext, t, createAPI } from "@deessejs/server";
import { ok, err } from "@deessejs/fp"; // See /deesse-fp for Result patterns

// 1. Define context - returns { t, createAPI }
const { t, createAPI } = defineContext({
  context: {
    db: myDatabase,
    logger: console,
    userId: null,  // Will be set per-request
  }
});

// 2. Define procedures using t.query() / t.mutation()
const appRouter = t.router({
  getUser: t.query({
    handler: async (ctx, args: { id: number }) => {
      return await ctx.db.users.find(args.id);
    }
  }),
  createUser: t.mutation({
    handler: async (ctx, args: { name: string; email: string }) => {
      return await ctx.db.users.create(args);
    }
  }),
});

// 3. Create API with router
const api = createAPI({
  router: appRouter,
});

// 4. Execute
const result = await api.users.get({ id: 1 });
```

---

## 3. `t` (QueryBuilder) Design

### Available Methods (from docs/core/api/T_QUERY_BUILDER.md)

```typescript
interface QueryBuilder<Ctx> {
  // Procedures
  query<Args, Output>(config: {
    args?: Schema
    handler: (ctx: Ctx, args: Args) => Promise<Output>
  }): Query<Ctx, Args, Output>

  mutation<Args, Output>(config: {
    args?: Schema
    handler: (ctx: Ctx, args: Args) => Promise<Output>
  }): Mutation<Ctx, Args, Output>

  // Internal procedures (not exposed via HTTP)
  internalQuery<Args, Output>(config: {
    handler: (ctx: Ctx, args: Args) => Promise<Output>
  }): InternalQuery<Ctx, Args, Output>

  internalMutation<Args, Output>(config: {
    args?: Schema
    handler: (ctx: Ctx, args: Args) => Promise<Output>
  }): InternalMutation<Ctx, Args, Output>

  // Router and middleware
  router(routes: Router): Router
  middleware(config: {
    name: string
    args?: unknown
    handler: (ctx: Ctx, args: unknown, next: () => Promise<unknown>) => Promise<unknown>
  }): Middleware<Ctx, Args>

  // Events
  on<EventName extends string, EventData>(
    event: EventName,
    handler: (ctx: Ctx, data: EventData) => void | Promise<void>
  ): void
}
```

### Security Model (from docs/SPEC.md)

| Operation | Callable via HTTP | Callable from Server |
|-----------|-------------------|---------------------|
| `t.query()` | Yes | Yes |
| `t.mutation()` | Yes | Yes |
| `t.internalQuery()` | **No** | Yes |
| `t.internalMutation()` | **No** | Yes |

### Usage Examples

```typescript
// Simple query
const getUser = t.query({
  handler: async (ctx, args) => {
    return await ctx.db.users.find(args.id);
  }
});

// With args validation
const getPost = t.query({
  args: z.object({ id: z.number() }),
  handler: async (ctx, args) => {
    const post = await ctx.db.posts.find(args.id);
    if (!post) {
      return err({ code: "NOT_FOUND", message: "Post not found" });
    }
    return ok(post);
  }
});

// Mutation
const createPost = t.mutation({
  args: z.object({ title: z.string(), content: z.string() }),
  handler: async (ctx, args) => {
    if (!ctx.userId) {
      return err({ code: "UNAUTHORIZED", message: "Must be logged in" });
    }
    return ok(await ctx.db.posts.create({ ...args, authorId: ctx.userId }));
  }
});

// Internal (server-only)
const deleteAll = t.internalMutation({
  handler: async (ctx) => {
    await ctx.db.posts.deleteAll();
    return { deleted: true };
  }
});
```

### Hierarchical Router

```typescript
const appRouter = t.router({
  users: t.router({
    get: t.query({ handler: async (ctx, args) => ctx.db.users.find(args.id) }),
    create: t.mutation({ handler: async (ctx, args) => ctx.db.users.create(args) }),
    list: t.query({ handler: async (ctx) => ctx.db.users.findAll() }),
    delete: t.internalMutation({ handler: async (ctx, args) => ctx.db.users.delete(args.id) }),
  }),
  posts: t.router({
    get: t.query({ handler: async (ctx, args) => ctx.db.posts.find(args.id) }),
    create: t.mutation({ handler: async (ctx, args) => ctx.db.posts.create(args) }),
  }),
});
```

### Chainable Hooks

All procedures support chainable hooks:

```typescript
const getUser = t.query({
  handler: async (ctx, args) => { ... }
})
  .beforeInvoke((ctx, args) => {
    // Called before handler
  })
  .afterInvoke((ctx, args, result) => {
    // Called after handler (always)
  })
  .onSuccess((ctx, args, data) => {
    // Called only on success
  })
  .onError((ctx, args, error) => {
    // Called only on error
  });
```

---

## 4. `createAPI()` Design

### Signature (from docs/core/api/CREATE_API.md)

```typescript
function createAPI<Ctx, TRoutes extends Router>(
  config: {
    router: TRoutes
    middleware?: Middleware<Ctx>[]
    plugins?: Plugin<Ctx>[]
  }
): APIInstance<Ctx, TRoutes>

// APIInstance exposes routes as properties for direct access
type APIInstance<Ctx, TRoutes extends Router> = TRoutes & {
  ctx: Ctx
  plugins: Array<Plugin<Ctx>>
  globalMiddleware: Middleware<Ctx>[]
}
```

### Related Functions

```typescript
// Filter out internal operations for client-safe API
createPublicAPI(api: APIInstance): PublicAPIInstance

// Alias for createPublicAPI
createClient(api: APIInstance): PublicAPIInstance

// Create executor for testing
createLocalExecutor(api: APIInstance): () => APIInstance
```

### Usage

```typescript
const api = createAPI({
  router: appRouter,
  middleware: [
    // Global middleware applied to all procedures
  ],
});

// Execute directly
const result = await api.users.get({ id: 1 });

// For HTTP server integration
const handler = api.createHandler();
```

---

## 5. File Structure

```
package/server/src/
  index.ts                    # Main exports
  types.ts                    # Shared types (Context, Procedure, Router, etc.)
  context.ts                  # defineContext() implementation
  query-builder.ts           # t (QueryBuilder) with t.query/mutation/router/etc.
  procedures.ts              # Query, Mutation, InternalQuery, InternalMutation types
  api.ts                     # createAPI(), createPublicAPI(), createLocalExecutor()
  router.ts                  # Router types and helpers
  hooks.ts                   # Hook executor (beforeInvoke, afterInvoke, etc.)
  errors.ts                  # Error types and handlers
  events.ts                  # Event system (defineEvents, ctx.send)
```

### Implementation Order

1. **types.ts** - Core types (`Context`, `Procedure`, `Router`)
2. **errors.ts** - Error handling types
3. **context.ts** - `defineContext()` returns `{ t, createAPI }`
4. **query-builder.ts** - `t` object with all methods (`query`, `mutation`, `router`, `middleware`, `on`)
5. **procedures.ts** - Procedure types (`Query`, `Mutation`, `InternalQuery`, `InternalMutation`)
6. **hooks.ts** - Hook execution logic
7. **api.ts** - `createAPI()`, `createPublicAPI()`, `createLocalExecutor()`
8. **router.ts** - Router types and hierarchical routing logic
9. **events.ts** - Event system
10. **index.ts** - Update exports

---

## 6. Key Design Decisions

| Decision | Choice | Rationale |
|----------|---------|-----------|
| Context provided directly | `context: Ctx` | Simple, no async factory needed |
| Returns `t` object | QueryBuilder pattern | Familiar tRPC-like API |
| Handler throws on error | Direct error throwing | Simple error handling |
| Internal procedures | Separate types | Security model (not exposed via HTTP) |
| Hierarchical router | `t.router({ nested: t.router({}) })` | Organized procedure structure |
| Plugins deferred | Not in initial scope | Keep initial API simple |

---

## 7. Comparison with tRPC

| Aspect | tRPC | @deessejs/server |
|--------|------|------------------|
| Context | `createContext()` + AsyncLocalStorage | `defineContext({ context: Ctx })` |
| Procedures | `publicProcedure.input().query()` | `t.query()` / `t.mutation()` |
| Internal procedures | Not exposed | `t.internalQuery()` / `t.internalMutation()` |
| Router | `createRouter()` with merge | `t.router()` with hierarchical nesting |
| Type inference | Via TypeScript + Zod | Via TypeScript generics |
| Middleware | Yes | `t.middleware()` |
| Events | No | `t.on()` + `ctx.send()` |
| Plugins | Yes | Deferred |

---

## 8. Usage Example: Full Flow

```typescript
import { defineContext, t, createAPI, createPublicAPI } from "@deessejs/server";
import { z } from "zod";

// 1. Define context
interface Ctx {
  db: Database;
  logger: Logger;
  user: User | null;
}

const { t, createAPI } = defineContext<Ctx>({
  context: {
    db: database,
    logger: console,
    user: null,
  }
});

// 2. Define router
const appRouter = t.router({
  users: t.router({
    get: t.query({
      args: z.object({ id: z.number() }),
      handler: async (ctx, args) => {
        const user = await ctx.db.users.find(args.id);
        if (!user) {
          return err({ code: "NOT_FOUND", message: "User not found" });
        }
        return ok(user);
      }
    }),
    create: t.mutation({
      args: z.object({ name: z.string(), email: z.string().email() }),
      handler: async (ctx, args) => {
        const existing = await ctx.db.users.findByEmail(args.email);
        if (existing) {
          return err({ code: "CONFLICT", message: "Email already exists" });
        }
        return ok(await ctx.db.users.create(args));
      }
    }),
    delete: t.internalMutation({
      args: z.object({ id: z.number() }),
      handler: async (ctx, args) => {
        await ctx.db.users.delete(args.id);
        return { success: true };
      }
    }),
  }),
  posts: t.router({
    get: t.query({
      args: z.object({ id: z.number() }),
      handler: async (ctx, args) => {
        return await ctx.db.posts.find(args.id);
      }
    }),
  }),
});

// 3. Create API
const api = createAPI({
  router: appRouter,
});

// 4. Create client-safe version (no internal procedures)
const clientApi = createPublicAPI(api);

// 5. Execute
const result = await api.users.get({ id: 1 });
console.log(result);
```

---

## 9. Exports

### Expected Public API

```typescript
export {
  // Core
  defineContext,
  createAPI,
  createPublicAPI,  // or createClient alias
  createLocalExecutor,

  // Query builder (t)
  QueryBuilder,

  // Procedures
  Query,
  Mutation,
  InternalQuery,
  InternalMutation,
  Router,

  // Middleware
  Middleware,

  // Events
  defineEvents,
  EventRegistry,
  EventPayload,

  // Types
  CacheKey,
};
```

---

## 10. Open Questions

| Question | Recommendation |
|----------|----------------|
| How to handle context per-request? | Context is static per `defineContext`, per-request data via request input |
| Should `createAPI` accept context factory? | Not in initial scope - ctx is set once |
| Batch execution? | Deferred to future version |
| Subscriptions/streaming? | Deferred to future version |
| Plugin system? | Deferred - separate implementation |

---

## 11. Dependencies

No new runtime dependencies required. Uses:
- `@deessejs/fp` (peer dependency) - for error handling utilities (`Result`, `ok()`, `err()`, etc.) — see `/deesse-fp` skill
- Existing devDependencies (vitest, eslint, typescript, typescript-eslint)

Optional (when adding schema validation):
- `zod` (peer dependency) - Standard Schema compatible
