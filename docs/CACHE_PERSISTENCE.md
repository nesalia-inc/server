# Cache Persistence

## Overview

Cache persistence allows data to survive across browser sessions, enabling offline support and faster initial loads.

## TanStack Query Implementation

```typescript
import { persistQueryClient } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'

const persister = createSyncStoragePersister({
  storage: window.localStorage,
})

persistQueryClient({
  queryClient,
  persister,
  maxAge: 1000 * 60 * 60 * 24, // 24 hours
  buster: 'v1',
})
```

## Proposed @deessejs/server/react Implementation

### Storage Adapters

```typescript
// localStorage adapter
const localStoragePersister = {
  getItem: (key: string) => {
    const value = localStorage.getItem(key)
    return value ? JSON.parse(value) : null
  },
  setItem: (key: string, value: unknown) => {
    localStorage.setItem(key, JSON.stringify(value))
  },
  removeItem: (key: string) => {
    localStorage.removeItem(key)
  },
}

// sessionStorage adapter
const sessionStoragePersister = {
  getItem: (key: string) => {
    const value = sessionStorage.getItem(key)
    return value ? JSON.parse(value) : null
  },
  setItem: (key: string, value: unknown) => {
    sessionStorage.setItem(key, JSON.stringify(value))
  },
  removeItem: (key: string) => {
    sessionStorage.removeItem(key)
  },
}

// IndexedDB adapter (for larger caches)
const indexedDBPersister = {
  getItem: async (key: string) => {
    const db = await openDB('deesse-cache', 1, {
      upgrade(db) {
        db.createObjectStore('cache')
      },
    })
    return db.get('cache', key)
  },
  setItem: async (key: string, value: unknown) => {
    const db = await openDB('deesse-cache', 1, {
      upgrade(db) {
        db.createObjectStore('cache')
      },
    })
    await db.put('cache', value, key)
  },
  removeItem: async (key: string) => {
    const db = await openDB('deesse-cache', 1, {
      upgrade(db) {
        db.createObjectStore('cache')
      },
    })
    await db.delete('cache', key)
  },
}
```

### QueryClient with Persistence

```typescript
import { QueryClient, persistQueryClient } from "@deessejs/server/react"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60, // 1 hour
    },
  },
})

// Persist to localStorage
persistQueryClient({
  queryClient,
  persister: localStoragePersister,
  maxAge: 1000 * 60 * 60 * 24, // 24 hours
  buster: 'v1', // Version for cache invalidation
})
```

### Provider with Persistence

```typescript
// App.tsx
import { PersistQueryClientProvider } from "@deessejs/server/react"

function App() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persister={localStoragePersister}
      options={{
        maxAge: 1000 * 60 * 60 * 24,
        buster: 'v1',
        shouldDehydrateQuery: (query) => {
          // Don't persist queries marked as no-persist
          return query.state.status === 'success'
        },
      }}
    >
      <YourApp />
    </PersistQueryClientProvider>
  )
}
```

### PersistQueryClientProvider Implementation

```typescript
interface PersistQueryClientProviderProps {
  client: QueryClient
  persister: StoragePersister
  options?: PersistOptions
  children: React.ReactNode
}

interface PersistOptions {
  maxAge?: number
  buster?: string
  shouldDehydrateQuery?: (query: Query) => boolean
  shouldDehydrateMutation?: (mutation: Mutation) => boolean
}

export function PersistQueryClientProvider({
  client,
  persister,
  options = {},
  children,
}: PersistQueryClientProviderProps) {
  const [isRestored, setIsRestored] = useState(false)

  // Restore on mount
  useEffect(() => {
    const restoreCache = async () => {
      const cacheKey = `deesse-cache-${options.buster || 'v1'}`
      const cached = await persister.getItem(cacheKey)

      if (cached) {
        // Restore queries
        cached.queries.forEach((query) => {
          client.setQueryData(query.queryKey, query.state.data)
        })
      }

      setIsRestored(true)
    }

    restoreCache()
  }, [])

  // Persist on changes
  useEffect(() => {
    if (!isRestored) return

    const persist = () => {
      const cacheKey = `deesse-cache-${options.buster || 'v1'}`
      const queries = client
        .getQueries()
        .filter((query) => {
          // Filter by options
          if (query.state.status !== 'success') return false
          if (options.shouldDehydrateQuery && !options.shouldDehydrateQuery(query)) {
            return false
          }
          // Don't persist stale data older than maxAge
          if (options.maxAge) {
            const age = Date.now() - query.state.dataUpdatedAt
            if (age > options.maxAge) return false
          }
          return true
        })
        .map((query) => ({
          queryKey: query.queryKey,
          state: query.state,
        }))

      persister.setItem(cacheKey, { queries })
    }

    // Debounce persistence
    const timeout = setTimeout(persist, 1000)

    return () => clearTimeout(timeout)
  }, [client, isRestored])

  if (!isRestored) {
    return <LoadingFallback />
  }

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
```

