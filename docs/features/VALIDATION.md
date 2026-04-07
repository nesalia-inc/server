# Multi-Engine Validation System

## Overview

The validation system supports multiple validation libraries through the **Standard Schema** interface. This allows you to use any validation library (Zod, Valibot, ArkType, Typia) without adapter code - `@deessejs` automatically detects and works with any library implementing the standard.

## Zero-Dependency Core

`@deessejs/drpc` core has **zero validation dependencies**. You choose which library to use:

```typescript
// No validator configured = use any Standard Schema compatible library
const { t, createAPI } = defineContext({
  context: { db: myDatabase }
})

// Works with Zod, Valibot, ArkType, Typia - any of them via @standard-schema adapters!
const getUser = t.query({
  args: {
    [StandardSchema.$schema]: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties: {
      id: { type: "number" }
    },
    required: ["id"]
  },
  handler: async (ctx, args) => { ... }
})
```

## Supported Libraries

| Library | Size | Standard Schema | Performance |
|---------|------|-----------------|-------------|
| **Valibot** | ~6KB | ✅ Yes | Excellent |
| **ArkType** | ~12KB | ✅ Yes | Excellent |
| **Zod** | ~30KB | ✅ Yes (v3) | Good |
| **Typia** | ~0KB* | ✅ Yes | Fastest |
| Yup | ~25KB | ❌ No | Good |
| Superstruct | ~15KB | ❌ No | Good |

*Typia generates validation code at compile time, no runtime bundle.

## Standard Schema

The [Standard Schema](https://standard-schema.dev) is a unified interface that lets any validation library work together. Libraries implement `StandardSchemaV1` which provides:

- `validate(input)` - Validate data
- `~standard.types.input` - Input type inference
- `~standard.types.output` - Output type inference

### How It Works

```typescript
import { type } from "arktype"
import * as v from "valibot"
import { z } from "zod"

function validate<T extends StandardSchemaV1>(
  schema: T,
  input: StandardSchemaV1.InferInput<T>
): StandardSchemaV1.InferOutput<T> {
  const result = schema["~standard"].validate(input)
  if (result.issues) throw new Error(result.issues)
  return result.value
}

// All work the same way!
validate(z.string(), "hello")           // Zod
validate(v.string(), "hello")           // Valibot
validate(type("string"), "hello")       // ArkType
```

### Auto-Detection

`@deessejs` automatically detects which library you're using:

```typescript
// Just use any Standard Schema compatible library
const getUser = t.query({
  args: z.object({ id: z.number() }),  // Detected as Zod
  handler: async (ctx, args) => { ... }
})

const createUser = t.mutation({
  args: v.object({                       // Detected as Valibot
    name: v.string(),
    email: v.pipe(v.string(), v.email())
  }),
  handler: async (ctx, args) => { ... }
})

const getPost = t.query({
  args: type({ id: "number" }),         // Detected as ArkType
  handler: async (ctx, args) => { ... }
})
```

## Usage Examples

### With Standard Schema (Native JSON Schema)

```typescript
import * as StandardSchema from "standard-schema"

const getUser = t.query({
  args: {
    [StandardSchema.$schema]: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties: {
      id: { type: "number" }
    },
    required: ["id"]
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.users.find(args.id)
    return ok(user)
  }
})
```

### With Zod (via @standard-schema/zod)

```typescript
import * as StandardSchema from "standard-schema"
import { createSchema } from "@standard-schema/zod"
import { z } from "zod"

const getUser = t.query({
  args: createSchema(z.object({
    id: z.number()
  })),
  handler: async (ctx, args) => {
    const user = await ctx.db.users.find(args.id)
    return ok(user)
  }
})
```

### With Valibot

```typescript
import * as StandardSchema from "standard-schema"
import { createSchema } from "@standard-schema/valibot"
import { v } from "valibot"

const getUser = t.query({
  args: createSchema(v.object({
    id: v.number(),
    include: v.optional(v.string())
  })),
  handler: async (ctx, args) => {
    const user = await ctx.db.users.find(args.id)
    return ok(user)
  }
})
```

### With ArkType

```typescript
import * as StandardSchema from "standard-schema"
import { createSchema } from "@standard-schema/arktype"
import { type } from "arktype"

const getUser = t.query({
  args: createSchema(type({
    id: "number",
    include: "string?"
  })),
  handler: async (ctx, args) => {
    const user = await ctx.db.users.find(args.id)
    return ok(user)
  }
})
```

### With Typia

> **Note:** Typia requires a compilation plugin (`ts-patch` or `unplugin-typia`). Unlike Zod/Valibot, it's not "just a library" - it's a code transformer that generates validation code at compile time.

```typescript
import { typia } from "typia"

const getUser = t.query({
  args: typia<{ id: number }>(),
  handler: async (ctx, args) => {
    const user = await ctx.db.users.find(args.id)
    return ok(user)
  }
})
```

### Setup for Typia

Typia requires additional setup in your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "plugins": [{ "transform": "typia/lib/transform" }]
  }
}
```

Or use with unplugin:

```typescript
// vite.config.ts
import typia from "unplugin-typia/vite"

export default defineConfig({
  plugins: [typia()]
})
```

## Type Inference

Types are automatically inferred from schemas - no manual configuration needed:

```typescript
import { InferArgs, InferOutput } from "@deessejs/drpc"
import * as StandardSchema from "standard-schema"

