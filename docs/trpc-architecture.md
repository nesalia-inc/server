# tRPC Architecture Analysis

This document analyzes tRPC's architecture to guide the refactoring of `@deessejs/server` into `@deessejs/server` and `@deessejs/client`.

## Overview

tRPC provides end-to-end type safety without code generation or schemas. The client imports only **type declarations** from the server via `import type`, ensuring no server code leaks into the client bundle.

## Core Concepts

### 1. Procedures

Procedures are the building blocks for defining API endpoints. Three types exist:

| Type | Purpose |
|------|---------|
| **Query** | Fetches data without modifying it |
| **Mutation** | Handles create/update/delete operations |
| **Subscription** | Real-time updates via WebSockets or SSE |

```typescript
const appRouter = router({
  greeting: publicProcedure.query(() => 'hello tRPC!'),
  createUser: publicProcedure
    .input(z.object({ name: z.string() }))
    .mutation(async (opts) => {
      return { id: '1', name: opts.input.name };
    }),
});
```

### 2. Context

Context shares data across all procedures. It requires two steps:

```typescript
type Context = { user: User | null };

const t = initTRPC.context<Context>().create();

const createContext = async () => ({ user: await getUser() });
```

**Inner vs Outer Context:**
- **Inner context**: Request-independent data (e.g., database connections)
- **Outer context**: Request-dependent data (e.g., user sessions)

### 3. Middleware

Middleware extends procedures with reusable logic:

```typescript
const authedProcedure = publicProcedure.use(async function isAuthed(opts) {
  if (!opts.ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
  return opts.next({ ctx: { user: opts.ctx.user } }); // Narrowed context
});
```

### 4. Router

Routers can be nested or flat:

```typescript
const appRouter = router({
  greeting: publicProcedure.query(() => 'hello'),
  nested: router({
    hello: publicProcedure.query(() => 'hello nested!'),
  }),
  // Or inline:
  nested2: {
    proc: publicProcedure.query(() => '...'),
  },
});

export type AppRouter = typeof appRouter;
```

## Package Structure

### @trpc/server

**Directory Structure:**
```
packages/server/src/@trpc/
├── server/           # Core module (primary export)
├── adapters/        # Protocol adapters (Express, Fastify, Next.js, etc.)
├── observable/      # Observable utilities
└── unstable-core-do-not-import/  # Internal modules
```

### @trpc/client

**Package Location:** `packages/client/`

**Main Exports:**
- `createTRPCClient` - initializes the client with a typed router
- `httpBatchLink` - batches multiple HTTP requests
- Various links for different transport mechanisms

## Client Architecture

### Link-Based Transport

Links are middleware-like chainable components:

```typescript
const client = createTRPCClient<AppRouter>({
  links: [
    loggerLink(),           // Middleware - logs requests
    httpBatchLink({         // Terminates - sends to server
      url: 'http://localhost:3000/trpc',
    }),
  ],
});
```

**Available Links:**

| Link | Purpose |
|------|---------|
| `httpBatchLink` | Batches multiple requests into single HTTP POST |
| `httpLink` | Single request per operation |
| `httpBatchStreamLink` | Batched streaming |
| `httpSubscriptionLink` | Subscription transport |
| `wsLink` | WebSocket-based transport |
| `localLink` | Server-side / testing |
| `loggerLink` | Logging middleware |
| `splitLink` | Conditional routing |
| `retryLink` | Automatic retry |

### Proxy/Caller System

```typescript
// Queries as property access with .query
const user = await client.getUser.query({ id: '123' });

// Mutations as property access with .mutation
await client.createUser.mutation({ name: 'Bilbo' });

// Subscriptions as property access with .subscription
client.onMessage.subscription({ channel: 'updates' }, (data) => {
  console.log(data);
});
```

## Type Sharing Pattern

### Server Side

```typescript
// server.ts
import { initTRPC } from '@trpc/server';

const t = initTRPC.context<Context>().create();
export const router = t.router;
export const publicProcedure = t.procedure;

export const appRouter = t.router({
  hello: publicProcedure.query(() => ({ message: 'hello world' })),
});

export type AppRouter = typeof appRouter;  // Type ONLY - no runtime export
```

