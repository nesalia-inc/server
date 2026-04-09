# Gap Analysis

## 2.1 Leaky Abstractions in Current Design

### Gap 1: Direct Context Mutation

The `extend` function in plugins returns `Partial<Ctx>` which is merged imperatively:

```typescript
// CURRENT (LEAKY)
extend: (ctx) => ({
  userId: null,  // This mutates the context object!
  isAuthenticated: false,
})
```

**Problem:** No guarantee that context properties are immutable. Plugin order matters in ways that are not type-enforced.

**Should be:** Context extension as a **functorial operation** that preserves input context and produces new context.

---

### Gap 2: Error Handling is Ad-Hoc

Handlers throw errors directly:

```typescript
handler: async (ctx, args) => {
  if (!user) {
    throw { code: "NOT_FOUND", message: "User not found" }; // Raw object
  }
}
```

**Problem:** No type safety on error codes. No way to compose error handling across middleware layers.

**Should be:** Errors as a proper **monadic monoid** with typed error codes and composable error transformations.

---

### Gap 3: Hooks Break the Monoidal Structure

The current hook system:

```typescript
const getUser = t.query({ ... })
  .beforeInvoke(...)
  .onSuccess(...)
  .onError(...)
```

**Problem:** Hooks are attached imperatively and don't compose well. Adding hooks changes the type of the procedure in ways that aren't tracked.

**Should be:** Hooks as **monoidal actions** on procedures, composable via product/coproduct.

---

### Gap 4: Plugin Lifecycle is Implicitly Sequential

The plugin execution order is documented as sequential:

```
onInvoke (plugins 1→2→3)
```

**Problem:** This ordering is an implicit runtime constraint. There's no type-level guarantee about execution order.

**Should be:** Plugins as **functors on the procedure category** with explicit composition order via monoidal product.

---

## 2.2 Missing Algebraic Structures

| Current | Missing | Why It Matters |
|---------|---------|----------------|
| `defineContext()` | **Coproduct (Either type)** | Type-safe union of context types |
| `t.query/mutation()` | **Product types** | Combine queries into batch operations |
| Hooks | **Monoid actions** | Composable side-effect operations |
| `Router` | **Category structure** | Routes form morphisms, composition is path concatenation |
| `Plugin` | **Kleisli category** | Plugins as morphisms with context extension |

---

## 2.3 Type-Level Gaps

1. **No route existence proofs**: `api.users.get` could fail at runtime if "users" or "get" doesn't exist
2. **No type-safe event names**: Events use string names that could be typos
3. **No type-level cache key validation**: Cache keys are runtime strings
4. **No dependent types for args**: Args shape depends on runtime schema
