# 3.6 Monad Transformers for Error Stacks

## Mathematical Principle

**Monad transformers** stack monadic effects:
- `EitherT` - error handling
- `ReaderT` - context/dependency injection
- `StateT` - mutable state
- `ErrorT` - exception handling

The key insight: transformers compose, allowing complex effect stacks.

## Practical Implementation

```typescript
// Current error handling (ad-hoc):
handler: async (ctx, args) => {
  if (!ctx.user) throw new UnauthorizedError()
  const user = await ctx.db.users.find(args.id)
  if (!user) throw new NotFoundError()
  return user
}

// With monad transformers:
type ProcedureM<R> = EitherT<ErrorT<ReaderT<Ctx, Promise>, R>>
// ^ Error   ^ Exception   ^ Context

// Smart constructors:
const liftQuery = <A>(query: (ctx: Ctx) => Promise<A>): ProcedureM<A> =>
  ReaderT((ctx: Ctx) =>
    ErrorT(Promise.resolve(query(ctx)))
  )

const throwError = <E>(error: E): ProcedureM<never> =>
  EitherT.left(ErrorT.right(error))

const catchError = <A, E>(
  m: ProcedureM<A>,
  f: (e: E) => ProcedureM<A>
): ProcedureM<A> =>
  EitherT.right(ErrorT.throw(m, f))

// Usage:
const getUser = t.query({
  args: z.object({ id: z.number() }),
  handler: (ctx, args) => pipe(
    liftQuery(() => ctx.db.users.find(args.id)),
    chain((user) =>
      user
        ? EitherT.right(user)
        : throwError({ type: 'NOT_FOUND', message: 'User not found' })
    ),
    chain((user) =>
      ctx.user
        ? EitherT.right(user)
        : throwError({ type: 'UNAUTHORIZED', message: 'Not logged in' })
    )
  )
})
```

## Expected Benefits

| Benefit | Description |
|---------|-------------|
| **Composable errors** | Error handling composes across middleware |
| **Type-safe error codes** | Error union types tracked by TypeScript |
| **ReaderT for context** | Context injection becomes a transformer |
