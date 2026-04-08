# Error Handling

Handle errors gracefully with typed error codes from server.

## Server

```typescript
// server/api.ts
const createUser = t.mutation({
  args: z.object({
    name: z.string().min(2),
    email: z.string().email(),
  }),
  handler: async (ctx, args) => {
    const existing = await ctx.db.users.findUnique({
      where: { email: args.email }
    })

    if (existing) {
      return err({
        code: "DUPLICATE_EMAIL",
        message: "Email already exists",
        field: "email"
      })
    }

    const user = await ctx.db.users.create(args)
    return ok(user, {
      invalidate: [["users", "list"]]
    })
  }
})
```

## Client

```tsx
// CreateUser.tsx
"use client"
import { useState } from "react"
import { useMutation } from "@deessejs/server/react"
import { client } from "@/server/api"

export function CreateUserForm() {
  const [fieldError, setFieldError] = useState<string | null>(null)

  const { mutate, isPending } = useMutation(client.users.create, {
    onError: (err) => {
      if (err.code === "DUPLICATE_EMAIL") {
        setFieldError("Email already exists")
      } else {
        setFieldError("Failed to create user")
      }
    }
  })

  const handleSubmit = (data: { name: string; email: string }) => {
    setFieldError(null)
    mutate(data)
  }

  return (
    <form onSubmit={() => handleSubmit({ name: "John", email: "test@example.com" })}>
      {fieldError && <div className="error">{fieldError}</div>}
      <button type="submit" disabled={isPending}>
        Create
      </button>
    </form>
  )
}
```

## Error Types

The server can return typed errors:

```typescript
// Typed error codes
type ErrorCode =
  | "DUPLICATE_EMAIL"
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "VALIDATION_ERROR"

// With field information
err({
  code: "VALIDATION_ERROR",
  message: "Invalid input",
  field: "email" // Which field caused the error
})
```

## Global Error Handler

```tsx
// App.tsx
"use client"
import { useEffect } from "react"

export function App() {
  useEffect(() => {
    // Listen for query errors
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'fetchError') {
        console.error('Query failed:', event.query.queryKey, event.action.error)
      }
    })

    return unsubscribe
  }, [])

  return <YourApp />
}
```
