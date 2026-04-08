# Expo React Native Analysis for @deessejs

## Executive Summary

This document analyzes the feasibility and considerations for supporting Expo React Native applications with a tRPC-like architecture like @deessejs. The architecture is well-suited for mobile due to:

- **Type sharing**: End-to-end type safety without code generation
- **HTTP-based transport**: Works naturally with React Native's networking stack
- **TanStack Query integration**: Mature caching, offline support, and optimistic updates
- **Lightweight protocols**: JSON-RPC over HTTP is bandwidth-efficient for mobile

Key recommendations:
1. Create a dedicated `@deessejs/expo` package for Expo-specific utilities
2. Use `@tanstack/react-query` with `PersistQueryClientProvider` for offline support
3. Implement a WebSocket link for real-time subscriptions
4. Consider Hermes engine compatibility in serialization

---

## 1. Expo/React Native Architecture Overview

### 1.1 React Native Networking Stack

React Native provides networking capabilities through:

**Fetch API (Recommended)**
```typescript
// Standard fetch works identically to web
const response = await fetch('https://api.example.com/users', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'John' }),
});
const data = await response.json();
```

**WebSocket (Real-time)**
```typescript
const socket = new WebSocket('wss://api.example.com/ws');
socket.onmessage = (event) => { console.log(event.data); };
socket.send(JSON.stringify({ type: 'subscribe', channel: 'updates' }));
```

**XMLHttpRequest (Legacy)**
Available but not recommended for new development.

### 1.2 Key Differences from Web

| Feature | Web | React Native |
|---------|-----|--------------|
| Fetch API | Standard | Same API |
| WebSocket | Standard | Same API |
| localStorage | Browser storage | AsyncStorage or MMKV |
| Background execution | Limited | More restrictive |
| Network detection | navigator.onLine | NetInfo library |
| Bundle size | N/A | Critical (Hermes) |

### 1.3 Hermes Engine

Hermes is a JavaScript engine optimized for React Native that:
- Compiles JavaScript to bytecode ahead of time
- Reduces startup time and memory footprint
- Improves runtime performance
- Is the default engine since React Native 0.70

**Compatibility considerations:**
- No V8-specific APIs
- No `eval()` or `new Function()`
- Proxies work differently (limited support)
- Some Node.js APIs not available

### 1.4 Expo Networking

Expo provides additional networking utilities:

**expo-file-system** - For larger data storage:
```typescript
import * as FileSystem from 'expo-file-system';
const cachedData = await FileSystem.readAsStringAsync(uri);
```

**expo-secure-store** - For sensitive data:
```typescript
import * as SecureStore from 'expo-secure-store';
await SecureStore.setItemAsync('token', authToken);
```

**expo-network** - For network state:
```typescript
import * as Network from 'expo-network';
const networkState = await Network.getNetworkStateAsync();
```

---

## 2. How a tRPC-Like System Could Work in Expo

### 2.1 Architecture Overview

```
+----------------+     HTTP/JSON-RPC      +----------------+
|   Expo App     | <--------------------> |    Server      |
|                |                        |                |
| @deessejs/core | <-- Type Import Only   | @deessejs/server
| @deessejs/client                      |                |
| @tanstack/react-query                 | AppRouter type |
+----------------+                        +----------------+
```

### 2.2 Server Side (Unchanged)

The server implementation remains identical to web:

```typescript
// server/router.ts
import { defineContext, createAPI, t } from '@deessejs/server';
import { z } from 'zod';

const { router, publicProcedure } = defineContext({
  context: async () => ({ db: await connectDB() }),
});

export const appRouter = router({
  users: router({
    list: publicProcedure
      .input(z.object({ limit: z.number().default(10) }))
      .query(async ({ ctx, input }) => {
        return ctx.db.users.findMany({ take: input.limit });
      }),
    create: publicProcedure
      .input(z.object({ name: z.string(), email: z.string().email() }))
      .mutation(async ({ ctx, input }) => {
        return ctx.db.users.create(input);
      }),
  }),
});

export type AppRouter = typeof appRouter;
```

### 2.3 Expo Client Side

