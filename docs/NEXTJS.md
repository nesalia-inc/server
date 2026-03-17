# Next.js Integration Specification

## Overview

`@deessejs/server/next` provides a higher-level integration for Next.js that enables:
1. Automatic cache revalidation across components
2. HTTP exposure of public queries and mutations via route handler

## Security Note

Next.js Server Actions are exposed via HTTP and can be called by anyone. Use this package's architecture to protect sensitive operations:

- Use `query()` / `mutation()` for public operations (exposed via HTTP)
- Use `internalQuery()` / `internalMutation()` for private operations (server-only)

## Imports

```typescript
import { page, layout, serverComponent, clientComponent, createRouteHandler } from "@deessejs/server/next"
```

## Core Concept

- **`clientComponent`** - Wraps a component with automatic cache management
- **`page`** - Creates a Next.js page with cache management
- **`layout`** - Creates a Next.js layout with cache management
- **`serverComponent`** - Marks a component as server component
- **Reactive Queries** - Queries within a component are automatically refetched when related mutations occur
- **Shared Cache** - Components share a cache context, enabling cross-component invalidation

```
Component A                              Component B
┌─────────────────────┐                ┌─────────────────────┐
│ api.tasks.list()    │                │ api.tasks.update()  │
│ (subscribed to      │                │ (mutates data)      │
│  "tasks:list")      │                │                     │
└──────────┬──────────┘                └──────────┬──────────┘
           │                                        │
           │         ┌─────────────────────┐         │
           └────────►│  Shared Cache       │◄────────┘
                     │  (context)         │
                     │                     │
                     │  When "tasks:list" │
                     │  is invalidated,    │
                     │  refetch Component A│
                     └─────────────────────┘
```

## API Reference

### clientComponent

Wraps a client component with automatic cache management.

```typescript
import { z } from "zod"

type ClientComponentProps<Props extends z.ZodType, Ctx extends ApiContext> = {
  props: Props
  component: (ctx: Ctx, props: z.infer<Props>) => React.ReactNode
  fallback?: React.ReactNode
}

function clientComponent<Props extends z.ZodType, Ctx extends ApiContext>(
  config: ClientComponentProps<Props, Ctx>
): React.ComponentType<z.infer<Props>>
```

### page

Creates a Next.js page with automatic cache management.

```typescript
import { z } from "zod"

function page<Params extends z.ZodType, Ctx extends ApiContext>(
  config: {
    params: Params
    component: (ctx: Ctx, params: z.infer<Params>) => React.ReactNode
    fallback?: React.ReactNode
  }
): React.ComponentType<z.infer<Params>>

// params contains both route params and search params
// { route: { id: "123" }, search: { tab: "details" } }
```

### layout

Creates a Next.js layout with automatic cache management.

```typescript
import { z } from "zod"

function layout<Props extends z.ZodType, Ctx extends ApiContext>(
  config: {
    props: Props
    component: (ctx: Ctx, props: z.infer<Props>, children: React.ReactNode) => React.ReactNode
  }
): React.ComponentType<z.infer<Props>>
```

### serverComponent

Marks a component as a server component (no client-side cache).

```typescript
import { z } from "zod"

function serverComponent<Props extends z.ZodType>(
  config: {
    props: Props
    component: (props: z.infer<Props>) => React.ReactNode
  }
): React.ComponentType<z.infer<Props>>
```

### ApiContext

```typescript
type ApiContext = {
  api: API
}
```

The API methods return a result with `.match()` for rendering:

```typescript
ctx.api.tasks.list().match({
  isLoading: () => <Loading />,
  isStale: (data) => <StaleData data={data} />,
  isSuccess: (data) => <Data data={data} />,
  isError: (error) => <Error message={error.message} />,
})
```

The API methods automatically handle cache registration and invalidation.

## Usage Examples

### Basic Usage

```tsx
// app/tasks/[id]/page.tsx
import { page } from "@deessejs/server/next"
import { TaskDetail } from "./TaskDetail"

export const Page = page({
  params: z.object({
    route: z.object({
      id: z.string()
    }),
    search: z.object({
      tab: z.enum(["details", "history"]).optional()
    })
  }),
  component: (ctx, params) => {
    // params.route = { id: "123" }
    // params.search = { tab: "details" }
    return <TaskDetail id={params.route.id} tab={params.search.tab} />
  }
})
```