## Offline Support

### Network Status Detection

```typescript
import { onlineManager } from "@deessejs/server/react"

function NetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return (
    <div className={isOnline ? 'online' : 'offline'}>
      {isOnline ? '🟢 Online' : '🔴 Offline'}
    </div>
  )
}
```

### Offline Mutations

```typescript
import { mutationQueue } from "@deessejs/server/react"

function OfflineMutations() {
  const { pendingMutations, retryAll } = mutationQueue.usePending()

  if (pendingMutations.length === 0) return null

  return (
    <div>
      <p>{pendingMutations.length} mutations pending</p>
      <button onClick={retryAll}>Retry All</button>
    </div>
  )
}

// Queue mutations when offline
const { mutate } = useMutation(api.posts.create, {
  networkMode: 'offline', // Queue if offline
})

// Mutation queue hook
const mutationQueue = {
  usePending: () => {
    const [pending, setPending] = useState([])

    // Load from storage on mount
    useEffect(() => {
      const stored = localStorage.getItem('mutation-queue')
      if (stored) {
        setPending(JSON.parse(stored))
      }
    }, [])

    // Save to storage on changes
    const addToQueue = (mutation) => {
      const updated = [...pending, mutation]
      setPending(updated)
      localStorage.setItem('mutation-queue', JSON.stringify(updated))
    }

    const retryAll = async () => {
      for (const mutation of pending) {
        await mutation.mutationFn(mutation.variables)
      }
      setPending([])
      localStorage.removeItem('mutation-queue')
    }

    return { pendingMutations: pending, retryAll }
  },
}
```

## SSR Hydration Integration

```typescript
// Server: Dehydrate state
import { dehydrate } from "@deessejs/server/react"

export async function getServerSideProps() {
  const queryClient = new QueryClient()

  await queryClient.prefetchQuery(api.users.list, {
    args: { limit: 10 }
  })

  return {
    props: {
      dehydratedState: dehydrate(queryClient),
    },
  }
}

// Client: Hydrate state
function App({ dehydratedState }) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persister={localStoragePersister}
      options={{ maxAge: 1000 * 60 * 60 * 24 }}
      dehydrateOptions={{
        shouldDehydrateQuery: (query) => {
          // Only dehydrate successful queries
          return query.state.status === 'success'
        },
      }}
    >
      <HydrationBoundary state={dehydratedState}>
        <YourApp />
      </HydrationBoundary>
    </PersistQueryClientProvider>
  )
}
```

## Storage Size Management

```typescript
const storageWithQuota = {
  getItem: async (key: string) => {
    return localStorage.getItem(key)
  },
  setItem: async (key: string, value: unknown) => {
    // Check quota
    const used = new Blob(Object.values(localStorage)).size
    const newSize = new Blob([JSON.stringify(value)]).size

    if (used + newSize > 5 * 1024 * 1024) { // 5MB
      // Clear oldest queries
      await clearOldQueries()
    }

    localStorage.setItem(key, JSON.stringify(value))
  },
  removeItem: (key: string) => localStorage.removeItem(key),
}
```

## Best Practices

1. **Set maxAge** - Don't persist stale data indefinitely
2. **Version with buster** - Clear cache on app updates
3. **Filter sensitive data** - Don't persist auth tokens
4. **Handle quota** - Manage storage limits
5. **Debounce persistence** - Don't write on every change