```typescript
// client/expoClient.ts
import { createClient } from '@deessejs/client';
import { httpBatchLink } from '@deessejs/client/links';
import type { AppRouter } from '../../server/router';
import { QueryClient } from '@tanstack/react-query';

export function createExpoClient() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,      // 30 seconds
        gcTime: 1000 * 60 * 60,    // 1 hour
        networkMode: 'offlineFirst',
        retry: 2,
        refetchOnWindowFocus: true,
      },
      mutations: {
        networkMode: 'offlineFirst',
        retry: 2,
      },
    },
  });

  return createClient<AppRouter>({
    queryClient,
    links: [
      httpBatchLink({
        url: 'https://api.example.com/drpc',
        fetch: globalThis.fetch,  // React Native's fetch
      }),
    ],
  });
}
```

### 2.4 React Hooks Integration

```typescript
// hooks/useUsers.ts
import { createExpoClient, client } from '../client/expoClient';

const trpc = createExpoClient();

export function useUserList(limit = 10) {
  return trpc.users.list.useQuery({ limit });
}

export function useCreateUser() {
  return trpc.users.create.useMutation({
    onSuccess: () => {
      // Auto-invalidation via server metadata
    },
  });
}
```

---

## 3. Type Sharing Pattern Between Server and Mobile

### 3.1 The Challenge

In web development, the client typically imports types directly:
```typescript
import type { AppRouter } from '../server';
```

In React Native/Expo, this pattern works but requires careful setup due to:

1. **Monorepo structure**: Both packages need to be accessible
2. **Build outputs**: TypeScript compiles to different artifacts
3. **Bundle size**: Client should not include server code

### 3.2 Recommended Monorepo Structure

```
packages/
├── server/           # @deessejs/server + your API
│   ├── src/
│   │   ├── index.ts       # Exports publicProcedure, router
│   │   └── router.ts      # AppRouter definition
│   └── package.json
├── client/           # @deessejs/client
│   ├── src/
│   │   ├── index.ts
│   │   └── links/
│   └── package.json
└── expo/             # @deessejs/expo (NEW)
    ├── src/
    │   └── index.ts
    └── package.json

apps/
├── api/              # Your server deployment
│   └── package.json
└── mobile/           # Your Expo app
    └── package.json
```

### 3.3 Type Export Pattern

```typescript
// packages/server/src/index.ts
export { router, publicProcedure } from './core';
export { createAPI } from './api';
export type { AppRouter } from './router';

// packages/server/src/router.ts
import { router, publicProcedure } from './core';

export const appRouter = router({
  greeting: publicProcedure.query(() => 'Hello from server'),
});

export type AppRouter = typeof appRouter;
```

### 3.4 Client Type Import

```typescript
// apps/mobile/src/client.ts
import { createClient } from '@deessejs/client';
import type { AppRouter } from '@myorg/server';  // Monorepo workspace
// or
import type { AppRouter } from '@myorg/api';     // Published package

export const client = createClient<AppRouter>({
  // config
});
```

**Important**: Use `import type` to ensure TypeScript erases the import at compile time, preventing server code from entering the client bundle.

---

## 4. Implementation Considerations for @deessejs

### 4.1 HTTP Transport Adapter

The existing `@deessejs/server` HTTP handler should work with React Native's fetch, but verify:

```typescript
// Required request format for @deessejs
const request = {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    method: 'query',
    params: {
      input: { limit: 10 },
      path: ['users', 'list'],
      type: 'query',
    },
    id: 1,
  }),
};

// Server response format
interface ServerResponse {
  ok: boolean;
  value?: unknown;
  error?: {
    code: string;
    message: string;
    details?: unknown[];
  };
}
```

### 4.2 React Native Fetch Compatibility

React Native's `globalThis.fetch` is compatible with the standard Fetch API but has some nuances:

```typescript
// Ensure fetch is available
import { fetch } from 'react-native';

// Or use cross-fetch for universal compatibility
import fetch from 'cross-fetch';

// HTTP batch link configuration
httpBatchLink({
  url: 'https://api.example.com/drpc',
  fetch: fetch as typeof globalThis.fetch,
  headers: {
    // Add custom headers for auth
    'Authorization': `Bearer ${authToken}`,
  },
});
```

### 4.3 TanStack Query Configuration

