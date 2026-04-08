# CRUD Examples

Complete examples for common CRUD operations using the magic wrapper.

## User Management

### Server Definition

```typescript
// server/api/users.ts
import { z } from "zod"

const getUsers = t.query({
  args: z.object({
    page: z.number().default(1),
    limit: z.number().default(10)
  }),
  handler: async (ctx, args) => {
    const users = await ctx.db.users.findMany({
      skip: (args.page - 1) * args.limit,
      take: args.limit,
      orderBy: { createdAt: 'desc' }
    })

    return ok(users, {
      keys: [["users", "list", { page: args.page, limit: args.limit }]]
    })
  }
})

const getUser = t.query({
  args: z.object({
    id: z.number()
  }),
  handler: async (ctx, args) => {
    const user = await ctx.db.users.findUnique({ where: { id: args.id } })
    if (!user) return err({ code: "NOT_FOUND", message: "User not found" })

    return ok(user, {
      keys: [["users", { id: args.id }]]
    })
  }
})

const createUser = t.mutation({
  args: z.object({
    name: z.string().min(2),
    email: z.string().email()
  }),
  handler: async (ctx, args) => {
    const user = await ctx.db.users.create(args)
    return ok(user, {
      invalidate: [["users", "list"]]
    })
  }
})

const updateUser = t.mutation({
  args: z.object({
    id: z.number(),
    name: z.string().optional(),
    email: z.string().email().optional()
  }),
  handler: async (ctx, args) => {
    const user = await ctx.db.users.update({
      where: { id: args.id },
      data: args,
    })
    return ok(user, {
      invalidate: [
        ["users", { id: args.id }],
        ["users", "list"]
      ]
    })
  }
})

const deleteUser = t.mutation({
  args: z.object({
    id: z.number()
  }),
  handler: async (ctx, args) => {
    await ctx.db.users.delete({ where: { id: args.id } })
    return ok({ success: true }, {
      invalidate: [
        ["users", { id: args.id }],
        ["users", "list"]
      ]
    })
  }
})
```

### Client Usage

```tsx
// components/UserList.tsx
"use client"
import { useQuery } from "@deessejs/server/react"
import { client } from "@/server/api"

export function UserList() {
  // Automatic caching - no config needed
  const { data, isLoading } = useQuery(client.users.list, {
    args: { limit: 20 }
  })

  if (isLoading) return <Skeleton />

  return (
    <ul>
      {data.map(user => (
        <UserItem key={user.id} user={user} />
      ))}
    </ul>
  )
}
```

```tsx
// components/UserDetail.tsx
"use client"
import { useQuery } from "@deessejs/server/react"
import { client } from "@/server/api"

export function UserDetail({ userId }: { userId: number }) {
  const { data: user, isLoading } = useQuery(client.users.get, {
    args: { id: userId }
  })

  if (isLoading) return <Skeleton />

  return <div>{user.name}</div>
}
```

```tsx
// components/UserForm.tsx
"use client"
import { useState } from "react"
import { useMutation } from "@deessejs/server/react"
import { client } from "@/server/api"

export function CreateUserForm() {
  const [form, setForm] = useState({ name: "", email: "" })

  // Mutation with automatic list invalidation
  const { mutate, isPending } = useMutation(client.users.create)

  const handleSubmit = (e) => {
    e.preventDefault()
    mutate(form)
    // List automatically refetches!
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        value={form.name}
        onChange={e => setForm({ ...form, name: e.target.value })}
        placeholder="Name"
      />
      <input
        value={form.email}
        onChange={e => setForm({ ...form, email: e.target.value })}
        placeholder="Email"
      />
      <button type="submit" disabled={isPending}>
        {isPending ? "Creating..." : "Create"}
      </button>
    </form>
  )
}
```

```tsx
// components/EditUser.tsx
"use client"
import { useMutation } from "@deessejs/server/react"
import { client } from "@/server/api"

export function EditUserButton({ userId }: { userId: number }) {
  const { mutate: updateUser } = useMutation(client.users.update)

  const handleClick = () => {
    updateUser({ id: userId, name: "New Name" })
    // Both detail AND list automatically refetch!
  }

  return <button onClick={handleClick}>Update</button>
}
```

```tsx
// components/DeleteUser.tsx
"use client"
import { useMutation } from "@deessejs/server/react"
import { client } from "@/server/api"

export function DeleteUserButton({ userId }: { userId: number }) {
  const { mutate: deleteUser } = useMutation(client.users.delete)

  const handleClick = () => {
    if (confirm("Delete user?")) {
      deleteUser({ id: userId })
      // Automatically removed from list!
    }
  }

  return <button onClick={handleClick}>Delete</button>
}
```

## Blog Posts

### Server Definition

