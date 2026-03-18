# DevTools

## Overview

DevTools provide a visual interface for debugging queries and mutations, inspecting cache state, and manually manipulating data.

## TanStack Query DevTools

```typescript
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <YourApp />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
```

## Proposed @deessejs/server/react DevTools

### Basic Setup

```typescript
import { QueryClient, DeesseQueryDevtools } from "@deessejs/server/react"

const queryClient = new QueryClient()

function App() {
  return (
    <QueryClientProvider client={queryClient} api={client}>
      <YourApp />
      <DeesseQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
```

### Component Structure

```typescript
// DeesseQueryDevtools.tsx
import { useState, useEffect } from 'react'

interface DevToolsProps {
  initialIsOpen?: boolean
  panelPosition?: 'bottom' | 'top' | 'left' | 'right'
  panelSize?: number // percentage or px
}

export function DeesseQueryDevtools({
  initialIsOpen = false,
  panelPosition = 'bottom',
  panelSize = 50,
}: DevToolsProps) {
  const [isOpen, setIsOpen] = useState(initialIsOpen)
  const [queries, setQueries] = useState([])
  const [mutations, setMutations] = useState([])

  // Connect to QueryClient
  useEffect(() => {
    const unsubscribeQueries = queryClient.subscribe((state) => {
      setQueries(state.queries)
    })
    const unsubscribeMutations = mutationClient.subscribe((state) => {
      setMutations(state.mutations)
    })

    return () => {
      unsubscribeQueries()
      unsubscribeMutations()
    }
  }, [])

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={styles.toggleButton}
      >
        ⚡ DevTools
      </button>
    )
  }

  return (
    <div style={getPanelStyle(panelPosition, panelSize)}>
      <DevToolsPanel
        queries={queries}
        mutations={mutations}
        onClose={() => setIsOpen(false)}
      />
    </div>
  )
}
```

### Panel Features

```typescript
function DevToolsPanel({ queries, mutations, onClose }) {
  const [activeTab, setActiveTab] = useState<'queries' | 'mutations' | 'cache'>('queries')

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <div style={styles.tabs}>
          <button onClick={() => setActiveTab('queries')}>
            Queries ({queries.length})
          </button>
          <button onClick={() => setActiveTab('mutations')}>
            Mutations ({mutations.length})
          </button>
          <button onClick={() => setActiveTab('cache')}>
            Cache
          </button>
        </div>
        <button onClick={onClose}>✕</button>
      </div>

      <div style={styles.content}>
        {activeTab === 'queries' && <QueriesTab queries={queries} />}
        {activeTab === 'mutations' && <MutationsTab mutations={mutations} />}
        {activeTab === 'cache' && <CacheTab queries={queries} />}
      </div>
    </div>
  )
}
```

### Queries Tab

```typescript
function QueriesTab({ queries }) {
  return (
    <div style={styles.list}>
      {queries.map((query) => (
        <QueryItem key={query.queryKey} query={query} />
      ))}
    </div>
  )
}

function QueryItem({ query }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div style={styles.item}>
      <div style={styles.itemHeader} onClick={() => setExpanded(!expanded)}>
        <span style={styles.statusDot(query.status)} />
        <span style={styles.queryKey}>{query.queryKey}</span>
        <span style={styles.status}>{query.status}</span>
      </div>

      {expanded && (
        <div style={styles.itemDetails}>
          <div>
            <strong>Status:</strong> {query.status}
          </div>
          <div>
            <strong>Data Updated:</strong> {new Date(query.dataUpdatedAt).toLocaleString()}
          </div>
          <div>
            <strong>Stale Time:</strong> {query.staleTime}ms
          </div>
          <div>
            <strong>Fetch Count:</strong> {query.fetchCount}
          </div>

          <div style={styles.actions}>
            <button onClick={() => queryClient.refetchQuery(query.queryKey)}>
              Refetch
            </button>
            <button onClick={() => queryClient.invalidateQuery(query.queryKey)}>
              Invalidate
            </button>
            <button onClick={() => queryClient.removeQuery(query.queryKey)}>
              Remove
            </button>
          </div>

          <pre style={styles.pre}>
            {JSON.stringify(query.data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}
```

### Mutations Tab