```tsx
// app/TaskList.tsx (Client Component)
"use client"

import { clientComponent } from "@deessejs/server/next"

export const TaskList = clientComponent({
  props: z.object({}),
  component: (ctx) => {
    return ctx.api.tasks.list().match({
      isLoading: () => <Loading />,
      isError: (error) => <Error message={error.message} />,
      isSuccess: (data) => data.match({
        empty: () => <EmptyState message="No tasks yet" />,
        nonempty: () => (
          <ul>
            {data.map(task => (
              <li key={task.id}>{task.title}</li>
            ))}
          </ul>
        ),
      }),
    })
  }
})
```

```tsx
// app/CreateTask.tsx (Client Component)
"use client"

import { clientComponent } from "@deessejs/server/next"
import { z } from "zod"

const CreateTask = clientComponent({
  props: z.object({
    onSuccess: z.function().optional()
  }),
  component: (ctx, props) => {
    const handleSubmit = async () => {
      await ctx.api.tasks.create({ title: "New task" })
      // Cache is automatically invalidated, related queries will refetch
      props.onSuccess?.()
    }

    return (
      <form onSubmit={handleSubmit}>
        <input name="title" />
        <button type="submit">Create</button>
      </form>
    )
  }
})
```

### How It Works

1. **Query Registration** - When `ctx.api.tasks.list()` is called (or any API method), it registers the cache key with the shared cache context

2. **Mutation Detection** - When `ctx.api.tasks.create()` is called, it automatically invalidates related cache keys

3. **Automatic Refetch** - Components that registered matching cache keys are automatically re-rendered with fresh data

### With Cache Keys

Cache keys are automatically handled by the API from `@deessejs/server`. No manual key management needed.

```tsx
// Component that queries a specific task
const TaskDetail = clientComponent({
  props: z.object({ taskId: z.number() }),
  component: (ctx, props) => {
    const { data } = ctx.api.tasks.get({ id: props.taskId })
    return <TaskDetail task={data} />
  }
})

// Component that creates a task
const CreateTask = clientComponent({
  props: z.object({}),
  component: (ctx) => {
    const handleCreate = async () => {
      await ctx.api.tasks.create({ title: "New task" })
      // Automatically invalidates related cache keys:
      // - ["tasks", "list"]
      // - ["tasks", { id: ... }]
    })
    return <button onClick={mutate}>Create Task</button>
  }
})
```

### Optimistic Updates

```tsx
const EditTask = clientComponent({
  props: z.object({ taskId: z.number() }),
  component: (ctx, props) => {
    const handleSave = async (data) => {
      // Optimistic update handled automatically
      await ctx.api.tasks.update({ id: props.taskId, data })
    }

    return <TaskEditor onSave={handleSave} />
  }
})
```

For more complex optimistic updates, the API returns result data directly.

### With Loading States

```tsx
const TaskList = clientComponent({
  props: z.object({}),
  fallback: <Skeleton />,
  component: (ctx) => {
    return ctx.api.tasks.list().match({
      isLoading: () => <Skeleton />,
      isStale: (data) => (
        <div>
          <Badge>Refetching...</Badge>
          <TaskItems tasks={data} />
        </div>
      ),
      isSuccess: (data) => <TaskItems tasks={data} />,
      isError: (error) => <Error message={error.message} />,
    })
  }
})
```

### Error Handling

```tsx
const TaskList = clientComponent({
  props: z.object({}),
  fallback: <ErrorBoundary><TaskList /></ErrorBoundary>,
  component: (ctx) => {
    return ctx.api.tasks.list().match({
      isLoading: () => <Loading />,
      isError: (error) => <div>Error: {error.message}</div>,
      isSuccess: (data) => <TaskItems tasks={data} />,
    })
  }
})
```

## Setup

### Create Route Handler

Expose your public API via HTTP:

```typescript
// app/(deesse)/api/[...slug]/route.ts
import { createRouteHandler } from "@deessejs/server/next"
import { clientApi } from "@/server/api"

export const POST = createRouteHandler(clientApi)
```

This route handler:
- Only exposes `query` and `mutation` operations
- Does NOT expose `internalQuery` and `internalMutation`
- Provides type-safe HTTP endpoints

### With better-auth

You can combine multiple route handlers in the same route group:

```typescript
// app/(deesse)/api/[...slug]/route.ts - @deessejs/server
import { createRouteHandler } from "@deessejs/server/next"
import { clientApi } from "@/server/api"

export const POST = createRouteHandler(clientApi)
```

