# 3.1 Free Monads for Procedure Definition

## Mathematical Principle

**Free monads** provide the universal property: any functor `F` can be extended to a monad `Free(F)` such that interpreting a free monad is equivalent to folding over its structure.

## Practical Implementation

```typescript
// Define procedures as a functor
type ProcedureF<A> =
  | { type: 'query'; name: string; handler: Handler; args?: Schema }
  | { type: 'mutation'; name: string; handler: Handler; args?: Schema }
  | { type: 'internalQuery'; name: string; handler: Handler }
  | { type: 'internalMutation'; name: string; handler: Handler }

// Free monad for procedures
type Procedure<A> = Free<ProcedureF, A>

// Smart constructors (injectives into the functor)
const query = <N extends string, A, R>(
  name: N,
  config: { args?: Schema<A>; handler: (ctx: Ctx, args: A) => Promise<R> }
): Procedure<{ name: N; args: A; result: R }> =>
  inj({ type: 'query', name, ...config })

const mutation = <N extends string, A, R>(
  name: N,
  config: { args?: Schema<A>; handler: (ctx: Ctx, args: A) => Promise<R> }
): Procedure<{ name: N; args: A; result: R }> =>
  inj({ type: 'mutation', name, ...config })

// Interpreter (natural transformation from ProcedureF to some effect)
type InterpreterM<M> = <A>(fa: ProcedureF<A>) => HKT<M, A>

// HTTP interpreter
const httpInterpreter: InterpreterM<HttpM> = (fa) => {
  switch (fa.type) {
    case 'query':
      return fa as any // Return HTTP response wrapped in HttpM
    // ...
  }
}

// Test interpreter (local execution)
const localInterpreter: InterpreterM<Task> = (fa) => {
  switch (fa.type) {
    case 'query':
      return fa.handler(ctx, fa.args) // Direct execution
    // ...
  }
}
```

## Expected Benefits

| Benefit | Description |
|---------|-------------|
| **Multiple interpreters** | Same procedure definition works for HTTP, WebSocket, batch, test |
| **Effect fusion** | Procedures can be optimized before interpretation |
| **Compile-time route verification** | Free monad structure catches missing routes |
| **Testability** | Mock interpreters for testing |

## Killer Feature: Composable Middleware as Interpreters

Middleware becomes a natural transformation that wraps the interpretation:

```typescript
// Middleware as interpreter wrapper
const withLogging = <M>(interp: InterpreterM<M>): InterpreterM<M> =>
  (fa) => {
    console.log(`Executing: ${fa.name}`)
    const result = interp(fa)
    console.log(`Completed: ${fa.name}`)
    return result
  }

const withAuth = <M>(interp: InterpreterM<M>): InterpreterM<M> =>
  (fa) => {
    if (requiresAuth(fa)) {
      if (!ctx.userId) throw new UnauthorizedError()
    }
    return interp(fa)
  }
```