```typescript
function MutationsTab({ mutations }) {
  return (
    <div style={styles.list}>
      {mutations.map((mutation) => (
        <MutationItem key={mutation.variables} mutation={mutation} />
      ))}
    </div>
  )
}

function MutationItem({ mutation }) {
  return (
    <div style={styles.item}>
      <div style={styles.itemHeader}>
        <span style={styles.statusDot(mutation.status)} />
        <span style={styles.mutationId}>ID: {mutation.id}</span>
        <span style={styles.status}>{mutation.status}</span>
      </div>

      <div style={styles.itemDetails}>
        <div>
          <strong>Variables:</strong>
          <pre>{JSON.stringify(mutation.variables, null, 2)}</pre>
        </div>

        {mutation.error && (
          <div style={styles.error}>
            <strong>Error:</strong> {mutation.error.message}
          </div>
        )}

        {mutation.data && (
          <div>
            <strong>Data:</strong>
            <pre>{JSON.stringify(mutation.data, null, 2)}</pre>
          </div>
        )}
      </div>
    </div>
  )
}
```

### Cache Tab

```typescript
function CacheTab({ queries }) {
  const [searchTerm, setSearchTerm] = useState('')

  const filteredQueries = queries.filter((q) =>
    JSON.stringify(q.queryKey).includes(searchTerm)
  )

  return (
    <div>
      <input
        type="text"
        placeholder="Search cache..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        style={styles.search}
      />

      <div style={styles.cacheStats}>
        <div>Total Queries: {queries.length}</div>
        <div>
          Active: {queries.filter((q) => q.status === 'pending').length}
        </div>
        <div>
          Stale: {queries.filter((q) => q.isStale).length}
        </div>
      </div>

      {filteredQueries.map((query) => (
        <div key={query.queryKey} style={styles.cacheItem}>
          <code>{query.queryKey}</code>
          <button
            onClick={() => navigator.clipboard.writeText(JSON.stringify(query.data))}
          >
            Copy
          </button>
        </div>
      ))}
    </div>
  )
}
```

## Styling

```typescript
const styles = {
  toggleButton: {
    position: 'fixed',
    bottom: '10px',
    right: '10px',
    zIndex: 9999,
    padding: '8px 16px',
    background: '#1a1a1a',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  panel: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    height: '400px',
    background: '#1a1a1a',
    color: '#fff',
    zIndex: 9998,
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '10px',
    borderBottom: '1px solid #333',
  },
  tabs: {
    display: 'flex',
    gap: '10px',
  },
  content: {
    flex: 1,
    overflow: 'auto',
    padding: '10px',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
  },
  item: {
    border: '1px solid #333',
    borderRadius: '4px',
  },
  itemHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px',
    cursor: 'pointer',
  },
  statusDot: (status) => ({
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background:
      status === 'pending' ? '#f59e0b' :
      status === 'success' ? '#10b981' :
      status === 'error' ? '#ef4444' : '#6b7280',
  }),
}
```

## Advanced Features

### Keyboard Shortcuts

```typescript
useEffect(() => {
  const handleKeyDown = (e) => {
    // Ctrl+Shift+D to toggle
    if (e.ctrlKey && e.shiftKey && e.key === 'D') {
      setIsOpen((prev) => !prev)
    }
    // Escape to close
    if (e.key === 'Escape') {
      setIsOpen(false)
    }
  }

  window.addEventListener('keydown', handleKeyDown)
  return () => window.removeEventListener('keydown', handleKeyDown)
}, [])
```

### Export/Import Cache

```typescript
function exportCache() {
  const cacheData = {
    queries: queryClient.getQueriesData(),
    mutations: mutationClient.getMutations(),
    exportedAt: new Date().toISOString(),
  }

  const blob = new Blob([JSON.stringify(cacheData, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = `cache-${Date.now()}.json`
  a.click()
}

function importCache(file) {
  const reader = new FileReader()
  reader.onload = (e) => {
    const { queries } = JSON.parse(e.target.result)
    queries.forEach(([key, data]) => {
      queryClient.setQueryData(key, data)
    })
  }
  reader.readAsText(file)
}
```

## Production Considerations

1. **Disable in production** - Use `process.env.NODE_ENV`
2. **Minimal styling** - Don't bloat bundle
3. **Lazy load** - Only load when needed
4. **Secure** - Don't expose sensitive data in logs