const createUser = t.mutation({
  args: {
    [StandardSchema.$schema]: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties: {
      name: { type: "string", minLength: 2 },
      email: { type: "string", format: "email" }
    },
    required: ["name", "email"]
  },
  handler: async (ctx, args) => {
    // args is automatically typed!
    // { name: string; email: string }
    return ok(args)
  }
})

// Extract types for reuse
type CreateUserArgs = InferArgs<typeof createUser>
type CreateUserOutput = InferOutput<typeof createUser>
// CreateUserArgs = { name: string; email: string }
```

The framework uses Standard Schema's type utilities internally:

```typescript
import type { StandardSchemaV1 } from "@standard-schema/spec"

export type InferArgs<T> = StandardSchemaV1.InferInput<T>
export type InferOutput<T> = StandardSchemaV1.InferOutput<T>
```

## Partial Validation

Since `@deessejs` is validator-agnostic, schema manipulation (like partial or omit) should be done using your validator's native API. With Standard Schema, use JSON Schema composition:

```typescript
// Standard Schema - use JSON Schema composition
const updateUserSchema = {
  [StandardSchema.$schema]: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    id: { type: "number" },
    name: { type: "string" },
    email: { type: "string", format: "email" }
  },
  required: ["id"]
}

// Or with @standard-schema/zod for Zod-style .partial()
const { createSchema } from "@standard-schema/zod"
import { z } from "zod"
const userSchema = z.object({
  id: z.number(),
  name: z.string().min(2),
  email: z.string().email()
})
const updateUserSchema = createSchema(userSchema.partial())

// Then use in mutation
const updateUser = t.mutation({
  args: updateUserSchema,
  handler: async (ctx, args) => { ... }
})
```

## Client-Side Validation

You can also use the same validator on the client to validate before sending:

```typescript
// Client-side validation (avoids unnecessary network requests)
import * as v from "valibot"

const validateInput = (data: unknown) => {
  const schema = v.object({
    name: v.pipe(v.string(), v.minLength(2)),
    email: v.pipe(v.string(), v.email())
  })

  const result = schema["~standard"].validate(data)
  if (result.issues) {
    return { ok: false, issues: result.issues }
  }
  return { ok: true, value: result.value }
}

// Use before calling API
const validation = validateInput({ name: "J", email: "invalid" })
if (!validation.ok) {
  // Show error immediately - no network request needed!
  return
}

// Only send if valid
await client.users.create(validation.value)
```

This is where **Valibot shines** - at ~6KB, you can bundle it with your client code for instant validation feedback.

## Error Normalization

Different libraries have different error formats:

```typescript
// Zod: result.error.issues
// Valibot: result.issues
// ArkType: result.errors
```

`@deessejs` normalizes all errors to a unified format:

```typescript
// All validators produce the same error format
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      { "path": "email", "message": "Invalid email format" },
      { "path": "name", "message": "Must be at least 2 characters" }
    ]
  }
}
```

### Internal Implementation

The framework handles normalization automatically:

```typescript
// What happens inside @deessejs/drpc
const validate = async (schema, data) => {
  const standardSchema = schema["~standard"]
  if (!standardSchema) {
    throw new Error("Invalid schema: does not implement Standard Schema")
  }

  const result = await standardSchema.validate(data)

  if (result.issues) {
    // Normalization happens here
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Validation failed",
        details: result.issues.map(issue => ({
          path: issue.path?.map(p =>
            typeof p === "object" ? p.key : p
          ).join(".") || "root",
          message: issue.message
        }))
      }
    }
  }

  return { ok: true, value: result.value }
}
```

You don't need to handle this - it's done automatically by the framework.

## Performance Comparison

### Bundle Size

| Configuration | Bundle Size | Reduction |
|----------------|-------------|-----------|
| @deessejs + Zod | ~40KB | baseline |
| @deessejs + Valibot | ~16KB | -60% |
| @deessejs + ArkType | ~22KB | -45% |
| @deessejs + Typia | ~10KB* | -75% |

*Typia has 0KB runtime footprint.

### Parse Time (10,000 iterations)

| Library | Time |
|---------|------|
| Zod | 45ms |
| Valibot | 15ms |
| ArkType | 12ms |
| Typia | 2ms* |

*Typia compiles validation at build time.

## Recommendations

### Use Valibot When

- Bundle size is critical (mobile, edge)
- You need excellent TypeScript inference
- You want fast validation without build complexity

### Use ArkType When

- You want the best TypeScript inference
- You need excellent performance
- You're starting a new project

### Use Zod When

- You have existing Zod schemas
- You need ecosystem compatibility
- You prefer mature tooling

### Use Typia When

- Performance is critical (compile-time validation)
- You don't mind build complexity
- You want zero runtime overhead

## Migration Guide

### From Zod to Valibot

```typescript
// Zod
import { z } from "zod"
const schema = z.object({
  name: z.string().min(2),
  email: z.string().email()
})

// Valibot
import { v } from "valibot"
const schema = v.object({
  name: v.pipe(v.string(), v.minLength(2)),
  email: v.pipe(v.string(), v.email())
})
```

### From Zod to ArkType

```typescript
// Zod
import { z } from "zod"
const schema = z.object({
  name: z.string().min(2),
  email: z.string().email()
})

// ArkType
import { type } from "arktype"
const schema = type({
  name: "string >= 2",
  email: "string.email"
})
```

## Future Considerations

- Runtime schema generation
- Schema versioning
- Built-in validators for common patterns
- Automatic migration tools
