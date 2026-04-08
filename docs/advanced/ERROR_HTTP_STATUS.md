# Error to HTTP Status Mapping

## Overview

The error mapping system translates `@deessejs/server` errors (`Result<T, E>`) into appropriate HTTP status codes. This is essential for SEO, monitoring tools (Sentry, Datadog), and proper CDN cache handling.

## The Problem

When using `Result<T, E>` pattern, errors are returned as HTTP 200 with a JSON body:

```typescript
// Handler returns
return err({ code: "NOT_FOUND", message: "User not found" })

// Current HTTP response
HTTP/1.1 200 OK
Content-Type: application/json

{ "ok": false, "error": { "code": "NOT_FOUND", "message": "User not found" } }

// Expected (for SEO, monitoring, CDNs)
HTTP/1.1 404 Not Found
Content-Type: application/json

{ "ok": false, "error": { "code": "NOT_FOUND", "message": "User not found" } }
```

## Default Mapping

| Error Code | HTTP Status | Description |
|------------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Authentication required |
| `FORBIDDEN` | 403 | Permission denied |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Invalid input |
| `DUPLICATE` | 409 | Conflict (e.g., email already exists) |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |
| `BAD_REQUEST` | 400 | Generic bad request |

## Usage

### Basic Error Mapping

```typescript
import { z } from "zod"

const getUser = t.query({
  args: z.object({
    id: z.number()
  }),
  handler: async (ctx, args) => {
    const user = await ctx.db.users.find(args.id)

    if (!user) {
      return err({ code: "NOT_FOUND", message: "User not found" })
    }

    return ok(user)
  }
})
```

When the user is not found, the HTTP response will be:

```http
HTTP/1.1 404 Not Found
Content-Type: application/json

{ "ok": false, "error": { "code": "NOT_FOUND", "message": "User not found" } }
```

### Authentication Error

```typescript
import { z } from "zod"

const login = t.mutation({
  args: z.object({
    email: z.string(),
    password: z.string()
  }),
  handler: async (ctx, args) => {
    const user = await ctx.db.users.authenticate(args.email, args.password)

    if (!user) {
      return err({ code: "UNAUTHORIZED", message: "Invalid credentials" })
    }

    return ok(user)
  }
})
```

Response:

```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{ "ok": false, "error": { "code": "UNAUTHORIZED", message: "Invalid credentials" } }
```

### Permission Error

```typescript
import { z } from "zod"

const deleteUser = t.mutation({
  args: z.object({
    id: z.number()
  }),
  handler: async (ctx, args) => {
    if (!ctx.isAdmin) {
      return err({ code: "FORBIDDEN", message: "Admin access required" })
    }

    await ctx.db.users.delete(args.id)
    return ok({ success: true })
  }
})
```

Response:

```http
HTTP/1.1 403 Forbidden
Content-Type: application/json

{ "ok": false, "error": { "code": "FORBIDDEN", message: "Admin access required" } }
```

## Configuration

### Custom Error Mapping

```typescript
const { t, createAPI } = defineContext({
  context: { db: myDatabase },
  errorMapping: {
    NOT_FOUND: 404,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    VALIDATION_ERROR: 400,
    DUPLICATE: 409,
    RATE_LIMITED: 429,
    INTERNAL_ERROR: 500,
  }
})
```

### Custom Error Codes

```typescript
// Define custom error codes with their HTTP status
const { t, createAPI } = defineContext({
  context: { db: myDatabase },
  errorMapping: {
    // Custom codes
    USER_SUSPENDED: 403,
    EMAIL_NOT_VERIFIED: 403,
    ACCOUNT_LOCKED: 423,
    PAYMENT_REQUIRED: 402,

    // Standard codes
    NOT_FOUND: 404,
    UNAUTHORIZED: 401,
  }
})
```

### Disable Mapping

```typescript
// Return all errors as 200 (for API compatibility)
const { t, createAPI } = defineContext({
  context: { db: myDatabase },
  errorMapping: false  // All errors return HTTP 200
})
```

## Error Definition

### Using defineErrors

```typescript
import { defineErrors } from "@deessejs/server"

const errors = defineErrors({
  NOT_FOUND: { message: "Resource not found", status: 404 },
  UNAUTHORIZED: { message: "Authentication required", status: 401 },
  FORBIDDEN: { message: "Permission denied", status: 403 },
  VALIDATION_ERROR: { message: "Invalid input", status: 400 },
  DUPLICATE: { message: "Resource already exists", status: 409 },
  RATE_LIMITED: { message: "Too many requests", status: 429 },
  INTERNAL_ERROR: { message: "An error occurred", status: 500 },
})

// Usage
return err(errors.NOT_FOUND)
```

### Typed Errors with Schema

```typescript
const errors = defineErrors({
  NOT_FOUND: {
    message: "User not found",
    status: 404,
    metadata: { resource: "user" }
  }
})

// Handler
return err(errors.NOT_FOUND)
// Returns: { code: "NOT_FOUND", message: "User not found", metadata: { resource: "user" } }
```

## Handling Thrown Errors

### Automatic Mapping

When a handler throws an exception:

```typescript
import { z } from "zod"

const getUser = t.query({
  args: z.object({
    id: z.number()
  }),
  handler: async (ctx, args) => {
    // This throws!
    throw new Error("Database connection failed")
  }
})
```

Response:

```http
HTTP/1.1 500 Internal Server Error
Content-Type: application/json

{ "ok": false, "error": { "code": "INTERNAL_ERROR", message: "Database connection failed" } }
```

### Custom Exception Handling

```typescript
const { t, createAPI } = defineContext({
  context: { db: myDatabase },
  errorMapping: {
    // Map specific exceptions to error codes
    ValidationError: "VALIDATION_ERROR",
    UnauthorizedError: "UNAUTHORIZED",
    ForbiddenError: "FORBIDDEN",
    NotFoundError: "NOT_FOUND",
  }
})
```

## Integration with Next.js

### Error Pages

Next.js automatically renders error pages based on HTTP status:

```typescript
// When 404 is returned
// Next.js renders the app/not-found.tsx page
```

### Monitoring Tools

HTTP status codes help monitoring tools categorize errors:

```typescript
// Sentry automatically captures 5xx errors
// You can filter by status code in Sentry dashboard
```

### CDN Caching

CDNs use status codes for cache invalidation:

```http
# 404s might be cached differently than 500s
# 401/403 are never cached
# 200s are cached
```

## Best Practices

### 1. Use Consistent Error Codes

```typescript
// Good
return err({ code: "NOT_FOUND", message: "User not found" })
return err({ code: "NOT_FOUND", message: "Post not found" })

// Bad
return err({ code: "USER_NOT_FOUND", message: "User not found" })
return err({ code: "POST_NOT_FOUND", message: "Post not found" })
```

### 2. Include Meaningful Messages

```typescript
// Good
return err({ code: "NOT_FOUND", message: "User with id 123 not found" })

// Bad
return err({ code: "NOT_FOUND", message: "Not found" })
```

### 3. Use Metadata for Debugging

```typescript
return err({
  code: "VALIDATION_ERROR",
  message: "Invalid user data",
  metadata: {
    field: "email",
    reason: "Invalid email format"
  }
})
```

## Future Considerations

- Error code versioning
- Error code deprecation warnings
- Automatic OpenAPI schema generation from errors
- Error code documentation auto-generation
