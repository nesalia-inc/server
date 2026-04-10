# Plan: Standalone `query()` and `mutation()` Functions

## Overview

This document outlines the detailed implementation plan for standalone `query()` and `mutation()` functions in `@deessejs/server`. These functions enable RPC-like operations without coupling to any web framework.

---

## 1. API Signature

### Factory Functions with Configuration Object

```typescript
function query<Ctx, Args, Output>(
  config: {
    args?: Schema,           // Optional Zod or Standard Schema compatible
    handler: (ctx: Ctx, args: Args) => Output | Promise<Output>
  }
): QueryProcedure<Ctx, Args, Output>

function mutation<Ctx, Args, Output>(
  config: {
    args?: Schema,
    handler: (ctx: Ctx, args: Args) => Output | Promise<Output>
  }
): MutationProcedure<Ctx, Args, Output>
```

### Returned Object Structure

```typescript
interface QueryProcedure<Ctx, Args, Output> {
  readonly _type: 'query'
  readonly _args: Args
  readonly _output: Output

  execute(ctx: Ctx, args: Args): Promise<Result<Output>>

  beforeInvoke(fn: BeforeInvokeHook<Ctx, Args>): this
  afterInvoke(fn: AfterInvokeHook<Ctx, Args, Output>): this
  onSuccess(fn: OnSuccessHook<Ctx, Args, Output>): this
  onError(fn: OnErrorHook<Ctx, Args>): this
}

interface MutationProcedure<Ctx, Args, Output> {
  readonly _type: 'mutation'
  readonly _args: Args
  readonly _output: Output

  execute(ctx: Ctx, args: Args): Promise<Result<Output>>

  beforeInvoke(fn: BeforeInvokeHook<Ctx, Args>): this
  afterInvoke(fn: AfterInvokeHook<Ctx, Args, Output>): this
  onSuccess(fn: OnSuccessHook<Ctx, Args, Output>): this
  onError(fn: OnErrorHook<Ctx, Args>): this
}
```

---

## 2. Usage Examples

### Basic Query

```typescript
import { query } from "@deessejs/server";
import { ok, err } from "@deessejs/fp"; // See /deesse-fp for Result patterns

// Context must be explicitly typed
interface Ctx {
  db: { users: { find: (id: number) => Promise<User | null> } };
  logger: typeof console;
}

const getUser = query<Ctx, { id: number }, User>({
  handler: async (ctx, args) => {
    const user = await ctx.db.users.find(args.id);
    if (!user) {
      return err({ code: "NOT_FOUND", message: "User not found" });
    }
    return ok(user);
  }
});

// Execute with explicit context
const result = await getUser.execute(
  { db: myDatabase, logger: console },
  { id: 1 }
);
```

### Query with Schema Validation

```typescript
import { query } from "@deessejs/server";
import { ok, err } from "@deessejs/fp"; // See /deesse-fp for Result patterns
import { z } from "zod";

const getUser = query({
  args: z.object({ id: z.number() }),
  handler: async (ctx, args) => {
    // args.id is type-safe here
    return await ctx.db.users.find(args.id);
  }
});
```

### Chainable Hooks

```typescript
const getUserWithHooks = getUser
  .beforeInvoke((ctx, args) => {
    ctx.logger.info(`Fetching user ${args.id}`);
  })
  .onSuccess((ctx, args, user) => {
    ctx.logger.info(`User fetched: ${user.name}`);
  })
  .onError((ctx, args, error) => {
    ctx.logger.error(`Failed to fetch user: ${error}`);
  });

await getUserWithHooks.execute(ctx, { id: 1 });
```

### Mutation

```typescript
import { mutation } from "@deessejs/server";

interface Ctx {
  db: {
    users: {
      findByEmail: (email: string) => Promise<User | null>;
      create: (data: { name: string; email: string }) => Promise<User>;
    };
  };
}

const createUser = mutation<Ctx, { name: string; email: string }, User>({
  handler: async (ctx, args) => {
    const existing = await ctx.db.users.findByEmail(args.email);
    if (existing) {
      return err({ code: "CONFLICT", message: "Email already exists" });
    }
    return ok(await ctx.db.users.create(args));
  }
});

const result = await createUser.execute(ctx, {
  name: "John",
  email: "john@example.com"
});
```

---

## 3. Lifecycle Hooks

### Hook Definitions

| Hook | Parameters | When | Error Behavior |
|------|------------|------|----------------|
| `beforeInvoke` | `(ctx: Ctx, args: Args)` | Before handler | **Propagated** - cancels execution |
| `afterInvoke` | `(ctx: Ctx, args: Args, result: Output \| Error)` | Always after handler | Fail silent, logged |
| `onSuccess` | `(ctx: Ctx, args: Args, data: Output)` | Handler succeeded | Fail silent, logged |
| `onError` | `(ctx: Ctx, args: Args, error: unknown)` | Handler failed or hook error | Fail silent, logged |

