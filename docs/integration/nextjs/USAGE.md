# Usage Patterns

## Server vs Client API

### Server Components

Use the full `drpc` API to access all operations including internal ones:

```typescript
// app/admin/page.tsx (Server Component)
import { drpc } from "@/server/drpc"

export default async function AdminPage() {
  // Can call ALL operations
  const user = await drpc.users.get({ id: 1 })
  const users = await drpc.users.list({ limit: 10 })
  const stats = await drpc.users.getAdminStats({})  // ✅ Internal works
  await drpc.users.delete({ id: 1 })                  // ✅ Internal works

  return <Dashboard stats={stats} />
}
```

### Client Components

Use the `client` API for public operations only:

```typescript
// app/components/UserList.tsx (Client Component)
"use client"
import { client } from "@/server/drpc"

export function UserList() {
  // Can only call PUBLIC operations
  const user = await client.users.get({ id: 1 })       // ✅ Works
  await client.users.create({ name: "John" })           // ✅ Works
  await client.users.update({ id: 1, name: "Jane" })   // ✅ Works
  await client.users.delete({ id: 1 })                  // ✅ Works

  // TypeScript error - internal operations not available
  const stats = await client.users.getAdminStats({})     // ❌ TS Error
  await client.users.deleteUserAdmin({ id: 1, reason: "spam" }) // ❌ TS Error
}
```

## With Authentication

You can combine multiple route handlers in the same Next.js application:

```typescript
// app/api/auth/[...route]/route.ts - better-auth
import { auth } from "@/lib/auth"
import { toNextJsHandler } from "better-auth/next-js"

export const { POST, GET } = toNextJsHandler(auth)
```

```typescript
// app/api/drpc/route.ts - drpc
import { client } from "@/server/drpc"
import { toNextJsHandler } from "@deessejs/drpc-next"

export const { POST, GET } = toNextJsHandler(client)
```

## CRUD Examples

### List with Pagination

```typescript
// Query
const users = await client.users.list({
  limit: 10,
  offset: 0,
})

if (users.ok) {
  console.log(users.value) // { items: [...], total: 100 }
}
```

### Get Single Resource

```typescript
// Query
const user = await client.users.get({ id: 1 })

if (user.ok) {
  console.log(user.value.name) // "John"
} else {
  console.error(user.error.message) // "User not found"
}
```

### Create Resource

```typescript
// Mutation
const result = await client.users.create({
  name: "John",
  email: "john@example.com",
})

if (result.ok) {
  console.log(result.value.id) // 123
}
```

### Update Resource

```typescript
// Mutation
const result = await client.users.update({
  id: 1,
  name: "Jane",
})

if (result.ok) {
  console.log(result.value.name) // "Jane"
}
```

### Delete Resource

```typescript
// Mutation
const result = await client.users.delete({ id: 1 })

if (result.ok) {
  console.log(result.value.success) // true
}
```

### Search

```typescript
// Query
const users = await client.users.search({
  query: "john",
  limit: 5,
})

if (users.ok) {
  console.log(users.value) // [...]
}
```

## Error Handling

```typescript
const result = await client.users.create({
  email: "invalid-email",
})

if (!result.ok) {
  switch (result.error.code) {
    case "VALIDATION_ERROR":
      console.log("Invalid input")
      break
    case "DUPLICATE":
      console.log("Email already exists")
      break
    default:
      console.log("Unknown error")
  }
}
```

## See Also

- [SETUP.md](./SETUP.md) - Complete setup guide
- [API.md](./API.md) - API reference
- [SECURITY.md](./SECURITY.md) - Security best practices
