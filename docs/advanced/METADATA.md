# Metadata & Reflection System

## Overview

The metadata system allows extracting information about your API routes, including input/output schemas, descriptions, and examples. This enables automatic documentation generation, OpenAPI/Swagger specs, and developer tooling.

## Extract Metadata

### Basic Usage

```typescript
import { createAPI, extractMetadata } from "@deessejs/server"

const api = createAPI({
  router: t.router({
    users: t.router({
      get: getUser,
      create: createUser,
      delete: deleteUser
    })
  })
})

// Extract metadata
const metadata = extractMetadata(api)

console.log(metadata)
/*
{
  routes: {
    "users.get": {
      path: "users.get",
      type: "query",
      args: { id: "number" },
      output: { id: "number", name: "string" },
      description: "Get a user by ID"
    },
    "users.create": {
      path: "users.create",
      type: "mutation",
      args: { name: "string", email: "string" },
      output: { id: "number", name: "string" }
    }
  }
}
*/
```

### With Descriptions

```typescript
const getUser = t.query({
  description: "Get a user by their unique ID",
  args: z.object({
    id: z.number().describe("The user's unique identifier")
  }),
  handler: async (ctx, args) => { ... }
})

const createUser = t.mutation({
  description: "Create a new user",
  summary: "Create User",
  deprecated: false,
  tags: ["users", "crud"],
  args: z.object({
    name: z.string().describe("The user's full name"),
    email: z.string().email().describe("The user's email address")
  }),
  handler: async (ctx, args) => { ... }
})
```

## OpenAPI Generation

### Generate OpenAPI Spec

```typescript
import { generateOpenAPI } from "@deessejs/server"

const openapi = generateOpenAPI(api, {
  info: {
    title: "My API",
    version: "1.0.0",
    description: "User management API"
  },
  servers: [
    { url: "https://api.example.com", description: "Production" },
    { url: "https://staging.example.com", description: "Staging" }
  ]
})

console.log(openapi)
/*
{
  openapi: "3.0.0",
  info: { title: "My API", version: "1.0.0" },
  paths: {
    "/users.get": {
      post: {
        operationId: "users.get",
        summary: "Get a user",
        tags: ["users"],
        requestBody: {
          content: {
            "application/json": {
              schema: { type: "object", properties: { id: { type: "number" } } }
            }
          }
        },
        responses: {
          "200": {
            description: "User found",
            content: { "application/json": { schema: { ... } } }
          }
        }
      }
    }
  }
}
*/
```

### Save as JSON

```typescript
import { generateOpenAPI } from "@deessejs/server"
import { writeFile } from "fs/promises"

const openapi = generateOpenAPI(api)

await writeFile("./openapi.json", JSON.stringify(openapi, null, 2))
```

## Route Information

### List All Routes

```typescript
import { listRoutes } from "@deessejs/server"

const routes = listRoutes(api)

console.log(routes)
/*
[
  { path: "users.get", type: "query", internal: false },
  { path: "users.create", type: "mutation", internal: false },
  { path: "users.delete", type: "internalMutation", internal: true },
  { path: "users.adminStats", type: "internalQuery", internal: true }
]
*/
```

### Filter Routes

```typescript
// Only public routes
const publicRoutes = listRoutes(api, { internal: false })

// Only queries
const queries = listRoutes(api, { type: "query" })

// Only mutations
const mutations = listRoutes(api, { type: "mutation" })

// By tag
const userRoutes = listRoutes(api, { tags: ["users"] })
```

## Schema Information

### Extract Input Schema

```typescript
import { getInputSchema, getOutputSchema } from "@deessejs/server"

const inputSchema = getInputSchema(api.users.get)
const outputSchema = getOutputSchema(api.users.get)

console.log(inputSchema)
// { type: "object", properties: { id: { type: "number" } } }

console.log(outputSchema)
// { type: "object", properties: { id: { type: "number" }, name: { type: "string" } } }
```

### Convert to JSON Schema

```typescript
import { toJsonSchema } from "@deessejs/server"

const jsonSchema = toJsonSchema(z.object({
  name: z.string(),
  email: z.string().email()
}))

console.log(jsonSchema)
/*
{
  type: "object",
  properties: {
    name: { type: "string" },
    email: { type: "string", format: "email" }
  },
  required: ["name", "email"]
}
*/
```

