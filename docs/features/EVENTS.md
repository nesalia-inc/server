# Event System Specification

## Overview

The event system provides a publish-subscribe mechanism integrated into `@deessejs/server`. It allows queries and mutations to emit events that other parts of the application can listen to, enabling loose coupling between components.

## Core Concepts

### Event Emission (`ctx.send`)

> **Note:** `ctx.send()` is not yet implemented. This is a planned feature.

The context provides a `send` method to emit events. Events are typed and can carry arbitrary data.

> **Important Distinction:** Events follow a **"Fire and Forget"** pattern (1 → N). If you need a synchronous response, use **Lifecycle Hooks** (`.on("beforeInvoke")`, `.on("onSuccess")`, `.on("onError")`) instead.

### Event Subscription (`t.on` and `.on`)

There are two ways to subscribe to events:

1. **`t.on`** - Global listener. Listens to events emitted anywhere in the application. Useful for cross-cutting concerns like logging, analytics, or audit trails.

2. **`.on`** - Query/Mutation lifecycle listener. Attaches handlers that run before/after a specific query or mutation executes (see `beforeInvoke`, `onSuccess`, `onError` in SPEC.md).

### Event Registry

Events are typed via a registry for autocomplete and type safety, using `defineEvents` (similar to `defineCacheKeys`).

```typescript
// events/registry.ts
import { defineEvents } from "@deessejs/server"

// Define all events for your app
const events = defineEvents({
  // User events
  user: {
    created: {
      data: { userId: number; email: string; timestamp: string }
    },
    updated: {
      data: { userId: number; changes: Record<string, unknown> }
    },
    deleted: {
      data: { userId: number }
    }
  },

  // Email events
  email: {
    send: {
      data: { to: string; template: string }
    },
    sent: {
      data: { messageId: string; to: string }
    }
  },

  // Order events (namespaced)
  order: {
    created: {
      data: { orderId: number; total: number }
    },
    completed: {
      data: { orderId: number; status: string }
    }
  }
})

export { events }
```

### Use in Code

```typescript
import { t } from "../context"
import { events } from "./events/registry"

// Type-safe send - autocomplete works!
ctx.send(events.user.created, { userId: 1, email: "test@test.com" })

// Type-safe listener
t.on(events.user.created, (ctx, args, event) => {
  // event.data is typed: { userId: number; email: string; timestamp: string }
  await ctx.db.auditLog.create({
    action: "USER_CREATED",
    userId: event.data.userId
  })
})
```

### TypeScript Benefits

With a typed registry, you get:

1. **Autocomplete** - IDE suggests valid events
2. **Type checking** - Invalid events cause TypeScript errors
3. **Refactoring** - Rename events safely

```typescript
// Autocomplete works!
events.user.    // shows: created, updated, deleted
events.email.   // shows: send, sent

// Type checking catches typos
events.user.created   // ✅ Valid
events.user.creatdd    // ❌ TypeScript error

// Refactoring is safe
// Rename in registry -> all usages update
```

### Integration with `defineContext`

Pass the registry to `defineContext` for automatic type inference across your app:

```typescript
import { defineContext, defineEvents } from "@deessejs/server"
import { events } from "./events/registry"

const { t, createAPI } = defineContext({
  context: { db: myDatabase },
  events  // Use the typed registry
})

// ctx.send is now fully typed with events from registry
ctx.send(events.user.created, { userId: 1, email: "test@test.com" }) // ✅
ctx.send(events.invalid, {}) // ❌ Type error

// t.on is also typed
t.on(events.user.created, (ctx, args, event) => {
  // event.data is typed
})
```

> **Pro Tip:** Use Standard Schema for event validation too! If you send an invalid payload, TypeScript will catch it at compile time.

## API Reference

### Context: `ctx.send()`

```typescript
type Send = {
  <EventData = unknown>(event: string, data: EventData): EventData | undefined
  <EventData = unknown, ReturnData = unknown>(event: string, data: EventData, options: SendOptions): ReturnData | undefined
}

type SendOptions = {
  /**
   * Namespace for the event. Helps organize events by domain.
   * Default: 'default'
   */
  namespace?: string

  /**
   * Broadcast to all subscribers (including cross-instance).
   * Default: false (local only)
   */
  broadcast?: boolean

  /**
   * Delay event delivery (ms).
   * Default: 0 (immediate)
   * Note: Requires a queue plugin (Redis/Upstash) in Serverless environments.
   */
  delay?: number
}
```

### Events vs Lifecycle Hooks

| Aspect | Events (`ctx.send`) | Lifecycle Hooks (`.on`) |
|--------|---------------------|------------------------|
| **Pattern** | Fire and Forget (1 → N) | Synchronous (1 → 1) |
| **Response** | Not expected | Not applicable |
| **Use Case** | Decouple domains, async processing | Extend query/mutation behavior |
| **Execution** | After handler completes | During handler lifecycle |

