---
name: deessejs-core
description: Functional programming patterns for TypeScript - Result, Maybe, Try, AsyncResult. Use when working with error handling, optional values, or async operations in TypeScript.
---

# @deessejs/core Skill

When working with TypeScript error handling and functional programming, use these patterns from @deessejs/core.

## Quick Reference

### Creating Values

```typescript
import { ok, err, some, none, okAsync, errAsync, attempt } from "@deessejs/core";

// Result - explicit success/failure
const success = ok(42);
const failure = err("Something went wrong");

// Maybe - optional values
const present = some("hello");
const absent = none();

// Try - wrap throwing functions
const parsed = attempt(() => JSON.parse(jsonString));

// AsyncResult - async operations
const asyncOk = okAsync(data);
const asyncErr = errAsync(new Error("failed"));
```

### Transforming

```typescript
// map - transform the success value
const doubled = ok(10).map(x => x * 2); // Ok(20)

// flatMap - chain operations returning Result
const result = ok("10")
  .flatMap(s => parseInt(s))
  .flatMap(n => divide(n, 2));

// mapErr - transform the error
const customError = err("original").mapErr(e => new Error(e));
```

### Extracting

```typescript
// getOrElse - get value or default
const value = ok(42).getOrElse(0); // 42
const defaultVal = err("oops").getOrElse(0); // 0

// getOrCompute - lazy default
const computed = err("oops").getOrCompute(() => expensiveOperation());

// match - pattern matching
const message = ok(42).match(
  (v) => `Success: ${v}`,
  (e) => `Error: ${e}`
);

// tap - side effects without changing value
ok(42).tap(v => console.log(v)); // logs 42, returns Ok(42)
```

### Type Guards

```typescript
import { isOk, isErr, isSome, isNone } from "@deessejs/core";

if (isOk(result)) {
  console.log(result.value); // TypeScript knows it's Ok
}

if (isSome(maybe)) {
  console.log(maybe.value); // TypeScript knows it's Some
}
```

## Common Patterns

### 1. Input Validation

```typescript
function validateEmail(email: string): Result<Email, string> {
  if (!email.includes("@")) return err("Invalid email");
  return ok(email as Email);
}
```

### 2. Optional Configuration

```typescript
function getConfig(key: string): Maybe<Config> {
  return fromNullable(config[key]);
}

const dbConfig = getConfig("database")
  .map(c => c.host)
  .getOrElse("localhost");
```

### 3. Safe JSON Parsing

```typescript
const data = attempt(() => JSON.parse(userInput));
if (isErr(data)) {
  return err(`Parse error: ${data.error.message}`);
}
return ok(data.value);
```

### 4. Async API Calls

```typescript
async function fetchUser(id: string): AsyncResult<User, Error> {
  const response = await fetch(`/api/users/${id}`);
  if (!response.ok) {
    return errAsync(new Error(`HTTP ${response.status}`));
  }
  return okAsync(await response.json());
}
```

### 5. Chaining Operations

```typescript
const finalPrice = ok(cart)
  .flatMap(validateCart)
  .map(applyDiscount)
  .map(calculateTax)
  .getOrElse(0);
```

### 6. Error Accumulation

```typescript
const errors: string[] = [];
// Collect all validation errors instead of returning early
if (!isValid(email)) errors.push("Invalid email");
if (!isValid(age)) errors.push("Invalid age");

if (errors.length > 0) return err(errors);
return ok(formData);
```

## Error System (Python-like)

```typescript
import { error, raise } from "@deessejs/core";

const validationError = error({
  name: "ValidationError",
  args: { field: "email", reason: "missing @" }
});

// Add notes
const withNotes = { ...validationError, notes: ["Try adding a valid email"] };

// Use in transformations with raise
const validated = ok(input).mapErr(e => raise(validationError));
```

## Conversions

```typescript
import { toResult, toMaybeFromResult, fromNullable } from "@deessejs/core";

// Maybe → Result
const result = toResult(maybe, () => "default error");

// Result → Maybe
const maybe = toMaybeFromResult(result);

// undefined/null → Maybe
const maybe = fromNullable(value);
```

## When to Use Each Type

| Type | Use When |
|------|----------|
| **Result** | Explicit success/failure with typed errors |
| **Maybe** | Value might exist or not (no error context) |
| **Try** | Wrapping synchronous functions that might throw |
| **AsyncResult** | Async operations with error handling |

## Additional Resources

- Documentation: https://core.deesse.dev
- GitHub: https://github.com/nesalia-inc/core