### Client Side

```typescript
// client.ts
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../server';  // Only type import!

const client = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: 'http://localhost:3000/trpc' })],
});
```

### Type Safety Flow

```
Server (AppRouter)
    │
    │  import type (compile-time only)
    ▼
Client (createTRPCClient<AppRouter>)
    │
    │  TypeScript inference
    ▼
Typed procedure calls / hooks
```

## Input/Output Validation

### Supported Validators

tRPC integrates with: **Zod**, **Yup**, **Superstruct**, **scale-ts**, **Typia**, **ArkType**, **effect**, **Valibot**, and **TypeBox** (via @typeschema/typebox).

### Input Validation Example

```typescript
const userProcedure = publicProcedure
  .input(z.object({ userId: z.string() }))
  .query(({ input }) => getUser(input.userId));
```

### Output Validation

```typescript
const postProcedure = publicProcedure
  .output(z.object({ id: z.string(), title: z.string() }))
  .query(() => fetchPost());
```

## React Integration

### Classic @trpc/react-query

```tsx
import { trpc } from '../utils/trpc';

<trpc.Provider client={trpcClient} queryClient={queryClient}>
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>
</trpc.Provider>;

// Usage
const helloQuery = trpc.hello.useQuery({ name: 'Bob' });
const goodbyeMutation = trpc.goodbye.useMutation();
```

### New @trpc/tanstack-react-query

```tsx
import { createTRPCContext } from '@trpc/tanstack-react-query';

const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<AppRouter>();

// Usage with standard TanStack Query hooks
const trpc = useTRPC();
const userQuery = useQuery(trpc.getUser.queryOptions({ id: '123' }));
const userMutation = useMutation(trpc.createUser.mutationOptions());
```

## SSR / Hydration

### Per-Request QueryClient

```typescript
const queryClient = new QueryClient();
const trpcClient = trpc.createClient({
  links: [httpBatchLink({ url: 'YOUR_API_URL' })],
});
```

### Next.js App Router

- Server Components for prefetching on the server
- Next.js streaming for optimal loading
- Create fresh `QueryClient` per request to prevent cache sharing

## Protocol / Transport

tRPC uses JSON RPC-like format over HTTP:

**Request:**
```json
{
  "id": 1,
  "method": "query",
  "params": { "input": {}, "path": "hello", "type": "query" }
}
```

**Batching:** Multiple operations combined into single HTTP POST request.

## Implementation Notes for @deessejs

### Current State

- Monolithic `@deessejs/server` package
- Custom Next.js handler (`toNextJsHandler`)
- `createPublicAPI()` / `createClient()` for client creation

### Target State

| Component | Package | Pattern to Follow |
|-----------|---------|-------------------|
| Core types & procedures | `@deessejs/server` | `initTRPC`, `publicProcedure`, `router` |
| HTTP adapter | `@deessejs/server` | `@trpc/server/adapters/*` pattern |
| Client runtime | `@deessejs/client` | `createTRPCClient<T>()` with links |
| React hooks | `@deessejs/client` | `@trpc/react-query` pattern |

### Key Patterns to Implement

1. **Type-only exports**: Use `export type AppRouter = typeof appRouter`
2. **Link-based transport**: Implement `httpBatchLink`, `wsLink`, etc.
3. **Proxy caller**: `client.procedure.query()` / `client.procedure.mutation()`
4. **Input validation**: Support Zod or similar
5. **Middleware chain**: `procedure.use(middleware)`

## References

- [tRPC Documentation](https://trpc.io/docs)
- [tRPC Server Procedures](https://trpc.io/docs/server/procedures)
- [tRPC Server Routers](https://trpc.io/docs/server/routers)
- [tRPC Client Overview](https://trpc.io/docs/client)
- [tRPC TanStack React Query](https://trpc.io/docs/client/tanstack-react-query/setup)
- [tRPC GitHub Repository](https://github.com/trpc/trpc)
