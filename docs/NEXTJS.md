# Next.js Integration Specification

## Overview

`@deessejs/server/next` provides a higher-level integration for Next.js that enables automatic cache revalidation across components. When one component mutates data, other components that query that data are automatically refetched.

## Core Concept

- **Client Component Wrapper** - `c.clientComponent()` wraps a component with automatic cache management
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

```typescript
type ClientComponentProps<Props, Ctx> = {
  props: Props
  component: (ctx: Ctx) => React.ReactNode
  fallback?: React.ReactNode
}

function clientComponent<Props, Ctx extends ApiContext>(
  config: ClientComponentProps<Props, Ctx>
): React.ComponentType<Props>
```

### ApiContext

```typescript
type ApiContext = {
  api: API
  query: <T>(key: CacheKey[], fn: () => Promise<T>) => UseQueryResult<T>
  mutate: <T>(fn: () => Promise<T>) => Promise<T>
}
```

## Usage Examples

### Basic Usage

```tsx
// app/page.tsx (Server Component)
import { c } from "@deessejs/server/next"
import { TaskList } from "./TaskList"
import { CreateTask } from "./CreateTask"

export default function Page() {
  return (
    <c.Provider api={api}>
      <CreateTask />
      <TaskList />
    </c.Provider>
  )
}
```

```tsx
// app/TaskList.tsx (Client Component)
"use client"

import { c } from "@deessejs/server/next"

export function TaskList() {
  return c.clientComponent({
    props: {},
    component: (ctx) => {
      const { data, isLoading } = ctx.query(["tasks", "list"], () =>
        ctx.api.tasks.list()
      )

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

import { c } from "@deessejs/server/next"

export function CreateTask() {
  const { mutate } = ctx.mutate(async () => {
    await ctx.api.tasks.create({ title: "New task" })
  })

  return (
    <form onSubmit={() => mutate()}>
      <input name="title" />
      <button type="submit">Create</button>
    </form>
  )
}
```

### How It Works

1. **Query Registration** - When `ctx.query()` is called, it registers the cache key with the shared cache context

2. **Mutation Detection** - When `ctx.mutate()` is called, it executes the mutation and automatically invalidates related cache keys

3. **Automatic Refetch** - Components that registered matching cache keys are automatically re-rendered with fresh data

### With Cache Keys

```tsx
// Component that queries a specific task
c.clientComponent({
  props: { taskId: number },
  component: (ctx, props) => {
    const { data } = ctx.query(["tasks", { id: props.taskId }], () =>
      ctx.api.tasks.get({ id: props.taskId })
    )
    return <TaskDetail task={data} />
  }
})

// Component that creates a task
c.clientComponent({
  props: {},
  component: (ctx) => {
    const { mutate } = ctx.mutate(async () => {
      await ctx.api.tasks.create({ title: "New task" })
      // Automatically invalidates:
      // - ["tasks", "list"]
      // - ["tasks", { id: ... }]
    })
    return <button onClick={mutate}>Create Task</button>
  }
})
```

### Optimistic Updates

```tsx
c.clientComponent({
  props: { taskId: number },
  component: (ctx, props) => {
    const { mutate, data } = ctx.mutate(async (optimisticData) => {
      // Optimistic update
      const result = await ctx.api.tasks.update({
        id: props.taskId,
        data: optimisticData
      })
      return result
    }, {
      onMutate: () => {
        // Cancel outgoing refetches
        // Snapshot current data
        // Set optimistic data
      },
      onError: (err, variables, context) => {
        // Rollback to snapshot
      },
      onSuccess: () => {
        // Data is already fresh
      }
    })

    return <TaskEditor task={data} onSave={mutate} />
  }
})
```

### With Loading States

```tsx
c.clientComponent({
  props: {},
  fallback: <Skeleton />,
  component: (ctx) => {
    const { data, refetch, isStale } = ctx.query(["tasks", "list"], () =>
      ctx.api.tasks.list()
    )

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
c.clientComponent({
  props: {},
  fallback: <ErrorBoundary><TaskList /></ErrorBoundary>,
  component: (ctx) => {
    const { data, error } = ctx.query(["tasks", "list"], () =>
      ctx.api.tasks.list()
    )

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
import { c } from "@deessejs/server/next"
import { api } from "./api"

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <c.Provider api={api}>
          {children}
        </c.Provider>
      </body>
    </html>
  )
}
```

### With Server-Side Rendering

```tsx
// app/tasks/page.tsx
import { c } from "@deessejs/server/next"
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
    <c.Provider api={api}>
      <HydrationBoundary state={dehydrate(queryClient)}>
        <TaskList />
      </HydrationBoundary>
    </c.Provider>
  )
}
```

## Caveats & Considerations

### Server vs Client Components

- Only use `c.clientComponent()` in Client Components (`"use client"`)
- Use `<c.Provider>` in Server Components
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