For React Native, TanStack Query configuration differs slightly:

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Mobile: longer stale time to reduce network calls
      staleTime: 60 * 1000,        // 1 minute

      // Mobile: garbage collection time
      gcTime: 1000 * 60 * 30,      // 30 minutes

      // Critical for mobile: network mode
      networkMode: 'offlineFirst', // Prioritize cached data

      // Background refetch
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,

      // Retry strategy
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      networkMode: 'offlineFirst',
      retry: 2,
    },
  },
});
```

### 4.4 Required Package Dependencies for Expo

```json
{
  "dependencies": {
    "@deessejs/client": "workspace:*",
    "@tanstack/react-query": "^5.0.0",
    "react-native": "0.76.0",
    "@react-native-async-storage/async-storage": "^2.0.0"
  }
}
```

### 4.5 Expo-Specific Utilities

Create a new `@deessejs/expo` package for platform-specific utilities:

```typescript
// @deessejs/expo/src/index.ts
export { createOfflinePersister } from './persistence';
export { createNetworkLink } from './network';
export { useOnlineStatus } from './hooks';

// Storage persister using AsyncStorage
import AsyncStorage from '@react-native-async-storage/async-storage';
import { persistQueryClient } from '@tanstack/react-query-persist-client';

export function createOfflinePersister(queryClient: QueryClient) {
  return {
    persist: async () => {
      await persistQueryClient({
        queryClient,
        persister: {
          getItem: async (key) => {
            const value = await AsyncStorage.getItem(key);
            return value ? JSON.parse(value) : null;
          },
          setItem: async (key, value) => {
            await AsyncStorage.setItem(key, JSON.stringify(value));
          },
          removeItem: async (key) => {
            await AsyncStorage.removeItem(key);
          },
        },
      });
    },
  };
}
```

---

## 5. Code Examples Showing the Concept

### 5.1 Complete Expo App Setup

```typescript
// App.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createClient } from '@deessejs/client';
import { httpBatchLink } from '@deessejs/client/links';
import type { AppRouter } from '@myorg/shared-types';
import { UserList } from './screens/UserList';
import { UserDetail } from './screens/UserDetail';
import { CreateUser } from './screens/CreateUser';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      gcTime: 1000 * 60 * 60,
      networkMode: 'offlineFirst',
      refetchOnReconnect: true,
    },
    mutations: {
      networkMode: 'offlineFirst',
    },
  },
});

const client = createClient<AppRouter>({
  queryClient,
  links: [
    httpBatchLink({
      url: 'https://api.example.com/drpc',
      headers: async () => {
        const token = await getAuthToken();
        return token ? { Authorization: `Bearer ${token}` } : {};
      },
    }),
  ],
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <UserList />
    </QueryClientProvider>
  );
}
```

### 5.2 Query and Mutation Hooks

```typescript
// screens/UserList.tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { client } from '../client';

export function UserList() {
  const { data: users, isLoading, error, refetch } = useQuery(
    client.users.list.queryOptions({ limit: 20 })
  );

  const createMutation = useMutation(
    client.users.create.mutationOptions()
  );

  const handleCreate = async (name: string, email: string) => {
    try {
      await createMutation.mutateAsync({ name, email });
      // Server returns invalidation keys, query auto-refetches
    } catch (err) {
      console.error('Failed to create user:', err);
    }
  };

  if (isLoading) return <ActivityIndicator />;
  if (error) return <ErrorView error={error} onRetry={refetch} />;

  return (
    <View>
      {users?.map(user => (
        <UserCard key={user.id} user={user} />
      ))}
    </View>
  );
}
```

### 5.3 Offline Support with Persistence

```typescript
// persistence.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import type { PersistedClient } from '@tanstack/react-query-persist-client';

const persistOptions = {
  persister: {
    getItem: async (key: string): Promise<PersistedClient | null> => {
      const value = await AsyncStorage.getItem(key);
      return value ? JSON.parse(value) : null;
    },
    setItem: async (key: string, value: PersistedClient): Promise<void> => {
      await AsyncStorage.setItem(key, JSON.stringify(value));
    },
    removeItem: async (key: string): Promise<void> => {
      await AsyncStorage.removeItem(key);
    },
  },
  maxAge: 1000 * 60 * 60 * 24, // 24 hours
  buster: 'v1',
};

