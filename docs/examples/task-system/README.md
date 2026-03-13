# Task System Example

This example demonstrates a complete task management system using `@deessejs/server`.

## Project Structure

```
src/
├── api/
│   ├── tasks/
│   │   ├── list.ts       # List tasks query
│   │   ├── get.ts        # Get single task query
│   │   ├── create.ts     # Create task mutation
│   │   ├── update.ts     # Update task mutation
│   │   └── delete.ts     # Delete task mutation
│   └── index.ts          # API exports
├── plugins/
│   └── logger.ts         # Logger plugin
├── extensions/
│   └── cache.ts         # Cache extension
└── context.ts           # Context definition
```

## 1. Define Context

```typescript
// src/context.ts
import { defineContext } from "@deessejs/server"
import { loggerPlugin } from "./plugins/logger"
import { cacheExtension } from "./extensions/cache"

type Context = {
  db: Database
  logger: Logger
  cache: Cache
}

const { t, createAPI } = defineContext({
  initialValues: {
    db: myDatabase,
    logger: console,
    cache: new MemoryCache(),
  },
  plugins: [loggerPlugin],
  events: {
    "task.created": { data: { id: number; title: string } },
    "task.updated": { data: { id: number; changes: Record<string, unknown> } },
    "task.deleted": { data: { id: number } },
  }
})

registerExtension(cacheExtension)

export { t, createAPI }
```

## 2. Define Queries

```typescript
// src/api/tasks/list.ts
import { ok, err, Result } from "@deessejs/core"
import { t } from "../../context"

const listTasks = t.query({
  args: z.object({
    limit: z.number().default(10),
    offset: z.number().default(0),
  }),
  handler: async (ctx, args) => {
    const tasks = await ctx.db.tasks.findMany({
      take: args.limit,
      skip: args.offset,
      orderBy: { createdAt: "desc" }
    })

    return ok(tasks, {
      keys: [
        ["tasks", "list", { limit: args.limit, offset: args.offset }],
        ["tasks", "count"]
      ]
    })
  }
})

export { listTasks }
```

```typescript
// src/api/tasks/get.ts
import { ok, err, Result } from "@deessejs/core"
import { t } from "../../context"

const getTask = t.query({
  args: z.object({
    id: z.number()
  }),
  handler: async (ctx, args) => {
    const task = await ctx.db.tasks.findUnique({
      where: { id: args.id }
    })

    if (!task) {
      return err({ code: "NOT_FOUND", message: "Task not found" })
    }

    return ok(task, {
      keys: [["tasks", { id: args.id }]]
    })
  }
})

export { getTask }
```

## 3. Define Mutations

```typescript
// src/api/tasks/create.ts
import { ok, err, Result } from "@deessejs/core"
import { t } from "../../context"

const createTask = t.mutation({
  args: z.object({
    title: z.string().min(1),
    description: z.string().optional(),
  }),
  handler: async (ctx, args) => {
    const task = await ctx.db.tasks.create({
      data: {
        title: args.title,
        description: args.description,
      }
    })

    ctx.send("task.created", { id: task.id, title: task.title })

    return ok(task, {
      invalidate: [
        ["tasks", "list"],
        ["tasks", "count"]
      ]
    })
  }
})

export { createTask }
```

```typescript
// src/api/tasks/update.ts
import { ok, err, Result } from "@deessejs/core"
import { t } from "../../context"

const updateTask = t.mutation({
  args: z.object({
    id: z.number(),
    title: z.string().min(1).optional(),
    completed: z.boolean().optional(),
  }),
  handler: async (ctx, args) => {
    const existing = await ctx.db.tasks.findUnique({
      where: { id: args.id }
    })

    if (!existing) {
      return err({ code: "NOT_FOUND", message: "Task not found" })
    }

    const task = await ctx.db.tasks.update({
      where: { id: args.id },
      data: {
        ...(args.title && { title: args.title }),
        ...(args.completed !== undefined && { completed: args.completed }),
      }
    })

    ctx.send("task.updated", {
      id: task.id,
      changes: { title: args.title, completed: args.completed }
    })

    return ok(task, {
      invalidate: [
        ["tasks", { id: args.id }],
        ["tasks", "list"],
      ]
    })
  }
})

export { updateTask }
```

```typescript
// src/api/tasks/delete.ts
import { ok, err, Result } from "@deessejs/core"
import { t } from "../../context"

const deleteTask = t.mutation({
  args: z.object({
    id: z.number()
  }),
  handler: async (ctx, args) => {
    const existing = await ctx.db.tasks.findUnique({
      where: { id: args.id }
    })

    if (!existing) {
      return err({ code: "NOT_FOUND", message: "Task not found" })
    }

    await ctx.db.tasks.delete({
      where: { id: args.id }
    })

    ctx.send("task.deleted", { id: args.id })

    return ok(undefined, {
      invalidate: [
        ["tasks", { id: args.id }],
        ["tasks", "list"],
        ["tasks", "count"],
      ]
    })
  }
})

export { deleteTask }
```

## 4. Create API

