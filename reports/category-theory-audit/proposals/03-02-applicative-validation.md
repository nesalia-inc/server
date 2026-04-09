# 3.2 Applicative Functors for Validation Pipeline

## Mathematical Principle

**Applicative functors** (McBride & Paterson 2008) satisfy:
- `pure: A → F<A>` (lifts value into the functor)
- `<*>: F<A→B> → F<A> → F<B>` (applicative application)

The key property: function application within the functor can be **sequential or parallel** because the function itself is already in the functor.

## Practical Implementation

```typescript
// Current (sequential, stops at first error):
const getUser = t.query({
  args: z.object({
    id: z.number(),
    email: z.string().email(),
  }),
  handler: async (ctx, args) => { ... }
})

// Proposed (parallel, reports ALL errors):
import { Applicative, Validation } from '@deessejs/fp'

const validateUserQuery = pipe(
  z.object({ id: z.number() }).safeParse,
  Validation.mapError(parseErrorToValidationError),
  Applicative.apSecond(
    z.object({ email: z.string().email() }).safeParse,
  )
)

// Usage:
const getUser = t.query({
  args: validateUserQuery, // Applicative validator
  handler: async (ctx, args) => { ... }
})
```

Or with a custom applicative validation:

```typescript
// Parallel validation with aggregated errors
const UserQueryV = Applicative.sequenceS({
  id: validateNumber,
  email: validateEmail,
})

// Result: { id: ValidationError[], email: ValidationError[] }
// All errors collected, not just first
```

## Expected Benefits

| Benefit | Description |
|---------|-------------|
| **Better DX** | Users get ALL validation errors at once, not just the first |
| **Composable validators** | Easy to combine independent validations |
| **Performance** | Independent validations can run in parallel |

## Killer Feature: Custom Error Code Mapping

```typescript
const validateWithCodes = <E extends Record<string, Schema>>(
  schemas: E
): Validator<{ [K in keyof E]: Infer<E[K]> }, { [K in keyof E]: string }> =>
  (input) => {
    const results = Object.entries(schemas).map(([key, schema]) => {
      const result = schema.safeParse(input[key])
      return result.success
        ? { key, value: result.data }
        : { key, error: mapZodToErrorCode(result.error) }
    })

    const errors = results.filter(r => 'error' in r)
    if (errors.length > 0) {
      return Validation.failure(
        errors.map(e => ({ field: e.key, code: e.error }))
      )
    }
    return Validation.success(
      Object.fromEntries(results.map(r => [r.key, r.value]))
    )
  }

// Usage:
const getUser = t.query({
  args: validateWithCodes({
    id: { schema: z.number(), code: 'INVALID_ID' },
    email: { schema: z.string().email(), code: 'INVALID_EMAIL' },
  }),
  handler: async (ctx, args) => { ... }
})
// args: { id: number, email: string }
// error codes: 'INVALID_ID' | 'INVALID_EMAIL'
```
