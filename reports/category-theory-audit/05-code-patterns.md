# Code Patterns

## 5.1 Immediate: Improve Hook Composition

Current hooks are not composable. This simple improvement uses monoidal structure:

```typescript
// Hook as a monoid
type Hook<Ctx, Args, Output> = {
  beforeInvoke?: (ctx: Ctx, args: Args) => void | Promise<void>
  onSuccess?: (ctx: Ctx, args: Args, output: Output) => void | Promise<void>
  onError?: (ctx: Ctx, args: Args, error: unknown) => void | Promise<void>
}

// Monoidal combination (all hooks run, errors collected)
const combineHooks =
  <Ctx, Args, Output>(...hooks: Hook<Ctx, Args, Output>[]): Hook<Ctx, Args, Output> => ({
    beforeInvoke: async (ctx, args) => {
      for (const hook of hooks) {
        if (hook.beforeInvoke) await hook.beforeInvoke(ctx, args)
      }
    },
    onSuccess: async (ctx, args, output) => {
      for (const hook of hooks) {
        if (hook.onSuccess) await hook.onSuccess(ctx, args, output)
      }
    },
    onError: async (ctx, args, error) => {
      for (const hook of hooks) {
        if (hook.onError) await hook.onError(ctx, args, error)
      }
    },
  })

// Usage:
const getUser = t.query({
  handler: async (ctx, args) => { ... }
}).withHooks(
  combineHooks(
    loggingHook,
    metricsHook,
    authHook
  )
)
```

---

## 5.2 Immediate: Add `Result` Type Safety

```typescript
// Type-safe error codes
type ErrorCodes = {
  NOT_FOUND: { code: 'NOT_FOUND'; message: string }
  UNAUTHORIZED: { code: 'UNAUTHORIZED'; message: string }
  VALIDATION: { code: 'VALIDATION'; message: string; field?: string }
}

// Generic error type
type AppError = ErrorCodes[keyof ErrorCodes]

// Result type using error codes
type Result<T, E extends AppError = AppError> =
  | { ok: true; value: T }
  | { ok: false; error: E }

// Smart constructors
const ok = <T>(value: T): Result<T> => ({ ok: true, value })
const err = <E extends AppError>(error: E): Result<never, E> => ({ ok: false, error })

// Usage:
const getUser = t.query({
  handler: async (ctx, args): Result<User, ErrorCodes['NOT_FOUND']> => {
    const user = await ctx.db.users.find(args.id)
    if (!user) return err({ code: 'NOT_FOUND', message: 'User not found' })
    return ok(user)
  }
})
```

---

## 5.3 Short-term: Plugin as Functor

```typescript
// Plugin with functorial map
interface Plugin<Ctx, Extended> {
  name: string
  extend: (ctx: Ctx) => Extended
  map: <B>(f: (ext: Extended) => B) => Plugin<Ctx, B>
}

const mapPlugin = <Ctx, A, B>(
  p: Plugin<Ctx, A>,
  f: (a: A) => B
): Plugin<Ctx, B> => ({
  name: p.name,
  extend: (ctx) => f(p.extend(ctx)),
  map: (g) => pipe(p, mapPlugin(g), f)
})

// Plugin composition
const andThen = <Ctx, A, B>(
  p1: Plugin<Ctx, A>,
  p2: Plugin<A, B>
): Plugin<Ctx, B> => ({
  name: `${p1.name} > ${p2.name}`,
  extend: (ctx) => p2.extend(p1.extend(ctx)),
  map: (f) => pipe(p1, andThen(p2), mapPlugin(f)),
})
```
