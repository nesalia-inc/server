# 3.3 Optics for Nested Context Access

## Mathematical Principle

**Optics** (lenses, prisms, traversals) provide bidirectional access to products and sums:

- **Lens**: `s → a` with setter `s → b → t` (for product types)
- **Prism**: `s → a` with reverse `a → s` (for sum types)
- **Traversal**: multi-focus access (for arrays)

```typescript
type Lens<S, A> = {
  get: (s: S) => A
  set: (s: S, a: A) => S
}
```

## Practical Implementation

```typescript
import { Lens, lens, compose } from 'optics-ts'

// Define context shape
interface Ctx {
  db: Database
  user: {
    session: {
      id: string
      permissions: string[]
    }
  }
  logger: Logger
}

// Create optics for nested paths
const ctxLens = lens<Ctx>()

// Deep access: ctx.user.session.id
const sessionId = compose(
  ctxLens.focusAt('user'),
  focusAt('session'),
  focusAt('id')
)

// Type-safe get/set
const getSessionId = (ctx: Ctx): string => sessionId.get(ctx)
const setSessionId = (ctx: Ctx, id: string): Ctx => sessionId.set(ctx, id)

// Use in procedures:
const getUser = t.query({
  handler: async (ctx, args) => {
    // Deep access without intermediate checks
    const sessionId = ctx |> sessionId.get
    const permissions = ctx |> compose(
      ctxLens.focusAt('user'),
      focusAt('session'),
      focusAt('permissions')
    ).get

    // Type-safe update
    const newCtx = ctx |> sessionId.set('new-session-id')
    // newCtx.user.session.id === 'new-session-id'

    return { sessionId, permissions }
  }
})
```

## Expected Benefits

| Benefit | Description |
|---------|-------------|
| **Type safety** | No string paths like `'user.session.id'` that could typo |
| **Composability** | Lenses compose naturally |
| **Immutability** | Updates return new context, no mutation |
| **Partial access** | Prisms for optional nested properties |

## Killer Feature: Context Validation Optics

```typescript
// Validate context structure with optics
const requiredCtx: Lens<Partial<Ctx>, Ctx> = {
  get: (s) => {
    const errors: string[] = []
    if (!s.db) errors.push('db required')
    if (!s.user) errors.push('user required')
    if (errors.length > 0) throw new ContextError(errors)
    return s as Ctx
  },
  set: (s, a) => a, // Cannot set required context
}

// Use as a type guard in middleware
const requireContext = (ctx: Partial<Ctx>): Ctx =>
  requiredCtx.get(ctx)
```
