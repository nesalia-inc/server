# Multi-Engine Validation System

## Overview

The validation system supports multiple validation libraries (Zod, Valibot, ArkType, Typia). You use your preferred validator directly - the framework automatically detects and works with any Standard Schema compatible library.

## Zero-Dependency Core

`@deessejs/server` core has **zero validation dependencies**. You choose which library to use:

```typescript
import { z } from "zod"

const { t, createAPI } = defineContext({
  context: { db: myDatabase }
})

// Just use Zod directly - it's that simple
const getUser = t.query({
  args: z.object({
    id: z.number()
  }),
  handler: async (ctx, args) => { ... }
})
```

## Supported Libraries

| Library | Size | Performance |
|---------|------|-------------|
| **Zod** | ~30KB | Good |
| **Valibot** | ~6KB | Excellent |
| **ArkType** | ~12KB | Excellent |
| **Typia** | ~0KB* | Fastest |

*Typia generates validation code at compile time, no runtime bundle.

## Usage Examples

### With Zod (Recommended)

```typescript
import { z } from "zod"
import { ok } from "@deessejs/server"

const getUser = t.query({
  args: z.object({
    id: z.number()
  }),
  handler: async (ctx, args) => {
    const user = await ctx.db.users.find(args.id)
    return ok(user)
  }
})
```

### With Valibot

```typescript
import { v } from "valibot"

const getUser = t.query({
  args: v.object({
    id: v.number(),
    include: v.optional(v.string())
  }),
  handler: async (ctx, args) => {
    const user = await ctx.db.users.find(args.id)
    return ok(user)
  }
})
```

### With ArkType

```typescript
import { type } from "arktype"

const getUser = t.query({
  args: type({
    id: "number",
    include: "string?"
  }),
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

Types are automatically inferred from schemas - no manual configuration needed.

```typescript
import { z } from "zod"

const createUser = t.mutation({
  args: z.object({
    name: z.string().min(2),
    email: z.string().email()
  }),
  handler: async (ctx, args) => {
    // args is automatically typed!
    // { name: string; email: string }
    return ok(args)
  }
})
```

## Partial Validation

Since `@deessejs` is validator-agnostic, schema manipulation (like partial or omit) should be done using your validator's native API.

### With Zod

```typescript
import { z } from "zod"

const userSchema = z.object({
  id: z.number(),
  name: z.string().min(2),
  email: z.string().email()
})

// Use .partial() for optional fields
const updateUserSchema = userSchema.partial()
const updateUser = t.mutation({
  args: updateUserSchema,
  handler: async (ctx, args) => { ... }
})

// Or use .omit() to exclude fields
const createUserSchema = userSchema.omit({ id: true })
```

### With Valibot

```typescript
import { v } from "valibot"

const userSchema = v.object({
  id: v.number(),
  name: v.pipe(v.string(), v.minLength(2)),
  email: v.pipe(v.string(), v.email())
})

// Use .partial() for optional fields
const updateUserSchema = v.partial(userSchema)
const updateUser = t.mutation({
  args: updateUserSchema,
  handler: async (ctx, args) => { ... }
})
```

## Client-Side Validation

You can also use the same validator on the client to validate before sending:

```typescript
// Client-side validation (avoids unnecessary network requests)
import { z } from "zod"

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email()
})

// Use before calling API
const result = schema.safeParse({ name: "J", email: "invalid" })
if (!result.success) {
  // Show error immediately - no network request needed!
  return
}

// Only send if valid
await client.users.create(result.data)
```

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

## Performance Comparison

### Bundle Size

| Configuration | Bundle Size | Reduction |
|---------------|-------------|-----------|
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
