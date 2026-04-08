# React Hooks Features

This folder contains analysis and proposed implementations for `@deessejs/server/react` features, comparing with TanStack Query.

## Overview

[`analysis/TANSTACK_QUERY_ANALYSIS.md`](analysis/TANSTACK_QUERY_ANALYSIS.md) provides a comprehensive overview of TanStack Query features and what is currently implemented or missing in `@deessejs/server/react`.

## Directory Structure

```
react-hooks/
├── README.md                    # This file
│
├── analysis/                   # Analysis & comparisons
│   └── TANSTACK_QUERY_ANALYSIS.md
│
├── integration/                # TanStack Query magic wrapper
│   ├── MAGIC_WRAPPER.md        # High-level concept
│   ├── MAGIC_ARCHITECTURE.md   # Complete implementation
│   ├── DEEP_TANSTACK_INTEGRATION.md
│   ├── AUTO_INVALIDATION.md
│   └── CACHE_KEYS_EXTRACTION.md
│
└── features/                   # Proposed features
    ├── INFINITE_QUERIES.md
    ├── OPTIMISTIC_UPDATES.md
    ├── DEVTOOLS.md
    ├── CACHE_PERSISTENCE.md
    ├── BACKGROUND_REFETCH.md
    ├── PLACEHOLDER_DATA.md
    ├── MUTATION_STATE.md
    └── RETRY_LOGIC.md
```

## Magic Wrapper Architecture

The goal is to create a **transparent wrapper** on top of TanStack Query where the server automatically manages everything - no boilerplate needed.

### Core Integration Documents

| Document | Description |
|----------|-------------|
| [`integration/MAGIC_WRAPPER.md`](integration/MAGIC_WRAPPER.md) | High-level concept of the magic wrapper |
| [`integration/MAGIC_ARCHITECTURE.md`](integration/MAGIC_ARCHITECTURE.md) | Complete implementation code |
| [`integration/DEEP_TANSTACK_INTEGRATION.md`](integration/DEEP_TANSTACK_INTEGRATION.md) | Deep dive into TanStack Query internals |
| [`integration/AUTO_INVALIDATION.md`](integration/AUTO_INVALIDATION.md) | Server-driven cache invalidation |
| [`integration/CACHE_KEYS_EXTRACTION.md`](integration/CACHE_KEYS_EXTRACTION.md) | Automatic key extraction from server |

### Without vs With Magic

```typescript
// Without Magic (current)
const { data } = useQuery({
  queryKey: ['users', 'list', limit],
  queryFn: () => client.users.list({ limit }),
})

const { mutate } = useMutation({
  mutationFn: (data) => client.users.create(data),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['users', 'list'] })
  },
})

// With Magic
const { data } = useQuery(client.users.list, { args: { limit: 10 } })
const { mutate } = useMutation(client.users.create)
```

## Proposed Features

### High Priority

| Feature | File | Description |
|---------|------|-------------|
| Infinite Queries | [`features/INFINITE_QUERIES.md`](features/INFINITE_QUERIES.md) | Pagination with infinite scrolling |
| Optimistic Updates | [`features/OPTIMISTIC_UPDATES.md`](features/OPTIMISTIC_UPDATES.md) | Immediate UI updates with rollback |
| DevTools | [`features/DEVTOOLS.md`](features/DEVTOOLS.md) | Visual debugging interface |
| Cache Persistence | [`features/CACHE_PERSISTENCE.md`](features/CACHE_PERSISTENCE.md) | Offline support, localStorage/IndexedDB |

### Medium Priority

| Feature | File | Description |
|---------|------|-------------|
| Background Refetch | [`features/BACKGROUND_REFETCH.md`](features/BACKGROUND_REFETCH.md) | Auto-refresh on interval/focus/reconnect |
| Placeholder Data | [`features/PLACEHOLDER_DATA.md`](features/PLACEHOLDER_DATA.md) | Temporary data while loading |
| Mutation State | [`features/MUTATION_STATE.md`](features/MUTATION_STATE.md) | Track multiple mutations |
| Retry Logic | [`features/RETRY_LOGIC.md`](features/RETRY_LOGIC.md) | Automatic retry with backoff |

## Developer Experience (DX)

Practical examples showing how end users would use the magic wrapper.

### Documents

| Document | Description |
|----------|-------------|
| [`dx/QUICK_START.md`](dx/QUICK_START.md) | Get started in 5 minutes |
| [`dx/CRUD_EXAMPLES.md`](dx/CRUD_EXAMPLES.md) | Complete CRUD examples |
| [`dx/ADVANCED_PATTERNS.md`](dx/ADVANCED_PATTERNS.md) | Complex use cases |
| [`dx/COMPARISON.md`](dx/COMPARISON.md) | Without vs With Magic |

### Quick Example

```typescript
// Setup
<QueryClientProvider client={queryClient} api={client}>
  {children}
</QueryClientProvider>

// Usage - that's it!
const { data } = useQuery(client.users.list, { args: { limit: 10 } })
const { mutate } = useMutation(client.users.create)
```

## Architecture Comparison

### TanStack Query (Client-Driven)
```
Client → Query Key → Fetch → Cache → Notify
         ↑
    Client decides what to invalidate
```

### @deessejs/server/react (Server-Driven)
```
Server Query → Returns Keys → Client Cache → Auto-invalidate
                              ↑
    Server decides what to invalidate
```

The server-driven approach simplifies the API but limits some advanced use cases. The magic wrapper bridges this gap by automating everything while using TanStack Query under the hood.

## See Also

- [Documentation](../README.md)
- [SPEC.md](../SPEC.md)
- [Client System](../features/CLIENT.md)
- [React Integration](../integration/REACT_HOOKS.md)
