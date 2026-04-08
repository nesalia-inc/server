# `event()` - Defining Events

Creates a typed event definition for the event registry. The args are Standard Schema compatible (Zod, Valibot, ArkType, etc.).

## Signature

```typescript
event<T extends StandardSchemaV1>(config: {
  name: string
  args: T
}): { name: string; args: T }
```

## Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `config.name` | `string` | The event name (e.g., `"user.created"`) |
| `config.args` | `StandardSchemaV1` | A Standard Schema compatible validator (Zod, Valibot, ArkType, etc.) |

## Returns

An event definition object that can be used in `defineEvents()`.

## Example

```typescript
import { defineContext, event } from "@deessejs/server"
import { z } from "zod"

// Define events using the event() helper
const { t, createAPI } = defineContext({
  context: {
    db: myDatabase,
  },
  events: {
    "user.created": event({
      name: "user.created",
      args: z.object({
        id: z.number(),
        email: z.string().email(),
      }),
    }),
    "user.deleted": event({
      name: "user.deleted",
      args: z.object({
        id: z.number(),
      }),
    }),
    "post.published": event({
      name: "post.published",
      args: z.object({
        id: z.number(),
        title: z.string(),
        authorId: z.number(),
      }),
    }),
  },
})
```

## Why Use `event()`?

The `event()` helper provides:

1. **Type Safety** - Event arguments are typed via Standard Schema
2. **IDE Support** - Autocomplete for event names and args
3. **Validation** - Event shapes are validated at definition time
4. **Interoperability** - Works with Zod, Valibot, ArkType, and other Standard Schema compliant validators

## Emitting Events

Events are emitted from handlers using `ctx.send()`:

```typescript
const createUser = t.mutation({
  args: z.object({
    name: z.string(),
    email: z.string().email(),
  }),
  handler: async (ctx, args) => {
    const user = await ctx.db.users.create(args)

    // Emit the event
    ctx.send("user.created", { id: user.id, email: user.email })

    return ok(user)
  },
})
```

## Listening to Events

Register listeners using `t.on()`:

```typescript
// Listen for user.created events
t.on("user.created", async (ctx, evt) => {
  await ctx.db.notifications.create({
    type: "welcome_email",
    userId: evt.data.id,
  })
})
```

## Event Shape

```typescript
// The event object passed to listeners
{
  name: "user.created",
  data: { id: 123, email: "user@example.com" }
}
```

## See Also

- [t.on()](./T_QUERY_BUILDER.md) - Register event listeners
- [ctx.send()](./T_QUERY_BUILDER.md) - Emit events from handlers
- [DEFINING_CONTEXT.md](./DEFINING_CONTEXT.md) - Using events with defineContext