```typescript
// app/(deesse)/api/[...route]/route.ts - better-auth
import { auth } from "@/lib/auth"
import { toNextJsHandler } from "better-auth/next-js"

export const { POST, GET } = toNextJsHandler(auth)
```

### Call from Client

```typescript
// Call public operations from client
const response = await fetch("/api/users.get", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ args: { id: 123 } }),
})

const result = await response.json()
```

### Client-Safe API (Recommended)

For TypeScript safety, create a separate client API that only exposes public operations. This prevents accidentally calling internal operations from client code:

```typescript
// server/api.ts
import { defineContext, createAPI, createPublicAPI } from "@deessejs/server"

const { t, createAPI } = defineContext({
  context: { db: myDatabase },
})

// Public operations
const getUser = t.query({ ... })
const createUser = t.mutation({ ... })

// Internal operations (server-only)
const deleteUser = t.internalMutation({ ... })
const getAdminStats = t.internalQuery({ ... })

// Full API for server usage
const api = createAPI({
  router: t.router({
    users: t.router({
      get: getUser,
      create: createUser,
      delete: deleteUser,
      getAdminStats: getAdminStats,
    }),
  }),
})

// Client-safe API (only public operations)
const clientApi = createPublicAPI(api)

export { api, clientApi }
```

### Usage: Server vs Client

**Server Components** - Use full `api`:

```typescript
// app/admin/page.tsx (Server Component)
import { api } from "@/server/api"

export default async function AdminPage() {
  // Can call ALL operations
  const users = await api.users.get({})
  const stats = await api.users.getAdminStats({})   // ✅ Works
  await api.users.delete({ id: 1 })                 // ✅ Works

  return <Dashboard stats={stats} />
}
```

**Client Components** - Use `clientApi`:

```typescript
// app/components/UserList.tsx (Client Component)
"use client"
import { clientApi } from "@/server/api"

export function UserList() {
  // Can only call PUBLIC operations
  const users = await clientApi.users.get({})        // ✅ Works
  await clientApi.users.create({ name: "John" })     // ✅ Works

  // TypeScript error - these don't exist on clientApi!
  const stats = await clientApi.users.getAdminStats({})  // ❌ TS Error
  await clientApi.users.delete({ id: 1 })               // ❌ TS Error
}
```

### Call from Server

```typescript
// Call from server components or server actions
import { api } from "@/server/api"

export default async function Page() {
  // Public operations
  const users = await api.users.list({})

  // Internal operations (not exposed via HTTP)
  const stats = await api.users.getAdminStats({})

  return <Dashboard users={users} stats={stats} />
}
```

No Provider needed. The API is automatically available in all components.

```tsx
// app/layout.tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        {children}
      </body>
    </html>
  )
}
```

### With Server-Side Rendering

```tsx
// app/tasks/page.tsx
import { clientComponent } from "@deessejs/server/next"
import { dehydrate, HydrationBoundary } from "@deessejs/server/next"
import { TaskList } from "./TaskList"

export default async function TasksPage() {
  const queryClient = new QueryClient()

  // Prefetch on server
  await queryClient.prefetchQuery({
    queryKey: ["tasks", "list"],
    queryFn: () => api.tasks.list()
  })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <TaskList />
    </HydrationBoundary>
  )
}
```

## Caveats & Considerations

### Server vs Client Components

- Use `clientComponent()` for Client Components (`"use client"`)
- Use `page()`, `layout()`, or `serverComponent()` for Server Components
- Prefetch data in Server Components and pass via `HydrationBoundary`

### Performance

- Avoid over-subscribing - Only query the data you need
- Use specific cache keys to avoid unnecessary refetches
- Consider using `refetchOnWindowFocus: false` for frequently updated data

### Mental Model

This is **not** a real-time subscription system. It's a cache invalidation system:

```
WRONG:  Component A sees Component B's mutation instantly via WebSocket
RIGHT:  Component A's query is invalidated and refetched after Component B's mutation
```

### When to Use

- Dashboard-like pages with multiple components
- Forms that need to refresh lists after submission
- Lists that need to stay in sync

### When NOT to Use

- Real-time requirements (use WebSockets instead)
- Highly interactive applications (consider SWR/TanStack Query directly)
- Server Components (use standard data fetching)

## Future Considerations

- Suspense integration
- Server Actions integration
- Middleware for auth
- Parallel queries
- Infinite queries
