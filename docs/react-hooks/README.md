# React Hooks Features

This folder contains analysis and proposed implementations for `@deessejs/server/react` features, comparing with TanStack Query.

## Overview

[`TANSTACK_QUERY_ANALYSIS.md`](TANSTACK_QUERY_ANALYSIS.md) provides a comprehensive overview of TanStack Query features and what is currently implemented or missing in `@deessejs/server/react`.

## Magic Wrapper Architecture

The goal is to create a **transparent wrapper** on top of TanStack Query where the server automatically manages everything - no boilerplate needed.

### Core Documents

| Document | Description |
|----------|-------------|
| [`MAGIC_WRAPPER.md`](MAGIC_WRAPPER.md) | High-level concept of the magic wrapper |
| [`MAGIC_ARCHITECTURE.md`](MAGIC_ARCHITECTURE.md) | Complete implementation code |
| [`DEEP_TANSTACK_INTEGRATION.md`](DEEP_TANSTACK_INTEGRATION.md) | Deep dive into TanStack Query internals |
| [`AUTO_INVALIDATION.md`](AUTO_INVALIDATION.md) | Server-driven cache invalidation |
| [`CACHE_KEYS_EXTRACTION.md`](CACHE_KEYS_EXTRACTION.md) | Automatic key extraction from server |

## Current vs Magic

### Without Magic (Current Implementation)

```typescript
// Client must manually handle everything
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
```

### With Magic

```typescript
// Just use the API - everything automatic!
const { data } = useQuery(client.users.list, { args: { limit: 10 } })

const { mutate } = useMutation(client.users.create)
```

## Proposed Features (from TanStack Query)

### High Priority

| Feature | File | Description |
|---------|------|-------------|
| Infinite Queries | [`INFINITE_QUERIES.md`](INFINITE_QUERIES.md) | Pagination with infinite scrolling |
| Optimistic Updates | [`OPTIMISTIC_UPDATES.md`](OPTIMISTIC_UPDATES.md) | Immediate UI updates with rollback |
| DevTools | [`DEVTOOLS.md`](DEVTOOLS.md) | Visual debugging interface |
| Cache Persistence | [`CACHE_PERSISTENCE.md`](CACHE_PERSISTENCE.md) | Offline support, localStorage/IndexedDB |

### Medium Priority

| Feature | File | Description |
|---------|------|-------------|
| Background Refetch | [`BACKGROUND_REFETCH.md`](BACKGROUND_REFETCH.md) | Auto-refresh on interval/focus/reconnect |
| Placeholder Data | [`PLACEHOLDER_DATA.md`](PLACEHOLDER_DATA.md) | Temporary data while loading |
| Mutation State | [`MUTATION_STATE.md`](MUTATION_STATE.md) | Track multiple mutations |
| Retry Logic | [`RETRY_LOGIC.md`](RETRY_LOGIC.md) | Automatic retry with backoff |

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

## Usage

```typescript
import { useMagicQuery, useMagicMutation } from "@deessejs/server/react/magic"

// Query with auto-cache
const { data } = useMagicQuery(client.users.list, {
  args: { limit: 10 },
})

// Mutation with auto-invalidation
const { mutate } = useMagicMutation(client.users.create)
await mutate({ name: "John" })
// Automatically refetches related queries
```

## See Also

- [Documentation](../README.md)
- [SPEC.md](../SPEC.md)
- [Client System](../features/CLIENT.md)
- [React Integration](../integration/REACT_HOOKS.md)
