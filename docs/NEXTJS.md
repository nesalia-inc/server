# Next.js Integration Specification

## Overview

`@deessejs/server/next` provides a higher-level integration for Next.js that enables automatic cache revalidation across components. When one component mutates data, other components that query that data are automatically refetched.

## Imports

```typescript
import { page, layout, serverComponent, clientComponent, Provider } from "@deessejs/server/next"
```

## Core Concept

- **`clientComponent`** - Wraps a component with automatic cache management
- **`page`** - Creates a Next.js page with cache management
- **`layout`** - Creates a Next.js layout with cache management
- **`serverComponent`** - Marks a component as server component
- **`Provider`** - Provides API context to child components
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
function page<Props, Ctx extends ApiContext>(
  config: {
    component: (ctx: Ctx, props: Props) => React.ReactNode
    fallback?: React.ReactNode
  }
): React.ComponentType<Props>
```

### layout

Creates a Next.js layout with automatic cache management.

```typescript
function layout<Props, Ctx extends ApiContext>(
  config: {
    component: (ctx: Ctx, props: Props) => React.ReactNode
    children?: React.ReactNode
  }
): React.ComponentType<Props>
```

### serverComponent

Marks a component as a server component with optional data prefetching.

```typescript
function serverComponent<Props, Data>(
  config: {
    component: (props: Props) => React.ReactNode
    prefetch?: (props: Props) => Promise<Data>
  }
): React.ComponentType<Props>
```

### Provider

Provides API context to child components.

```typescript
type ProviderProps = {
  api: API
  children: React.ReactNode
}

function Provider(props: ProviderProps): React.ReactElement
```

### ApiContext

```typescript
type ApiContext = {
  api: API
}
```

The API methods automatically handle cache registration and invalidation.

## Usage Examples

### Basic Usage

```tsx
// app/page.tsx (Server Component)
import { clientComponent, Provider } from "@deessejs/server/next"
import { TaskList } from "./TaskList"
import { CreateTask } from "./CreateTask"

export default function Page() {
  return (
    <Provider api={api}>
      <CreateTask />
      <TaskList />
    </Provider>
  )
}
```

```tsx
// app/TaskList.tsx (Client Component)
"use client"

import { clientComponent, Provider } from "@deessejs/server/next"

export function TaskList() {
  return clientComponent({
    props: z.object({}),
    component: (ctx) => {
      const { data, isLoading } = ctx.api.tasks.list()

      if (isLoading) return <Loading />

      return (
        <ul>
          {data?.map(task => (
            <li key={task.id}>{task.title}</li>
          ))}
        </ul>
      )
    }
  })
}
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
    const { data, refetch, isStale } = ctx.api.tasks.list()

    return (
      <div>
        {isStale && <Badge>Refetching...</Badge>}
        <TaskList tasks={data} />
        <button onClick={() => refetch()}>Refresh</button>
      </div>
    )
  }
})
```

### Error Handling

```tsx
const TaskList = clientComponent({
  props: z.object({}),
  fallback: <ErrorBoundary><TaskList /></ErrorBoundary>,
  component: (ctx) => {
    const { data, error } = ctx.api.tasks.list()

    if (error) {
      return <div>Error: {error.message}</div>
    }

    return <TaskList tasks={data} />
  }
})
```

## Setup

### Provider

```tsx
// app/layout.tsx
import { clientComponent, Provider } from "@deessejs/server/next"
import { api } from "./api"

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <Provider api={api}>
          {children}
        </Provider>
      </body>
    </html>
  )
}
```

### With Server-Side Rendering

```tsx
// app/tasks/page.tsx
import { clientComponent, Provider } from "@deessejs/server/next"
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
    <Provider api={api}>
      <HydrationBoundary state={dehydrate(queryClient)}>
        <TaskList />
      </HydrationBoundary>
    </Provider>
  )
}
```

## Caveats & Considerations

### Server vs Client Components

- Only use `clientComponent()` in Client Components (`"use client"`)
- Use `<Provider>` in Server Components
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
