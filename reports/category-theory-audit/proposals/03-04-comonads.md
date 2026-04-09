# 3.4 Comonads for Query Context and Memoization

## Mathematical Principle

A **comonad** is the dual of a monad. Where monads wrap values in effects, comonads extract values from contexts:

```typescript
interface Comonad<W> {
  extract: <A>(wa: W<A>) => A        // Extract the value
  duplicate: <A>(wa: W<A>) => W<W<A>> // Nest the context
  extend: <A, B>(wa: W<A>, f: (W<A>) => B) => W<B>  // Co-bind
}
```

The **Store comonad** (`(S → A, S)`) provides memoization:
```typescript
type Store<S, A> = (getState: (s: S) => A) & { state: S }
// extract: (store) → store.state
// extend: (store, f) → (s → f(store))
```

## Practical Implementation

```typescript
// Query context as a comonad
interface QueryEnv {
  db: Database
  cache: Cache
  logger: Logger
  requestId: string
}

type QueryContext<A> = Store<QueryEnv, A>

// Create query context
const queryContext = (env: QueryEnv): QueryContext<A> => ({
  get: (f) => f(env),  // Access any part of context
  state: env,
})

// Extract value from context
const extract = <A>(qc: QueryContext<A>): A => qc.state as unknown as A

// Extend (run query and store result)
const extendQuery = <A, B>(
  qc: QueryContext<A>,
  f: (qc: QueryContext<A>) => B
): QueryContext<B> => ({
  get: (g) => g({ ...qc, state: f(qc) }),
  state: { ...qc.state },
})

// Memoized query using comonad extend
const memoizedQuery = <A>(
  key: string,
  query: (ctx: QueryContext<A>) => Promise<A>
): (ctx: QueryContext<unknown>) => Promise<A> => {
  const cache = new Map<string, A>()

  return (ctx) => {
    if (cache.has(key)) {
      return Promise.resolve(cache.get(key)!)
    }
    return query(ctx).then(result => {
      cache.set(key, result)
      return result
    })
  }
}

// Usage:
const getUser = t.query({
  handler: async (ctx, args) => {
    // ctx automatically memoized via comonad extend
    const users = await memoizedQuery(
      `users:${args.id}`,
      (ctx) => ctx.get(c => c.db.users.find(args.id))
    )(ctx)
    return users
  }
})
```

## Expected Benefits

| Benefit | Description |
|---------|-------------|
| **Automatic memoization** | Query results cached based on context |
| **Dependency tracking** | Know exactly which queries need recomputation when context changes |
| **Change propagation** | Comonadic extend computes which queries are affected |

## Killer Feature: Automatic Query Invalidation via Comonad

```typescript
// When context changes (e.g., user logs out):
const logout = (ctx: QueryContext<UserSession>): QueryContext<UserSession> =>
  ctx | extend((c) => ({ ...c.state, user: null }))

// All queries that depend on user.session are automatically invalidated
// via comonadic duplicate/extract tracking
```
