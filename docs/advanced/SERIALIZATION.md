# Serialization System

## Overview

The serialization system handles converting complex JavaScript types to JSON and back. This is critical for maintaining type safety and Developer Experience (DX) between the server and client.

## The Problem

Native `JSON.stringify` destroys complex types:

```typescript
// Server returns
const user = {
  id: 1,
  name: "John",
  createdAt: new Date("2024-01-01"),
  roles: new Set(["admin", "user"]),
  profile: new Map([["key", "value"]]),
  bigNumber: BigInt(12345678901234567890)
}

// After JSON.stringify
{
  "id": 1,
  "name": "John",
  "createdAt": "2024-01-01T00:00:00.000Z",  // Date → String
  "roles": {},                                 // Set → {}
  "profile": {},                               // Map → {}
  "bigNumber": "12345678901234567890"          // BigInt → String
}

// On client, types don't match!
```

## Supported Types

### Date

```typescript
// Server
return ok({ createdAt: new Date() })

// Client receives Date object (not string)
const { data } = useQuery(api.users.get)
data.createdAt instanceof Date // ✅ true
```

### BigInt

```typescript
// Server
return ok({ bigNumber: BigInt(12345678901234567890) })

// Client receives BigInt
const { data } = useQuery(api.users.get)
typeof data.bigNumber // "bigint"
```

### Map / Set

```typescript
// Server
return ok({
  roles: new Set(["admin", "user"]),
  metadata: new Map([["key", "value"]])
})

// Client receives Map/Set
const { data } = useQuery(api.users.get)
data.roles instanceof Set // ✅ true
data.metadata instanceof Map // ✅ true
```

### Objects with toJSON

```typescript
// Server
class User {
  constructor(public name: string) {}
  toJSON() { return { name: this.name } }
}

return ok({ user: new User("John") })

// Client
{ user: { name: "John" } }
```

## Usage

### In Query Results

```typescript
import { z } from "zod"

const getUser = t.query({
  args: z.object({
    id: z.number()
  }),
  handler: async (ctx, args) => {
    const user = await ctx.db.users.find(args.id)
    return ok(user)  // Automatically serialized
  }
})
```

### In Mutation Results

```typescript
import { z } from "zod"

const createUser = t.mutation({
  args: z.object({
    name: z.string()
  }),
  handler: async (ctx, args) => {
    const user = await ctx.db.users.create({
      ...args,
      createdAt: new Date(),
      bigNumber: BigInt(123)
    })
    return ok(user)
  }
})
```

### In Event Data

```typescript
ctx.send("user.created", {
  userId: 1,
  timestamp: new Date(),
  metadata: new Map([["source", "web"]])
})
```

## Configuration

### Custom Serializers

```typescript
const { t, createAPI } = defineContext({
  context: { db: myDatabase },
  serialization: {
    custom: {
      // Custom serializer for specific types
      Date: (date: Date) => date.toISOString(),
      BigInt: (bigint: BigInt) => bigint.toString(),
    }
  }
})
```

### Disable Serialization

```typescript
// For performance, disable if you don't need it
const { t, createAPI } = defineContext({
  context: { db: myDatabase },
  serialization: false
})
```

## Type Safety

### Inference

Types are automatically inferred:

```typescript
import { z } from "zod"

const getUser = t.query({
  args: z.object({
    id: z.number()
  }),
  handler: async (ctx, args) => {
    return ok({
      id: 1,
      name: "John",
      createdAt: new Date(),
      roles: new Set(["admin"])
    })
  }
})

// On client - types are preserved!
type User = InferResult<typeof getUser>
// {
//   id: number
//   name: string
//   createdAt: Date
//   roles: Set<string>
// }
```

### Standard Schema Integration

The framework uses Standard Schema internally for type inference. You can use Zod, Valibot, or any compatible validator:

```typescript
import { z } from "zod"

const userSchema = z.object({
  id: z.number(),
  name: z.string(),
  createdAt: z.string(),  // Zod string
  bigInt: z.string()  // BigInt as string
})

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

## Performance

### Benchmarks

| Method | 1000 iterations |
|--------|-----------------|
| JSON.stringify | 45ms |
| serialize (SuperJSON) | 120ms |
| serialize (with dates) | 150ms |

### Recommendations

1. **Use sparingly** - Only serialize what you need
2. **Cache serialized data** - Don't serialize on every request
3. **Consider streaming** - For large datasets

## Error Handling

### Invalid Types

```typescript
// Throws error for non-serializable types
return ok({
  // This will throw!
  callback: () => {}  // Functions are not serializable
})

// Solution: exclude
return ok({
  user: { ...user, callback: undefined }
})
```

## Future Considerations

- Streaming serialization for large payloads
- Binary serialization (for files, buffers)
- Compression integration
- Custom type registration