### Error Handling Strategy

```typescript
// beforeInvoke throws → execution cancelled, error propagated
const op = query({ handler: async () => 1 })
  .beforeInvoke(() => {
    throw new Error("beforeInvoke failed"); // This will propagate
  });

// onSuccess/onError throw → fail silent, not propagated
const op2 = query({ handler: async () => 1 })
  .onSuccess(() => {
    throw new Error("onSuccess failed"); // This will NOT propagate
  });
```

**Rationale:**
- `beforeInvoke`: Pre-condition failure should stop execution
- `onSuccess`/`onError`/`afterInvoke`: These are observers and should not alter the result

---

## 4. Execution Flow

```
1. Validate args (if schema provided) → throw if invalid
2. Execute beforeInvoke hooks → if any throws, skip to step 6
3. Execute handler(ctx, args)
   - If handler throws → catch and store error
   - If handler returns value → store as success
4. If success → execute onSuccess hooks
5. If error → execute onError hooks
6. Execute afterInvoke hooks (always)
7. Return result (value or throws)
```

### Handler Return Types

```typescript
// All these are valid:
handler: () => value                        // Return value
handler: async () => await fetch()           // Async return
handler: () => { throw new Error(...) }      // Throw on error
handler: async () => { throw new Error(...) } // Async throw
```

---

## 5. Context (Ctx)

### Design Decision: Explicit Context Parameter

```typescript
// Context passed explicitly to execute()
// Ctx type must be explicit (no inference from execute)
const result = await getUser.execute<Ctx>(ctx, args);

// Example with inline context
const ctx: Ctx = {
  db: { users: { find: async (id) => ({ id, name: "John" }) } },
  logger: console,
};
```

### Context is NOT:
- Thread-local or AsyncLocalStorage based
- Injected via a DI container
- Modified by nested queries (queries share the same ctx reference)

### Dependency Injection Pattern

```typescript
// User composes their own context
const ctx = {
  db: myDatabase,
  logger: console,
  cache: myCache,
};

await getUser.execute(ctx, { id: 1 });
```

**Note:** Future phases may add `createQuery()` with automatic DI container, but not for Phase 2.

---

## 6. Differences: Query vs Mutation

| Aspect | Query | Mutation |
|--------|-------|----------|
| Type identifier | `_type: 'query'` | `_type: 'mutation'` |
| Semantic | Read operation | Write operation |
| Hook `onMutate` | Not applicable | **Deferred** (consider for future) |

### `onMutate` Hook (Future Consideration)

This hook would be called **before** the mutation handler, ideal for:
- Optimistic updates
- Pre-mutation validation
- Mutation cancellation

```typescript
// NOT implemented in Phase 2 - use beforeInvoke instead
const createUser = mutation({ ... })
  .onMutate((ctx, args) => {
    // Prepare optimistic update
  });
```

---

## 7. Files Structure

```
package/server/src/
  index.ts         # Exports query, mutation, and types
  types.ts         # QueryProcedure, MutationProcedure, hook types
  hooks.ts         # createHooksExecutor() - internal
  procedure.ts     # createProcedure() - internal factory
  query.ts         # query() function
  mutation.ts      # mutation() function
```

---

## 8. Open Questions

| Question | Recommendation |
|----------|----------------|
| Streaming/chunked responses? | Deferred to future version |
| Cancellation (AbortSignal)? | Add later if needed |
| `onMutate` for mutations? | Deferred - use `beforeInvoke` |
| Prepared queries (`queryOptions()`)? | Deferred |
| Thread-local context? | Not for Phase 2 - explicit ctx |

---

## 9. Dependencies

No new runtime dependencies required. Phase 2 uses:
- `@deessejs/fp` (peer dependency) - for error handling types (`Result`, `ok()`, `err()`, etc.) — see `/deesse-fp` skill
- Existing devDependencies already configured

Schema validation (when added):
```json
{
  "peerDependencies": {
    "@deessejs/fp": "*",
    "zod": "^3.0.0"
  }
}
```

---

## 10. Design Principles

| Principle | Rationale |
|-----------|-----------|
| Explicit ctx in `execute()` | Simple, predictable, debuggable |
| Chainable hooks (builder pattern) | Declarative, composable |
| Fail silent for observers | Resilience - hooks don't break operations |
| No standalone middlewares | Middlewares belong to the router system |
| Support sync + async handlers | Maximum flexibility |
| No streaming/cancellation yet | Start simple, extend later |

**Philosophy:** A simple API can be extended. A complex API cannot be simplified.
