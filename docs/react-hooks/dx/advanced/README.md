# Advanced Patterns

Real-world patterns for complex applications.

## Files

| File | Description |
|------|-------------|
| [`DEPENDENT_QUERIES.md`](DEPENDENT_QUERIES.md) | Run queries based on other query results |
| [`PAGINATION.md`](PAGINATION.md) | Handle paginated data |
| [`OPTIMISTIC_UPDATES.md`](OPTIMISTIC_UPDATES.md) | Instant UI updates with rollback |
| [`PREFETCHING.md`](PREFETCHING.md) | Load data before needed |
| [`ERROR_HANDLING.md`](ERROR_HANDLING.md) | Handle typed errors from server |
| [`LOADING_STATES.md`](LOADING_STATES.md) | Different loading states |

## Quick Overview

### Dependent Queries
```tsx
const { data: user } = useQuery(client.users.get, { args: { id: userId } })
const { data: posts } = useQuery(client.posts.byUser, { args: { userId }, enabled: !!user })
```

### Pagination
```tsx
const [page, setPage] = useState(1)
const { data } = useQuery(client.users.list, { args: { page, limit: 10 } })
```

### Optimistic Updates
```tsx
const { mutate } = useMutation(client.posts.like, {
  onMutate: async () => { /* update cache */ },
  onError: (err, vars, context) => { /* rollback */ }
})
```

### Prefetching
```tsx
queryClient.prefetchQuery(client.users.get, { args: { id: userId } })
```

## When to Use Each

- **Dependent Queries**: When data depends on other data
- **Pagination**: When lists can be large
- **Optimistic Updates**: When instant feedback matters
- **Prefetching**: When you can predict user actions
- **Error Handling**: Always - for graceful failures
- **Loading States**: Always - for good UX
