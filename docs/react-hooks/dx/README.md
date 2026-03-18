# Developer Experience (DX)

This folder contains examples showing how developers would use `@deessejs/server/react` in real applications.

## Files

| File | Description |
|------|-------------|
| [`QUICK_START.md`](QUICK_START.md) | Get started in 5 minutes |
| [`CRUD_EXAMPLES.md`](CRUD_EXAMPLES.md) | Complete CRUD examples |
| [`ADVANCED_PATTERNS.md`](ADVANCED_PATTERNS.md) | Complex use cases |
| [`COMPARISON.md`](COMPARISON.md) | Without vs With Magic |

## Quick Example

```tsx
// Setup
<MagicQueryClientProvider api={client}>
  {children}
</MagicQueryClientProvider>

// Usage - that's it!
const { data } = useQuery(client.users.list, { args: { limit: 10 } })
const { mutate } = useMutation(client.users.create)

// Mutation automatically refetches related queries!
```

## Philosophy

The magic wrapper aims to:
- **Zero configuration** - Just use the API
- **Server-driven** - Server defines caching behavior
- **Type safety** - Full TypeScript inference
- **Minimal boilerplate** - Less code, more functionality

## Learn More

- [Quick Start](QUICK_START.md)
- [CRUD Examples](CRUD_EXAMPLES.md)
- [Advanced Patterns](ADVANCED_PATTERNS.md)
- [Comparison](COMPARISON.md)