```typescript
// server/api/posts.ts
import { z } from "zod"

const listPosts = t.query({
  args: z.object({
    status: z.enum(["draft", "published"]).optional(),
    limit: z.number().default(10)
  }),
  handler: async (ctx, args) => {
    const posts = await ctx.db.posts.findMany({
      where: args.status ? { status: args.status } : undefined,
      take: args.limit,
      orderBy: { createdAt: 'desc' }
    })

    return ok(posts, {
      keys: [["posts", "list", { status: args.status, limit: args.limit }]]
    })
  }
})

const getPost = t.query({
  args: z.object({
    slug: z.string()
  }),
  handler: async (ctx, args) => {
    const post = await ctx.db.posts.findUnique({
      where: { slug: args.slug }
    })
    if (!post) return err({ code: "NOT_FOUND", message: "Post not found" })

    return ok(post, {
      keys: [["posts", { slug: args.slug }]]
    })
  }
})

const createPost = t.mutation({
  args: z.object({
    title: z.string(),
    content: z.string(),
    status: z.enum(["draft", "published"]).default("draft")
  }),
  handler: async (ctx, args) => {
    const post = await ctx.db.posts.create({
      data: {
        ...args,
        slug: args.title.toLowerCase().replace(/\s+/g, "-")
      }
    })
    return ok(post, {
      invalidate: [["posts", "list"]]
    })
  }
})

const publishPost = t.mutation({
  args: z.object({
    id: z.number()
  }),
  handler: async (ctx, args) => {
    const post = await ctx.db.posts.update({
      where: { id: args.id },
      data: { status: "published" }
    })
    return ok(post, {
      invalidate: [
        ["posts", { id: args.id }],
        ["posts", "list"]
      ]
    })
  }
})
```

### Client Usage

```tsx
// components/PostList.tsx
"use client"
import { useQuery } from "@deessejs/server/react"
import { client } from "@/server/api"

export function PostList({ status }: { status?: "draft" | "published" }) {
  // Filter + pagination - all automatic
  const { data, isLoading } = useQuery(client.posts.list, {
    args: { status, limit: 20 }
  })

  return (
    <div>
      {data?.map(post => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  )
}
```

```tsx
// components/PostEditor.tsx
"use client"
import { useState } from "react"
import { useMutation } from "@deessejs/server/react"
import { client } from "@/server/api"

export function PostEditor() {
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")

  const { mutate: createPost } = useMutation(client.posts.create)

  const handlePublish = () => {
    createPost({ title, content, status: "published" })
    // List automatically refetches!
  }

  const handleSaveDraft = () => {
    createPost({ title, content, status: "draft" })
    // List automatically refetches!
  }

  return (
    <div>
      <input value={title} onChange={e => setTitle(e.target.value)} />
      <textarea value={content} onChange={e => setContent(e.target.value)} />
      <button onClick={handleSaveDraft}>Save Draft</button>
      <button onClick={handlePublish}>Publish</button>
    </div>
  )
}
```

## What's Happening

| Client Action | Server Response | Automatic Result |
|--------------|----------------|------------------|
| `useQuery(client.users.list)` | Returns `keys: [["users", "list"]]` | Cached |
| `useMutation(client.users.create)` | Returns `invalidate: [["users", "list"]]` | List refetches |
| `useMutation(client.users.update)` | Returns `invalidate: [[...], [...]]` | Detail + list refetch |

No configuration needed - the server drives everything!

## Mutation Callbacks

Even though invalidation is automatic, you often need to run code after a mutation completes.

### Basic Callbacks

```tsx
// components/CreateUser.tsx
"use client"
import { useMutation } from "@deessejs/server/react"
import { client } from "@/server/api"

export function CreateUserForm() {
  const { mutate } = useMutation(client.users.create, {
    onSuccess: (data) => {
      console.log("User created:", data.id)
      // Navigation, toast, etc.
    },
    onError: (error) => {
      console.error("Failed:", error.message)
    }
  })

  return <form onSubmit={() => mutate({ name: "John", email: "john@example.com" })}>
    <button>Create</button>
  </form>
}
```

### Callbacks with Navigation

```tsx
// components/EditUser.tsx
"use client"
import { useMutation } from "@deessejs/server/react"
import { useRouter } from "next/navigation"
import { client } from "@/server/api"

export function EditUserForm({ userId }: { userId: number }) {
  const router = useRouter()

  const { mutate } = useMutation(client.users.update, {
    onSuccess: () => {
      router.push("/users")  // Navigate after success
    }
  })

  return <form onSubmit={() => mutate({ id: userId, name: "New Name" })}>
    <button>Save</button>
  </form>
}
```

### Callbacks with Typed Errors

```tsx
// components/RegisterForm.tsx
"use client"
import { useState } from "react"
import { useMutation } from "@deessejs/server/react"
import { client } from "@/server/api"

export function RegisterForm() {
  const [error, setError] = useState<string | null>(null)

  const { mutate, isPending } = useMutation(client.users.create, {
    onError: (err) => {
      // err is typed from server - can check error.code
      if (err.code === "DUPLICATE_EMAIL") {
        setError("Email already exists")
      } else if (err.code === "VALIDATION_ERROR") {
        setError("Invalid input")
      } else {
        setError("Something went wrong")
      }
    }
  })

  return (
    <form onSubmit={() => mutate({ name: "John", email: "test@example.com" })}>
      {error && <div className="error">{error}</div>}
      <button disabled={isPending}>Register</button>
    </form>
  )
}
```

### Callback Options Summary

| Option | Description |
|--------|-------------|
| `onSuccess` | Called when mutation succeeds |
| `onError` | Called when mutation fails (typed!) |
| `onSettled` | Called whether success or error |

All callbacks have access to:
- `data` - The returned data from server
- `variables` - What was passed to mutate
- `context` - Any context from `onMutate`
