<p align="center">
  <img src="public/banner.jpg" alt="nesalia Logo" width="100%">
</p>

<h1 align="center">@deessejs/server</h1>

<p align="center">
  <a href="https://www.npmjs.com/package/@deessejs/server">
    <img src="https://img.shields.io/npm/v/@deessejs/server" alt="npm Version">
  </a>
  <a href="https://www.npmjs.com/package/@deessejs/server">
    <img src="https://img.shields.io/bundlejs/size/@deessejs/server" alt="Bundle Size">
  </a>
  <a href="https://github.com/nesalia-inc/server/actions">
    <img src="https://img.shields.io/github/actions/workflow/status/nesalia-inc/server/test?label=tests" alt="Tests">
  </a>
  <a href="https://github.com/nesalia-inc/server/actions">
    <img src="https://img.shields.io/badge/coverage-100%25-brightgreen" alt="Coverage">
  </a>
  <a href="https://github.com/nesalia-inc/server/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/nesalia-inc/server" alt="License">
  </a>
</p>

> A type-safe API layer for Next.js with queries, mutations, and cache invalidation.

## Requirements

- TypeScript 5.0+
- Node.js 20+

## Installation

```bash
# Install server
npm install @deessejs/server

# Or using pnpm
pnpm add @deessejs/server

# Or using yarn
yarn add @deessejs/server
```

## Quick Start

```typescript
import { defineContext, createAPI } from '@deessejs/server'

// Define context
const { t, createAPI } = defineContext({
  context: {
    db: myDatabase,
  },
})

// Define queries
const getUser = t.query({
  args: z.object({ id: z.number() }),
  handler: async (ctx, args) => {
    const user = await ctx.db.users.find(args.id)
    return ok(user, { keys: [['users', { id: args.id }]] })
  }
})

// Define mutations
const createUser = t.mutation({
  args: z.object({ name: z.string(), email: z.string().email() }),
  handler: async (ctx, args) => {
    const user = await ctx.db.users.create(args)
    return ok(user, { invalidate: ['users:list'] })
  }
})

// Create API
const api = createAPI({
  router: t.router({
    users: t.router({
      get: getUser,
      create: createUser,
    }),
  }),
})

export { api }
```

## Features

- **Type-safe** - Full TypeScript inference for queries and mutations
- **Queries & Mutations** - Define typed API operations
- **Internal Operations** - Server-only queries and mutations
- **Cache System** - Built-in cache with keys and invalidation
- **Plugin System** - Extend context and add routes
- **Event System** - Emit and listen to events

## Security Model

Server Actions in Next.js are exposed via HTTP and can be called by anyone. This package solves this by separating:

- **`query` / `mutation`** - Public operations, exposed via HTTP
- **`internalQuery` / `internalMutation`** - Internal operations, server-only

```typescript
// Public - exposed via HTTP
const getUser = t.query({ ... })
const createUser = t.mutation({ ... })

// Internal - only callable from server
const deleteUser = t.internalMutation({ ... })
const getAdminStats = t.internalQuery({ ... })
```

## Client-Safe API

Create a separate API that only exposes public operations:

```typescript
import { createPublicAPI } from '@deessejs/server'

const clientApi = createPublicAPI(api)

// Server: api.users.delete() - Works
// Client: clientApi.users.delete() - TypeScript Error!
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Author

- **Nesalia Inc.**

## Support

If you discover any security vulnerabilities, please send an e-mail to support@nesalia.com.

## License

MIT License - see the [LICENSE](LICENSE) file for details.
