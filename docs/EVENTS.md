# Event System Specification

## Overview

The event system provides a publish-subscribe mechanism integrated into `@deessejs/server`. It allows queries and mutations to emit events that other parts of the application can listen to, enabling loose coupling between components.

## Core Concepts

### Event Emission (`ctx.send`)

The context provides a `send` method to emit events. Events are typed and can carry arbitrary data.

### Event Subscription (`t.on`)

Queries and mutations can subscribe to events using the `t.on` method. Subscriptions are defined at the query/mutation level and triggered when matching events are emitted.

## API Reference

### Context: `ctx.send()`

```typescript
type Send = {
  <EventData = unknown>(event: string, data: EventData): void
  <EventData = unknown>(event: string, data: EventData, options: SendOptions): void
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
   */
  delay?: number
}
```

### Query/Mutation: `t.on()`

```typescript
type EventHandler<Ctx, Args, EventData> = (ctx: Ctx, args: Args, event: EventData) => void | Promise<void>

type QueryBuilder<Ctx> = {
  on<EventName extends string, EventData = unknown>(
    event: EventName,
    handler: EventHandler<Ctx, unknown, EventData>
  ): QueryBuilder<Ctx>
}
```

## Usage Examples

### Basic Event Emission

```typescript
const createUser = t.mutation({
  args: z.object({
    name: z.string(),
    email: z.string().email(),
  }),
  handler: async (ctx, args): AsyncOutcome<User> => {
    const user = await ctx.db.users.create(args)

    // Emit event when user is created
    ctx.send("user.created", {
      userId: user.id,
      email: user.email,
      timestamp: new Date().toISOString(),
    })

    return success(user)
  }
})
```

### Subscribing to Events

```typescript
const notifyAdmin = t.mutation({
  args: z.object({}),
  handler: async (ctx): AsyncOutcome<void> => {
    // This mutation listens to user.created events
    return success(undefined)
  }
})
  .on("user.created", async (ctx, args, event) => {
    // Send notification when user is created
    await ctx.send("notification.send", {
      to: "admin@example.com",
      subject: "New user registration",
      body: `User ${event.data.email} has registered.`,
    })
  })
```

### Multiple Event Subscriptions

```typescript
const auditLog = t.query({
  args: z.object({ userId: z.number() }),
  handler: async (ctx, args): AsyncOutcome<AuditLog[]> => {
    const logs = await ctx.db.auditLogs.findByUser(args.userId)
    return success(logs)
  }
})
  .on("user.created", async (ctx, args, event) => {
    await ctx.db.auditLogs.create({
      action: "USER_CREATED",
      userId: event.data.userId,
      timestamp: event.data.timestamp,
    })
  })
  .on("user.updated", async (ctx, args, event) => {
    await ctx.db.auditLogs.create({
      action: "USER_UPDATED",
      userId: event.data.userId,
      timestamp: event.data.timestamp,
    })
  })
  .on("user.deleted", async (ctx, args, event) => {
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
  handler: async (ctx, args): AsyncOutcome<Order> => {
    const order = await ctx.db.orders.create(args)

    ctx.send("order.created", { orderId: order.id }, { namespace: "ecommerce" })

    return success(order)
  }
})

const emailService = t.mutation({
  args: z.object({}),
  handler: async (ctx): AsyncOutcome<void> => {
    return success(undefined)
  }
})
  .on("ecommerce.order.created", async (ctx, args, event) => {
    // Only listens to events in "ecommerce" namespace
    await ctx.email.sendOrderConfirmation(event.data.orderId)
  })
```

### Delayed Events

```typescript
const scheduledNotification = t.mutation({
  args: z.object({
    userId: z.number(),
    message: z.string(),
    sendAt: z.string().datetime(),
  }),
  handler: async (ctx, args): AsyncOutcome<void> => {
    const delay = new Date(args.sendAt).getTime() - Date.now()

    ctx.send("notification.send", {
      userId: args.userId,
      message: args.message,
    }, { delay: Math.max(0, delay) })

    return success(undefined)
  }
})
```

### Broadcasting Events

```typescript
const configUpdated = t.mutation({
  args: z.object({ key: z.string(), value: z.unknown() }),
  handler: async (ctx, args): AsyncOutcome<void> => {
    await ctx.db.config.set(args.key, args.value)

    // Broadcast to all instances/clients
    ctx.send("config.updated", {
      key: args.key,
      value: args.value,
    }, { broadcast: true })

    return success(undefined)
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
    return success(user)
  }
})

// modules/notifications.ts
export const notificationHandler = t.mutation({
  args: z.object({}),
  handler: async (ctx) => success(undefined)
})
  .on("user.created", async (ctx, args, event) => {
    await ctx.send("email.send", {
      to: event.data.user.email,
      template: "welcome",
    })
  })

// modules/analytics.ts
export const analyticsHandler = t.mutation({
  args: z.object({}),
  handler: async (ctx) => success(undefined)
})
  .on("user.created", async (ctx, args, event) => {
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
  plugins: [notificationHandler, analyticsHandler],
})
```

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
const resilientHandler = t.mutation({
  args: z.object({}),
  handler: async (ctx): AsyncOutcome<void> => success(undefined)
})
  .on("user.created", async (ctx, args, event) => {
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
.on("order.*", async (ctx, args, event) => {
  if (event.name !== "order.completed") return
  // Only handle completed orders
})

// Better: Use specific event name
.on("order.completed", async (ctx, args, event) => {
  // Only handles completed orders
})
```

## Future Considerations

- Event persistence (store events for replay)
- Event sourcing support
- WebSocket event broadcasting
- Scheduled/cron events
- Event transformation/aggregation
- Dead letter queue for failed events