export async function restoreQueryClient(queryClient: QueryClient) {
  await persistQueryClient({
    queryClient,
    ...persistOptions,
  });
}
```

### 5.4 Network Status Detection

```typescript
// hooks/useNetworkStatus.ts
import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(state.isConnected ?? false);
    });

    return () => unsubscribe();
  }, []);

  return isOnline;
}

// Usage in component
function UserList() {
  const isOnline = useNetworkStatus();

  if (!isOnline) {
    return <OfflineBanner />;
  }

  // ... normal rendering
}
```

---

## 6. Performance and Offline Considerations

### 6.1 Bundle Size Optimization

React Native bundle size is critical. Key strategies:

| Strategy | Impact | Implementation |
|----------|--------|----------------|
| Tree shaking | High | Ensure ESM exports |
| Hermes bytecode | Medium | Use `.hbc` compilation |
| Code splitting | High | Lazy load screens |
| Validation library | High | Use Valibot (~6KB) instead of Zod (~30KB) |

### 6.2 Network Efficiency

**Batch multiple queries**:
```typescript
// Automatically batches in single HTTP request
const [usersQuery, postsQuery] = await Promise.all([
  client.users.list.query({ limit: 10 }),
  client.posts.list.query({ limit: 10 }),
]);
// Results in single HTTP POST with both queries
```

**Streaming for large data**:
```typescript
// For large datasets, consider pagination
const users = client.users.list.query({
  limit: 20,
  cursor: lastId
});
```

### 6.3 Offline-First Architecture

```
                ┌─────────────────┐
                │  React Native   │
                │                 │
   ┌───────────>│  QueryClient    │<─────────── AsyncStorage
   │            │  (In-Memory)    │            (Persistence)
   │            └────────┬────────┘
   │                     │
   │                     │ When Online
   │                     ▼
   │            ┌─────────────────┐
   └────────────│    Server       │
                │   (HTTP/WS)      │
                └─────────────────┘
```

### 6.4 Optimistic Updates

```typescript
const updateUser = useMutation(
  client.users.update.mutationOptions({
    onMutate: async (newUser) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries(['users', userId]);

      // Snapshot previous value
      const previous = queryClient.getQueryData(['users', userId]);

      // Optimistically update
      queryClient.setQueryData(['users', userId], newUser);

      return { previous };
    },
    onError: (err, user, context) => {
      // Rollback on error
      queryClient.setQueryData(['users', userId], context.previous);
    },
    onSettled: () => {
      // Sync with server
      queryClient.invalidateQueries(['users', userId]);
    },
  })
);
```

---

## 7. WebSocket/Subscription Support

### 7.1 Real-Time Updates Pattern

For subscriptions, use WebSocket link:

```typescript
// @deessejs/client/links/wsLink.ts
import { splitLink } from '@deessejs/client/links';
import { httpBatchLink } from './httpBatchLink';
import { wsLink } from './wsLink';

export function createMobileLinks(config: MobileConfig) {
  return [
    // Route subscriptions to WebSocket
    splitLink({
      condition: (op) => op.type === 'subscription',
      true: wsLink({ url: config.wsUrl }),
      false: httpBatchLink({ url: config.httpUrl }),
    }),
  ];
}
```

### 7.2 Subscription Handler

```typescript
// Server: Define subscription procedure
const appRouter = router({
  onMessage: publicProcedure.subscription(() => {
    return observable((emit) => {
      const handler = (data: Message) => emit.next(data);

      eventEmitter.on('message', handler);

      return () => eventEmitter.off('message', handler);
    });
  }),
});

