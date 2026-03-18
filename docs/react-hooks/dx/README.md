# Developer Experience (DX)

This folder contains examples showing how developers would use `@deessejs/server/react` in real applications.

## Files

| File | Description |
|------|-------------|
| [`QUICK_START.md`](QUICK_START.md) | Get started in 5 minutes |
| [`CRUD_EXAMPLES.md`](CRUD_EXAMPLES.md) | Complete CRUD examples |
| [`COMPARISON.md`](COMPARISON.md) | Without vs With Magic |

## Advanced Patterns

Real-world patterns for complex applications.

See [`advanced/`](advanced/) folder:

| File | Description |
|------|-------------|
| [`advanced/DEPENDENT_QUERIES.md`](advanced/DEPENDENT_QUERIES.md) | Run queries based on other query results |
| [`advanced/PAGINATION.md`](advanced/PAGINATION.md) | Handle paginated data |
| [`advanced/OPTIMISTIC_UPDATES.md`](advanced/OPTIMISTIC_UPDATES.md) | Instant UI updates with rollback |
| [`advanced/PREFETCHING.md`](advanced/PREFETCHING.md) | Load data before needed |
| [`advanced/ERROR_HANDLING.md`](advanced/ERROR_HANDLING.md) | Handle typed errors from server |
| [`advanced/LOADING_STATES.md`](advanced/LOADING_STATES.md) | Different loading states |

## Quick Example

```tsx
// Setup
<QueryClientProvider client={queryClient} api={client}>
  {children}
</QueryClientProvider>

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
