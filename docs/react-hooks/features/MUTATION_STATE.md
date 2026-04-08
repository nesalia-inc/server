# Mutation State

## Overview

Mutation state allows tracking multiple mutations, their status, variables, and results. This is useful for managing forms, showing loading states, and handling multiple concurrent mutations.

## TanStack Query Implementation

```typescript
// Track all mutations
const mutationState = useMutationState({
  filters: { mutationKey: ['createPost'] },
  select: (mutation) => ({
    variables: mutation.variables,
    status: mutation.status,
  }),
})

// Track specific mutation
const mutation = useMutation({
  mutationKey: ['createPost'],
  mutationFn: createPost,
})

// Access all mutations
mutationState.forEach((state) => {
  console.log(state.variables) // Input variables
  console.log(state.status) // 'idle' | 'pending' | 'success' | 'error'
})
```

## Proposed @deessejs/server/react Implementation

### Basic Mutation State

```typescript
import { useMutationState } from "@deessejs/server/react"

function CreatePostForm() {
  const [title, setTitle] = useState('')

  const { mutate } = useMutation(client.posts.create)

  return (
    <form onSubmit={() => mutate({ title })}>
      <input value={title} onChange={(e) => setTitle(e.target.value)} />
      <button type="submit">Create</button>
    </form>
  )
}
```

### Track Multiple Mutations

```typescript
// Track all mutations
const allMutations = useMutationState()

// Track mutations by query key
const postMutations = useMutationState({
  queryKey: ['posts'],
})

// Track mutations by status
const pendingMutations = useMutationState({
  status: 'pending',
})

function MutationList() {
  const mutations = useMutationState()

  return (
    <ul>
      {mutations.map((mutation) => (
        <li key={mutation.id}>
          {mutation.variables.title} - {mutation.status}
        </li>
      ))}
    </ul>
  )
}
```

### Implementation

```typescript
// MutationClient class
class MutationClient {
  private mutations = new Map<string, MutationState>()
  private subscribers = new Set<(mutations: MutationState[]) => void>()

  subscribe(callback) {
    this.subscribers.add(callback)
    return () => this.subscribers.delete(callback)
  }

  getMutations(filters?: MutationFilters): MutationState[] {
    let mutations = Array.from(this.mutations.values())

    if (filters?.queryKey) {
      mutations = mutations.filter((m) =>
        JSON.stringify(m.queryKey) === JSON.stringify(filters.queryKey)
      )
    }

    if (filters?.status) {
      mutations = mutations.filter((m) => m.status === filters.status)
    }

    return mutations
  }

  addMutation(mutation: MutationState) {
    this.mutations.set(mutation.id, mutation)
    this.notify()
  }

  updateMutation(id: string, update: Partial<MutationState>) {
    const mutation = this.mutations.get(id)
    if (mutation) {
      Object.assign(mutation, update)
      this.notify()
    }
  }

  private notify() {
    this.subscribers.forEach((callback) => callback(this.getMutations()))
  }
}

// React hook
function useMutationState(filters?: MutationFilters) {
  const [mutations, setMutations] = useState(() =>
    mutationClient.getMutations(filters)
  )

  useEffect(() => {
    return mutationClient.subscribe((updated) => {
      setMutations(filters ? mutationClient.getMutations(filters) : updated)
    })
  }, [filters])

  return mutations
}
```

## Form Management

### Multi-Field Form

```typescript
function CreateUserForm() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    bio: '',
  })

  const createUser = useMutation(client.users.create)
  const createProfile = useMutation(client.profiles.create)

  const handleSubmit = async () => {
    const user = await createUser.mutateAsync({
      name: formData.name,
      email: formData.email,
    })

    await createProfile.mutateAsync({
      userId: user.id,
      bio: formData.bio,
    })
  }

  // Track both mutations
  const mutations = useMutationState({
    queryKey: ['users', 'profiles'],
  })

  const isPending = mutations.some((m) => m.status === 'pending')

  return (
    <form onSubmit={handleSubmit}>
      <input
        value={formData.name}
        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
      />
      <input
        value={formData.email}
        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
      />
      <textarea
        value={formData.bio}
        onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
      />

      <button type="submit" disabled={isPending}>
        {isPending ? 'Creating...' : 'Create'}
      </button>
    </form>
  )
}
```