## Documentation Generation

### HTML Documentation

```typescript
import { generateDocs } from "@deessejs/server"

const html = generateDocs(api, {
  title: "API Documentation",
  theme: "dark",
  sidebar: true
})

// Serve HTML
await writeFile("./docs/index.html", html)
```

### Markdown Generation

```typescript
import { generateMarkdown } from "@deessejs/server"

const markdown = generateMarkdown(api)

console.log(markdown)
/*
# API Documentation

## users.get

Get a user by ID

### Input

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | number | Yes | The user's unique identifier |

### Output

| Field | Type |
|-------|------|
| id | number |
| name | string |

## users.create

Create a new user
...
*/
```

## Client SDK Generation

### Generate TypeScript Client

```typescript
import { generateClient } from "@deessejs/server"

const clientCode = generateClient(api, {
  language: "typescript",
  clientName: "MyApiClient"
})

console.log(clientCode)
/*
export class MyApiClient {
  async users_get(args: { id: number }) {
    return fetch('/api/users.get', { body: JSON.stringify(args) })
  }

  async users_create(args: { name: string; email: string }) {
    return fetch('/api/users.create', { body: JSON.stringify(args) })
  }
}
*/
```

### Generate JavaScript Client

```typescript
import { generateClient } from "@deessejs/server"

const clientCode = generateClient(api, {
  language: "javascript",
  clientName: "MyApiClient"
})
```

## API Reference

### extractMetadata

```typescript
function extractMetadata(api: API): Metadata

type Metadata = {
  version: string
  routes: Record<string, RouteMetadata>
}

type RouteMetadata = {
  path: string
  type: "query" | "mutation" | "internalQuery" | "internalMutation"
  description?: string
  summary?: string
  deprecated?: boolean
  tags?: string[]
  args: Record<string, Schema>
  output: Record<string, Schema>
}
```

### generateOpenAPI

```typescript
function generateOpenAPI(
  api: API,
  options: {
    info: {
      title: string
      version: string
      description?: string
    }
    servers?: Array<{ url: string; description?: string }>
    security?: SecurityRequirement[]
  }
): OpenAPISpec
```

### listRoutes

```typescript
function listRoutes(
  api: API,
  filters?: {
    internal?: boolean
    type?: "query" | "mutation" | "internalQuery" | "internalMutation"
    tags?: string[]
  }
): RouteInfo[]

type RouteInfo = {
  path: string
  type: string
  internal: boolean
}
```

## Use Cases

### API Explorer UI

```typescript
// Build an interactive API explorer
app.get("/explorer", (c) => {
  const routes = listRoutes(api)
  return c.html(renderExplorer(routes))
})
```

### Postman Collection

```typescript
import { generatePostmanCollection } from "@deessejs/server"

const collection = generatePostmanCollection(api, {
  name: "My API",
  baseUrl: "https://api.example.com"
})
```

### TypeScript Types

```typescript
import { generateTypes } from "@deessejs/server"

const types = generateTypes(api)

console.log(types)
/*
export type UsersGetArgs = { id: number }
export type UsersGetOutput = { id: number; name: string }

export type UsersCreateArgs = { name: string; email: string }
export type UsersCreateOutput = { id: number; name: string }
*/
```

## Best Practices

### Document Routes

```typescript
// Always add descriptions
const getUser = t.query({
  description: "Retrieves a user by their unique identifier",
  summary: "Get User",
  tags: ["users"],
  args: z.object({
    id: z.number().describe("The user's unique ID")
  }),
  handler: async (ctx, args) => { ... }
})
```

### Version Your API

```typescript
const api = createAPI({
  router: t.router({ ... }),
  metadata: {
    version: "1.0.0"
  }
})
```

### Deprecate Gracefully

```typescript
const oldEndpoint = t.query({
  deprecated: true,
  deprecatedMessage: "Use users.getV2 instead",
  args: z.object({ id: z.number() }),
  handler: async (ctx, args) => { ... }
})
```

## Future Considerations

- GraphQL schema generation
- gRPC schema generation
- SDK generation for multiple languages
- API versioning support
- Rate limiting metadata
- Custom metadata fields
