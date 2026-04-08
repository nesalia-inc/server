# Pagination

Handle paginated data with automatic caching.

## Server

```typescript
// server/api.ts
const listUsers = t.query({
  args: z.object({
    page: z.number().default(1),
    limit: z.number().default(10),
  }),
  handler: async (ctx, args) => {
    const [users, total] = await Promise.all([
      ctx.db.users.findMany({
        skip: (args.page - 1) * args.limit,
        take: args.limit,
        orderBy: { createdAt: 'desc' }
      }),
      ctx.db.users.count()
    ])

    return ok({
      items: users,
      total,
      page: args.page,
      totalPages: Math.ceil(total / args.limit),
    }, {
      keys: [["users", "list", { page: args.page, limit: args.limit }]]
    })
  }
})
```

## Client

```tsx
// UserList.tsx
"use client"
import { useState } from "react"
import { useQuery } from "@deessejs/server/react"
import { client } from "@/server/api"

export function UserList() {
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery(client.users.list, {
    args: { page, limit: 10 }
  })

  return (
    <div>
      {isLoading ? (
        <Skeleton />
      ) : (
        <>
          {data.items.map(user => (
            <UserCard key={user.id} user={user} />
          ))}

          <div className="pagination">
            <button
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
            >
              Previous
            </button>
            <span>Page {data.page} of {data.totalPages}</span>
            <button
              disabled={page >= data.totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  )
}
```

## Response Format

The server should return a consistent structure:

```typescript
{
  items: User[],       // The data for this page
  total: number,      // Total count of all items
  page: number,       // Current page number
  totalPages: number  // Total number of pages
}
```

Each page is cached separately with its own keys.