### Optimistic UI with Mutation State

```typescript
function LikeButton({ postId }) {
  const { mutate, isPending } = useMutation(client.posts.like, {
    onMutate: async ({ postId }) => {
      // Optimistic update
      queryClient.setQueryData(['posts', postId], (old) => ({
        ...old,
        likes: old.likes + 1,
      }))
    },
    onError: () => {
      // Rollback handled automatically
    },
  })

  return (
    <button onClick={() => mutate({ postId })} disabled={isPending}>
      {isPending ? '...' : 'Like'}
    </button>
  )
}

// Track all like mutations globally
function LikeCount({ postId }) {
  const likeMutations = useMutationState({
    queryKey: ['posts', postId, 'like'],
  })

  const optimisticLikes = likeMutations.reduce(
    (sum, m) => sum + (m.variables?.optimisticLikes || 0),
    0
  )

  const { data } = useQuery(client.posts.get, { args: { id: postId } })

  return <span>{(data?.likes || 0) + optimisticLikes}</span>
}
```

### Pending Submissions

```typescript
function Dashboard() {
  const pendingMutations = useMutationState({
    status: 'pending',
  })

  return (
    <div>
      {pendingMutations.length > 0 && (
        <Notification>
          {pendingMutations.length} operation(s) in progress...
        </Notification>
      )}
    </div>
  )
}
```

### Error Display

```typescript
function MutationErrors() {
  const errorMutations = useMutationState({
    status: 'error',
  })

  return (
    <div>
      {errorMutations.map((mutation) => (
        <Alert key={mutation.id} variant="error">
          <strong>{mutation.error.message}</strong>
          <button onClick={() => mutation.reset()}>Dismiss</button>
        </Alert>
      ))}
    </div>
  )
}
```

## API Design

### useMutationState

```typescript
interface MutationFilters {
  queryKey?: QueryKey
  status?: 'idle' | 'pending' | 'success' | 'error'
  mutationKey?: string
}

interface UseMutationStateOptions {
  filters?: MutationFilters
  select?: (mutation: MutationState) => T
}

function useMutationState<T>(options?: UseMutationStateOptions): T[]
```

### MutationState

```typescript
interface MutationState<TData = unknown, TVariables = unknown, TError = Error> {
  id: string
  mutationKey?: string
  status: 'idle' | 'pending' | 'success' | 'error'
  variables: TVariables
  data?: TData
  error?: TError
  submittedAt: number
  updatedAt: number
  reset: () => void
  retry: () => void
}
```

## Use Cases

### 1. Global Loading State

```typescript
function GlobalLoader() {
  const pendingCount = useMutationState({
    status: 'pending',
  }).length

  return pendingCount > 0 ? <Spinner /> : null
}
```

### 2. Undo Queue

```typescript
function DeleteQueue() {
  const deleteMutations = useMutationState({
    mutationKey: ['delete'],
  })

  const handleUndo = async (mutation) => {
    await mutation.undo?.()
  }

  return (
    <div>
      {deleteMutations.map((m) => (
        <Toast key={m.id}>
          Deleted {m.variables.name}
          <button onClick={() => handleUndo(m)}>Undo</button>
        </Toast>
      ))}
    </div>
  )
}
```

### 3. Retry Failed Mutations

```typescript
function FailedMutations() {
  const failedMutations = useMutationState({
    status: 'error',
  })

  return (
    <div>
      {failedMutations.map((m) => (
        <Alert key={m.id}>
          {m.error.message}
          <button onClick={() => m.retry()}>Retry</button>
        </Alert>
      ))}
    </div>
  )
}
```

### 4. Mutation History

```typescript
function MutationHistory() {
  const mutations = useMutationState()

  const recentMutations = mutations
    .filter((m) => m.status === 'success')
    .slice(-10)
    .reverse()

  return (
    <ul>
      {recentMutations.map((m) => (
        <li key={m.id}>
          Created {m.variables.title} at{' '}
          {new Date(m.updatedAt).toLocaleTimeString()}
        </li>
      ))}
    </ul>
  )
}
```