```typescript
// src/api/index.ts
import { createAPI } from "../context"
import { listTasks } from "./tasks/list"
import { getTask } from "./tasks/get"
import { createTask } from "./tasks/create"
import { updateTask } from "./tasks/update"
import { deleteTask } from "./tasks/delete"

const api = createAPI({
  router: t.router({
    tasks: t.router({
      list: listTasks,
      get: getTask,
      create: createTask,
      update: updateTask,
      delete: deleteTask,
    }),
  }),
})

export { api }
```

## 5. Events & Listeners

```typescript
// src/events.ts
import { t } from "./context"

// Log task creation
t.on("task.created", async (ctx, args, event) => {
  ctx.logger.info("Task created", { taskId: event.data.id })
})

// Send notification on task update
t.on("task.updated", async (ctx, args, event) => {
  if (event.data.changes.completed === true) {
    await ctx.send("notification.send", {
      type: "task_completed",
      taskId: event.data.id,
    })
  }
})

// Audit log on deletion
t.on("task.deleted", async (ctx, args, event) => {
  await ctx.db.auditLog.create({
    action: "TASK_DELETED",
    resourceId: event.data.id,
    timestamp: new Date().toISOString(),
  })
})
```

## 6. Usage in Server Actions

```typescript
// app/actions.ts
"use server"

import { api } from "../api"

async function getTasks(limit = 10, offset = 0) {
  const result = await api.tasks.list({ limit, offset })

  return result.match({
    isSuccess: (data) => data,
    isError: (error) => { throw new Error(error.message) },
    isLoading: () => [],
    isStale: (data) => data,
  })
}

async function createTask(title: string) {
  const result = await api.tasks.create({ title })

  return result.match({
    isSuccess: (data) => data,
    isError: (error) => { throw new Error(error.message) },
    isLoading: () => null,
    isStale: (data) => data,
  })
}

async function toggleTaskComplete(id: number) {
  const task = await api.tasks.get({ id })

  return task.match({
    isSuccess: async (data) => {
      const result = await api.tasks.update({
        id,
        completed: !data.completed
      })
      return result.match({
        isSuccess: (t) => t,
        isError: (e) => { throw new Error(e.message) },
        isLoading: () => null,
        isStale: (t) => t,
      })
    },
    isError: (error) => { throw new Error(error.message) },
    isLoading: () => null,
    isStale: () => null,
  })
}
```

## 7. Next.js Integration

```tsx
// app/tasks/page.tsx
import { page } from "@deessejs/server/next"
import { TaskList } from "./TaskList"
import { CreateTask } from "./CreateTask"

export const Page = page({
  params: z.object({
    route: z.object({}),
    search: z.object({
      filter: z.enum(["all", "completed", "pending"]).default("all")
    })
  }),
  component: (ctx, params) => {
    return (
      <div>
        <h1>Tasks</h1>
        <CreateTask />
        <TaskList filter={params.search.filter} />
      </div>
    )
  }
})
```

```tsx
// app/tasks/TaskList.tsx
"use client"

import { clientComponent } from "@deessejs/server/next"

export const TaskList = clientComponent({
  props: z.object({
    filter: z.enum(["all", "completed", "pending"]).default("all")
  }),
  component: (ctx, props) => {
    const { data, refetch } = ctx.api.tasks.list({ limit: 50 })

    return data.match({
      isLoading: () => <Skeleton />,
      isError: (error) => <Error message={error.message} />,
      isSuccess: (seq) => seq.match({
        empty: () => <EmptyState />,
        nonempty: (tasks) => {
          const filtered = tasks.filter(t =>
            props.filter === "all" ||
            (props.filter === "completed" && t.completed) ||
            (props.filter === "pending" && !t.completed)
          )

          return (
            <ul>
              {filtered.map(task => (
                <TaskItem key={task.id} task={task} />
              ))}
            </ul>
          )
        },
      }),
      isStale: (seq) => seq.match({
        empty: () => <EmptyState stale />,
        nonempty: (tasks) => <StaleList tasks={tasks} />,
      }),
    })
  }
})
```

```tsx
// app/tasks/CreateTask.tsx
"use client"

import { clientComponent } from "@deessejs/server/next"

export const CreateTask = clientComponent({
  props: z.object({}),
  component: (ctx) => {
    const [title, setTitle] = useState("")

    const handleSubmit = async () => {
      await ctx.api.tasks.create({ title })
      setTitle("")
    }

    return (
      <form onSubmit={handleSubmit}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New task..."
        />
        <button type="submit">Add</button>
      </form>
    )
  }
})
```

## Summary

This example demonstrates:

1. **Context Definition** - Base context with plugins and events
2. **Queries** - `listTasks`, `getTask` with cache keys
3. **Mutations** - `createTask`, `updateTask`, `deleteTask` with invalidation
4. **Events** - Emit events on mutations, listen globally with `t.on()`
5. **Cache Keys** - Queries return keys, mutations return invalidate
6. **Next.js** - `page()` and `clientComponent()` with state machine rendering
7. **Plugins & Extensions** - Logger plugin, cache extension

The state machine pattern with `.match()` provides clean rendering:

```tsx
data.match({
  isLoading: () => <Loading />,
  isStale: (data) => data.match({
    empty: () => <StaleEmpty />,
    nonempty: (seq) => <StaleList items={seq} />,
  }),
  isSuccess: (data) => data.match({
    empty: () => <Empty />,
    nonempty: (seq) => <List items={seq} />,
  }),
  isError: (error) => <Error message={error.message} />,
})
```
