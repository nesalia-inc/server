# 3.7 Type-Level Programming for Route Safety

## Mathematical Principle

**Dependent types** and **type-level computation** allow expressing properties as types:
- `type-level strings` for route names
- `type-level lists` for route paths
- `type-level natural numbers` for arity

## Practical Implementation

```typescript
// Type-level route definition
type Route = [string, ...Route[]]  // Non-empty tuple

// Route existence proof
type HasRoute<Routes extends Route, Path extends Route> =
  Path extends Routes ? true
  : Path extends [infer First, ...infer Rest]
    ? First extends Routes[number]
      ? HasRoute<Routes, Rest>
      : false
    : false

// Safe router access
type SafeRouter<Routes extends Record<string, Route>> = {
  [K in keyof Routes & string]: HasRoute<Routes, [K]> extends true
    ? RouterNode<Routes[K]>
    : never  // Type error if route doesn't exist!
}

// Usage:
type AppRoutes = {
  'users.get': ['users', 'get']
  'users.create': ['users', 'create']
  'posts.get': ['posts', 'get']
}

// This works:
type UsersGetPath = AppRoutes['users.get']  // ['users', 'get']

// This causes type error:
type Invalid = AppRoutes['invalid']  // Error: 'invalid' not in AppRoutes

// Safe access:
const getRoute = <
  Routes extends Record<string, Route>,
  Path extends Route
>(
  router: SafeRouter<Routes>,
  path: Path & HasRoute<Routes, Path> extends true ? Path : never
): Procedure => {
  // Implementation
}

// Usage:
getRoute(router, ['users', 'get'])  // ✅ Valid
getRoute(router, ['users', 'delete'])  // ❌ Type error! 'users.delete' not in routes
```