> **Recommendation:** Use `ctx.send` for domain decoupling (e.g., `Users` module doesn't know about `Email`). Use `.on("onSuccess")` when you need to extend an existing query/mutation without modifying its handler (Open/Closed Principle).

### Global Listener: `t.on()`

Global event listener that subscribes to events emitted anywhere in the application.

```typescript
type EventHandler<Ctx, Args, EventData> = (ctx: Ctx, args: Args, event: EventData) => void | Promise<void>

type T<Ctx> = {
  on<EventName extends string, EventData = unknown>(
    event: EventName,
    handler: EventHandler<Ctx, unknown, EventData>
  ): T<Ctx>
}

// Usage
const myListener = t.on("user.created", async (ctx, args, event) => {
  // Called whenever any query/mutation emits "user.created"
  await ctx.db.auditLog.create({ action: "USER_CREATED", ...event.data })
})
```

### Query/Mutation Listener: `.on()`

Lifecycle listener attached to a specific query or mutation. Runs before/after that query/mutation executes.

```typescript
import { z } from "zod"

type Query<Ctx, Args, Output> = {
  on(event: "beforeInvoke", handler: (ctx: Ctx, args: Args) => void | Promise<void>): Query<Ctx, Args, Output>
  on(event: "onSuccess", handler: (ctx: Ctx, args: Args, data: Output) => void | Promise<void>): Query<Ctx, Args, Output>
  on(event: "onError", handler: (ctx: Ctx, args: Args, error: unknown) => void | Promise<void>): Query<Ctx, Args, Output>
}

// Usage
const getUser = t.query({
  args: z.object({
    id: z.number()
  }),
  handler: async (ctx, args) => { ... }
})
  .on("beforeInvoke", (ctx, args) => { console.log("Fetching user", args.id) })
  .on("onSuccess", (ctx, args, user) => { console.log("User found", user.id) })
  .on("onError", (ctx, args, error) => { console.error("Failed", error) })
```

## Usage Examples

### Basic Event Emission

```typescript
import { z } from "zod"

const createUser = t.mutation({
  args: z.object({
    name: z.string(),
    email: z.string().email()
  }),
  handler: async (ctx, args) => {
    const user = await ctx.db.users.create(args)

    // Emit event when user is created
    ctx.send("user.created", {
      userId: user.id,
      email: user.email,
      timestamp: new Date().toISOString(),
    })

    return ok(user)
  }
})
```

### Event with Response

> **Warning:** The Request/Response pattern on events is an anti-pattern. If you need a response, use **Lifecycle Hooks** instead.

```typescript
// ❌ Avoid: Events with response (1 → N becomes unclear)
const result = ctx.send("email.send", { to: user.email })
// Which listener should respond? What if 3 listeners all respond?

// ✅ Better: Use lifecycle hooks for request/response patterns
const sendWelcomeEmail = t.mutation({
  args: z.object({ userId: z.number() }),
  handler: async (ctx, args) => {
    const user = await ctx.db.users.find(args.userId)
    // Direct call with expected response
    const result = await ctx.email.send(args.userId, "welcome")
    return ok(result)
  }
})
```

### Global Listener: `t.on()`

Subscribe to events emitted anywhere in the application:

```typescript
// Global listener - not attached to a specific query/mutation
t.on("user.created", async (ctx, args, event) => {
  // Called whenever any query/mutation emits "user.created"
  await ctx.send("notification.send", {
    to: "admin@example.com",
    subject: "New user registration",
    body: `User ${event.data.email} has registered.`,
  })
})
```

### Multiple Global Listeners

```typescript
// Audit log listener
t.on("user.created", async (ctx, args, event) => {
  await ctx.db.auditLogs.create({
    action: "USER_CREATED",
    userId: event.data.userId,
    timestamp: event.data.timestamp,
  })
})

t.on("user.updated", async (ctx, args, event) => {
  await ctx.db.auditLogs.create({
    action: "USER_UPDATED",
    userId: event.data.userId,
    timestamp: event.data.timestamp,
  })
})

t.on("user.deleted", async (ctx, args, event) => {
  await ctx.db.auditLogs.create({
    action: "USER_DELETED",
    userId: event.data.userId,
    timestamp: event.data.timestamp,
  })
})
```

### Namespaced Events

```typescript
const orderCreated = t.mutation({
  args: z.object({ items: z.array(z.string()) }),
  handler: async (ctx, args) => {
    const order = await ctx.db.orders.create(args)

    ctx.send("order.created", { orderId: order.id }, { namespace: "ecommerce" })

    return ok(order)
  }
})

// Global listener for namespaced event
t.on("ecommerce.order.created", async (ctx, args, event) => {
  // Only listens to events in "ecommerce" namespace
  await ctx.email.sendOrderConfirmation(event.data.orderId)
})
```

### Automatic Plugin Namespacing

Events emitted from plugins are automatically prefixed with the plugin name:

```typescript
import { plugin } from "@deessejs/server"

// Plugin: notifications
const notificationPlugin = plugin({
  name: "notifications",
  router: (t) => ({
    send: t.mutation({
      args: z.object({ userId: z.number(), message: z.string() }),
      handler: async (ctx, args) => {
        // This event is automatically namespaced
        ctx.send("sent", { userId: args.userId })

        // Equivalent to: ctx.send("notifications.sent", { userId: args.userId })
        return ok({ success: true })
      }
    })
  })
})

// Global listener receives namespaced event
t.on("notifications.sent", async (ctx, args, event) => {
  // Listens to "notifications.sent" automatically
  await ctx.db.notificationsLog.create(event.data)
})
```

This reinforces:
- **Security:** Events from plugins can't collide with main app events
- **Clarity:** `api.notifications.sent` in code = `notifications.sent` in listeners

```typescript
import { z } from "zod"

const scheduledNotification = t.mutation({
  args: z.object({
    userId: z.number(),
    message: z.string(),
    sendAt: z.string()
  }),
  handler: async (ctx, args) => {
    const delay = new Date(args.sendAt).getTime() - Date.now()

    ctx.send("notification.send", {
      userId: args.userId,
      message: args.message,
    }, { delay: Math.max(0, delay) })

    return ok(undefined)
  }
})
```

### Broadcasting Events

```typescript
import { z } from "zod"

const configUpdated = t.mutation({
  args: z.object({
    key: z.string(),
    value: z.any()
  }),
  handler: async (ctx, args) => {
    await ctx.db.config.set(args.key, args.value)

    // Broadcast to all instances/clients
    ctx.send("config.updated", {
      key: args.key,
      value: args.value,
    }, { broadcast: true })

    return ok(undefined)
  }
})
```

### Cross-Module Event Flow

```typescript
// modules/users.ts
export const createUser = t.mutation({
  args: userSchema,
  handler: async (ctx, args) => {
    const user = await ctx.db.users.create(args)
    ctx.send("user.created", { user })
    return ok(user)
  }
})

// modules/notifications.ts - global listener
t.on("user.created", async (ctx, args, event) => {
  await ctx.send("email.send", {
    to: event.data.user.email,
    template: "welcome",
  })
})

// modules/analytics.ts - global listener
t.on("user.created", async (ctx, args, event) => {
  await ctx.analytics.track("user_signup", {
    userId: event.data.user.id,
  })
})

// main.ts
const api = createAPI({
  router: t.router({
    users: t.router({
      create: createUser,
    }),
  }),
})
```

## Serverless Considerations (Next.js / Vercel)

In Serverless environments (Vercel, Cloudflare Workers), the function execution stops as soon as the HTTP response is sent. This creates critical challenges for event processing.

### The Lambda Freeze Problem

```typescript
handler: async (ctx, args) => {
  await ctx.db.users.create(args)
  ctx.send("user.created", { userId: user.id })

  return ok(user)
  // ⚠️ HTTP response sent here - function may freeze!
  // Listeners may never execute or be cut off mid-execution
}
```

### Delay Requires a Queue Plugin

The `delay` option cannot work in-memory on Lambdas (they're too expensive and volatile). Use a queue plugin:

```typescript
// Requires a queue plugin (Upstash Redis, Inngest, BullMQ)
ctx.send("notification.send", {
  userId: args.userId,
  message: args.message,
}, { delay: 5000 }) // 5 second delay via Redis queue
```

## Transaction Integrity

Events are only emitted **if the handler succeeds**:

```typescript
// ✅ Success - events are processed
handler: async (ctx, args) => {
  await ctx.db.users.create(args)
  ctx.send("user.created", { userId: user.id })

  return ok(user)
}

// ❌ Failure - pending events are cancelled
handler: async (ctx, args) => {
  await ctx.db.users.create(args)
  ctx.send("user.created", { userId: user.id })

  throw new Error("DB Crash")
}
```

This prevents inconsistent states where an event is emitted but the action wasn't completed.

## Event Types

### Built-in Events

```typescript
// Cache invalidation events (automatic)
type CacheInvalidationEvent = {
  query: string
  key?: string
}

// Plugin can define custom events
type CustomEvent<T = unknown> = {
  name: string
  data: T
  timestamp: string
  namespace: string
}
```

### Event Listener Type

```typescript
type EventListener<Ctx, Args, EventData> = {
  /**
   * Event name to subscribe to
   */
  event: string

  /**
   * Handler function
   */
  handler: (ctx: Ctx, args: Args, event: EventPayload<EventData>) => void | Promise<void>

  /**
   * Optional filter to conditionally process event
   */
  filter?: (event: EventPayload<EventData>) => boolean
}
```

### Event Payload

```typescript
type EventPayload<T = unknown> = {
  name: string
  data: T
  timestamp: string
  namespace: string
  source?: string
}
```

## Configuration

### Global Event Options

```typescript
const api = createAPI({
  router: t.router({ ... }),
  events: {
    /**
     * Maximum event queue size
     * @default 1000
     */
    queueSize?: number

    /**
     * Event delivery timeout (ms)
     * @default 5000
     */
    timeout?: number

    /**
     * Enable event logging
     * @default false
     */
    logging?: boolean

    /**
     * Error handler for failed event delivery
     */
    onError?: (error: Error, event: EventPayload) => void
  }
})
```

## Error Handling

```typescript
t.on("user.created", async (ctx, args, event) => {
  try {
    await ctx.externalService.notify(event.data)
  } catch (error) {
    // Events should not break the main flow
    console.error("Failed to send notification:", error)
    // Could also emit a separate error event
    ctx.send("event.delivery_failed", {
      originalEvent: "user.created",
      error: error.message,
    })
  }
})
```

## Testing Events

```typescript
import { createLocalExecutor } from "@deessejs/server"

const executor = createLocalExecutor(api)

// Get emitted events from execution
const result = await executor.execute("users.create", { name: "John", email: "john@example.com" })

// Access events from execution context
console.log(executor.getEvents())
// [
//   { name: "user.created", data: { userId: 1, ... }, namespace: "default" }
// ]

// Filter events
const userEvents = executor.getEvents().filter(e => e.name.startsWith("user."))
```

## Best Practices

1. **Use namespaced events** - Organize events by domain (e.g., `ecommerce.order.created`)

2. **Event naming** - Use past tense for events that represent completed actions (`user.created`, `order.completed`)

3. **Keep event data minimal** - Include IDs and references, fetch full data in handlers if needed

4. **Don't block on events** - Event handlers should not affect the main execution flow

5. **Handle errors gracefully** - Events should not cause mutations/queries to fail

6. **Use event filters** - Filter events at subscription level to avoid unnecessary processing

```typescript
// Good: Filter at subscription level
t.on("order.*", async (ctx, args, event) => {
  if (event.name !== "order.completed") return
  // Only handle completed orders
})

// Better: Use specific event name
t.on("order.completed", async (ctx, args, event) => {
  // Only handles completed orders
})
```

## Advanced Features

### Wildcard Support (Joker)

Listen to all events in a domain using wildcards:

```typescript
// Listen to all user events
t.on("user.*", (ctx, args, event) => {
  // Catches: user.created, user.updated, user.deleted, etc.
  console.log(`User event: ${event.name}`, event.data)
})

// Listen to all events
t.on("*", (ctx, args, event) => {
  // Catches all events in the system
  ctx.logger.info("Event emitted", { name: event.name })
})
```

### Internal Events

Some events should never be exposed to clients (e.g., for WebSocket broadcasting later):

```typescript
const events = defineEvents({
  user: {
    created: {
      data: { userId: number; email: string },
      internal: true  // Not accessible from client
    },
    updated: {
      data: { userId: number; changes: Record<string, unknown> }
    }
  }
})

// Internal events can only be emitted from server code
// Client cannot trigger internal events via API
```

### Standard Schema Validation for Events

Use Standard Schema to validate event payloads at runtime (especially useful in development):

```typescript
import { v } from "valibot"

const events = defineEvents({
  user: {
    created: {
      // Validates payload at runtime in development
      schema: v.object({
        userId: v.number(),
        email: v.pipe(v.string(), v.email())
      }),
      data: {} as { userId: number; email: string } // TypeScript type
    }
  }
})

// In development: ctx.send validates against schema
// In production: validation can be disabled for performance
```

This catches bugs early when a developer forgets a property in the payload.

## Registry Internals

### How `defineEvents` Works

The registry transforms nested objects into string event names:

```typescript
// Define
const events = defineEvents({
  user: {
    created: { data: { userId: number } }
  }
})

// Usage in code (object reference)
ctx.send(events.user.created, { userId: 1 })

// Internally transformed to
ctx.send("user.created", { userId: 1 })
```

Benefits:
- **Autocomplete:** IDE suggests `events.user.` → `created`
- **Type Safety:** Rename in registry → all usages update
- **Runtime:** Framework converts object to string for the event bus

## Future Considerations

- Event persistence (store events for replay)
- Event sourcing support
- WebSocket event broadcasting
- Scheduled/cron events
- Event transformation/aggregation
- Dead letter queue for failed events