// Client: Subscribe in component
function useMessages() {
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    const subscription = client.onMessage.subscription(
      { channel: 'updates' },
      (data) => {
        setMessages((prev) => [...prev, data]);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  return messages;
}
```

---

## 8. Hermes Engine Compatibility

### 8.1 Serialization

Hermes handles JSON serialization well, but note:

```typescript
// Standard serialization works
const json = JSON.stringify(data);
const parsed = JSON.parse(json);

// BigInt requires polyfill
import { serialize, deserialize } from 'superjson';
// OR
const str = JSON.stringify(data, (key, value) =>
  typeof value === 'bigint' ? value.toString() : value
);
```

### 8.2 Date Handling

Dates are automatically serialized:

```typescript
// Server
const user = { id: 1, createdAt: new Date() };

// Client receives ISO string, but @deessejs can handle
// Consider using date-fns for cross-platform consistency
import { parseISO, format } from 'date-fns';
const createdDate = parseISO(user.createdAt);
```

### 8.3 Proxy Limitations

Hermes has limited Proxy support. Avoid runtime Proxy usage:

```typescript
// Instead of dynamic property access
const prop = 'name';
obj[prop]; // This works

// Avoid patterns that require Proxy polyfills
```

---

## 9. Push Notifications Integration

### 9.1 Architecture

```
┌──────────────┐     Push Token      ┌──────────────┐
│   Expo App   │───────────────────> │  Push Server │
│              │                     │  (FCM/APNs)  │
└──────────────┘                     └──────────────┘
       │
       │ Click Notification
       ▼
┌──────────────┐
│  Deep Link   │
│  Handler     │
└──────────────┘
```

### 9.2 Integration Pattern

```typescript
// notifications.ts
import * as Notifications from 'expo-notifications';

// Configure notification handling
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Listen for notifications
Notifications.addNotificationReceivedListener((notification) => {
  const { data } = notification.request.content;

  // Trigger query invalidation based on notification
  if (data.type === 'user_updated') {
    queryClient.invalidateQueries(['users', data.userId]);
  }
});

// Handle notification tap
Notifications.addNotificationResponseReceivedListener((response) => {
  const { data } = response.notification.request.content;

  if (data.type === 'user_profile') {
    router.push(`/users/${data.userId}`);
  }
});
```

### 9.3 Server-Initiated Cache Invalidation

```typescript
// Server: Send push notification on data change
const createUser = publicProcedure
  .input(UserSchema)
  .mutation(async ({ ctx, input }) => {
    const user = await ctx.db.users.create(input);

    // Trigger push notification to relevant clients
    await ctx.pushService.send({
      type: 'user_created',
      userId: user.id,
      title: 'New User',
      body: `${user.name} was added`,
    });

    return user;
  });
```

---

## 10. Risks and Recommendations

### 10.1 Identified Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Bundle size increase | High | Use Valibot, tree shake |
| Offline data staleness | Medium | Implement cache versioning |
| WebSocket reconnection | Medium | Use exponential backoff |
| Auth token refresh | Medium | Implement token refresh link |
| Hermes compatibility | Low | Avoid V8-specific APIs |
| Large response payloads | Medium | Implement pagination |
| Network instability | Medium | Queue mutations, optimistic updates |

### 10.2 Recommendations

1. **Start with HTTP-only**: Implement WebSocket later if subscriptions are needed
2. **Use existing TanStack Query persisters**: Do not reinvent offline storage
3. **Implement cache versioning**: Use buster string for major updates
4. **Add request timeout**: 30 seconds is reasonable for mobile
5. **Monitor error rates**: Use crash reporting (Sentry, Crashlytics)
6. **Test on real devices**: Emulator differences can be significant

### 10.3 Implementation Priority

1. **Phase 1 - Core**: HTTP transport, basic queries/mutations
2. **Phase 2 - Caching**: TanStack Query integration, cache persistence
3. **Phase 3 - Offline**: Offline mutations, sync queue
4. **Phase 4 - Real-time**: WebSocket subscriptions
5. **Phase 5 - Polish**: Push notifications, deep linking

---

## 11. Conclusion

A tRPC-like architecture like @deessejs is well-suited for Expo React Native applications. The key strengths are:

- **Type safety without code generation**: Reduces build complexity
- **HTTP transport compatibility**: Works with React Native's native fetch
- **TanStack Query integration**: Mature solution for caching and offline support
- **Lightweight protocol**: Efficient for mobile bandwidth

The primary considerations are:
- Bundle size management (use Valibot, tree shake)
- Offline-first configuration for network instability
- Hermes compatibility (avoid V8-specific APIs)
- Proper cache versioning for app updates

With the recommended architecture, @deessejs can provide a seamless type-safe RPC experience in Expo applications comparable to web tRPC implementations.
