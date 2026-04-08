# OpenAPI Integration Analysis for @deessejs

## Executive Summary

This document analyzes how @deessejs, a tRPC-like TypeScript RPC library, could natively support OpenAPI/Swagger specifications. The research reveals that while tRPC-style architectures excel at type-safe RPC calls, integrating OpenAPI support requires careful mapping between RPC procedures and RESTful OpenAPI operations. Key findings include:

- **Existing libraries** (`trpc-openapi`, `trpc-to-openapi`) demonstrate the feasibility of bridging RPC and REST
- **OpenAPI 3.0.3** is the current standard, with 3.1 adding support for advanced JSON Schema features
- **Type mapping** between Zod schemas and OpenAPI schemas is well-supported
- **Key tradeoffs** include complexity, verbosity, and potential loss of RPC simplicity

---

## 1. OpenAPI Architecture Overview

### 1.1 Core Structure

OpenAPI 3.x defines APIs using a machine-readable document with these key components:

```yaml
openapi: 3.0.3
info:
  title: My API
  version: 1.0.0
servers:
  - url: https://api.example.com
paths:
  /users:
    get:
      summary: List users
      operationId: listUsers
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/User'
components:
  schemas:
    User:
      type: object
      properties:
        id:
          type: string
        name:
          type: string
```

### 1.2 Key Concepts

| Component | Purpose |
|-----------|---------|
| **Paths** | Individual endpoints (e.g., `/users`, `/users/{id}`) |
| **Operations** | HTTP methods on paths (GET, POST, PUT, DELETE, PATCH) |
| **Schemas** | Data type definitions using JSON Schema |
| **Parameters** | Path params, query params, headers |
| **Request Bodies** | For POST/PUT/PATCH with body content |
| **Responses** | Defined response types per status code |
| **Security** | Authentication schemes (Bearer, API Key, etc.) |

---

## 2. How tRPC/OpenAPI Integration Works

### 2.1 Existing Libraries

**trpc-openapi** (archived November 2024)

This library provided OpenAPI 3.0.3 support for tRPC procedures:

```typescript
import { initTRPC } from '@trpc/server';
import { OpenApiMeta } from 'trpc-openapi';
import { z } from 'zod';

const t = initTRPC.meta<OpenApiMeta>().create();

export const appRouter = t.router({
  sayHello: t.procedure
    .meta({ openapi: { method: 'GET', path: '/say-hello' } })
    .input(z.object({ name: z.string() }))
    .output(z.object({ greeting: z.string() }))
    .query(({ input }) => ({ greeting: `Hello ${input.name}!` }));
});
```

Generate OpenAPI document:

```typescript
import { generateOpenApiDocument } from 'trpc-openapi';

export const openApiDocument = generateOpenApiDocument(appRouter, {
  title: 'tRPC OpenAPI',
  version: '1.0.0',
  baseUrl: 'http://localhost:3000'
});
```

**Key features:**
- Path parameters via `/path/{param}` syntax
- Query parameters and request body support
- Authorization via Bearer token with `protect: true`
- TypeScript native with full type safety

**Alternative: trpc-to-openapi**

A newer alternative package providing similar functionality with some architectural differences.

### 2.2 Requirements for Integration

For any RPC-to-OpenAPI bridge to work:

1. **Input/Output validators** must use Zod (or similar) - cannot work with raw TypeScript types
2. **HTTP method mapping** must be explicitly defined per procedure
3. **Path structure** must follow REST conventions manually
4. **Both input and output** parsers are required

---

## 3. How @deessejs Could Generate OpenAPI Specs

### 3.1 Architecture Pattern

The @deessejs architecture follows tRPC's pattern:

```
@deessejs/core
  - initDRPC() / initDeesse() - Creates tRPC-like instance
  - publicProcedure - Base procedure with type inference
  - router() - Groups procedures
  - middleware() - Reusable procedure middleware

@deessejs/server
  - HTTP adapters (Express, Hono, Next.js)
  - OpenAPI spec generator

@deessejs/client
  - createClient() - Typed client
  - Links for HTTP transport
```

### 3.2 Proposed OpenAPI Integration

```typescript
// 1. Add OpenAPI metadata support to procedure meta
import { initDeesse } from '@deessejs/server';
import { OpenApiMeta } from '@deessejs/server/openapi';
import { z } from 'zod';

const d = initDeesse.meta<OpenApiMeta>().create();

export const appRouter = d.router({
  // Query -> GET operation
  getUser: d.procedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/users/{id}',
        description: 'Get a user by ID'
      }
    })
    .input(z.object({ id: z.string() }))
    .output(z.object({ id: z.string(), name: z.string(), email: z.string().email() }))
    .query(async ({ input }) => {
      return { id: input.id, name: 'John', email: 'john@example.com' };
    }),

  // Mutation -> POST operation
  createUser: d.procedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/users',
        description: 'Create a new user'
      }
    })
    .input(z.object({
      name: z.string().min(1),
      email: z.string().email()
    }))
    .output(z.object({ id: z.string(), name: z.string(), email: z.string().email() }))
    .mutation(async ({ input }) => {
      const id = await createUserInDb(input);
      return { id, ...input };
    }),
});

// 2. Generate OpenAPI document
import { generateOpenApiDocument } from '@deessejs/server/openapi';

export const openApiDocument = generateOpenApiDocument(appRouter, {
  title: 'Deesse API',
  version: '1.0.0',
  baseUrl: 'https://api.example.com',
  tags: ['users', 'posts'],
  description: 'Type-safe API with OpenAPI support'
});
```

### 3.3 Generated OpenAPI Output

```yaml
openapi: 3.0.3
info:
  title: Deesse API
  version: 1.0.0
paths:
  /users/{id}:
    get:
      operationId: getUser
      description: Get a user by ID
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/getUser'
components:
  schemas:
    getUser:
      type: object
      required:
        - id
        - name
        - email
      properties:
        id:
          type: string
        name:
          type: string
        email:
          type: string
          format: email
```

---

## 4. Type Mapping Between RPC and OpenAPI

### 4.1 Zod to OpenAPI Schema Conversion

| Zod Type | OpenAPI Schema |
|----------|----------------|
| `z.string()` | `{ type: "string" }` |
| `z.string().email()` | `{ type: "string", format: "email" }` |
| `z.string().uuid()` | `{ type: "string", format: "uuid" }` |
| `z.number()` | `{ type: "number" }` |
| `z.number().int()` | `{ type: "integer" }` |
| `z.boolean()` | `{ type: "boolean" }` |
| `z.array(z.string())` | `{ type: "array", items: { type: "string" } }` |
| `z.object({ ... })` | `{ type: "object", properties: { ... } }` |
| `z.enum([...])` | `{ type: "string", enum: [...] }` |
| `z.optional()` | Schema with `nullable: true` or omits required |
| `z.union([...])` | `{ oneOf: [...] }` |
| `z.record(z.string(), z.number())` | `{ type: "object", additionalProperties: { type: "number" } }` |

### 4.2 RPC Procedure Types to OpenAPI Operations

| Procedure Type | HTTP Method | Typical Usage |
|----------------|-------------|---------------|
| Query | GET | Read-only data fetch |
| Mutation | POST | Create operations |
| Mutation | PUT | Full update |
| Mutation | PATCH | Partial update |
| Mutation | DELETE | Delete operations |

### 4.3 Handling Complex Types

```typescript
// Nested objects
.input(z.object({
  profile: z.object({
    name: z.string(),
    avatar: z.string().url()
  }),
  roles: z.array(z.enum(['admin', 'user']))
}))

// Maps to OpenAPI:
{
  type: "object",
  properties: {
    profile: {
      type: "object",
      properties: {
        name: { type: "string" },
        avatar: { type: "string", format: "uri" }
      }
    },
    roles: {
      type: "array",
      items: { type: "string", enum: ["admin", "user"] }
    }
  }
}
```

---

## 5. Code Examples

### 5.1 Full @deessejs Server with OpenAPI

```typescript
// server/src/index.ts
import { initDeesse } from '@deessejs/server';
import { OpenApiMeta, generateOpenApiDocument } from '@deessejs/server/openapi';
import { z } from 'zod';

const d = initDeesse.meta<OpenApiMeta>().create();

// Reusable middleware
const authedProcedure = d.procedure.use(async (opts) => {
  if (!opts.ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
  }
  return opts.next({ ctx: { user: opts.ctx.user } });
});

export const appRouter = d.router({
  // Public query
  health: d.procedure
    .meta({ openapi: { method: 'GET', path: '/health' } })
    .output(z.object({ status: z.string() }))
    .query(() => ({ status: 'ok' })),

  // Authenticated query
  me: authedProcedure
    .meta({ openapi: { method: 'GET', path: '/users/me' } })
    .output(z.object({ id: z.string(), name: z.string(), email: z.string().email() }))
    .query(({ ctx }) => ctx.user),

  // Create user (public)
  createUser: d.procedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/users',
        protect: false // No auth required
      }
    })
    .input(z.object({
      name: z.string().min(1).max(100),
      email: z.string().email()
    }))
    .output(z.object({ id: z.string(), name: z.string(), email: z.string().email() }))
    .mutation(async ({ input }) => {
      const user = await db.users.create(input);
      return user;
    }),

  // Update user (authenticated)
  updateUser: authedProcedure
    .meta({
      openapi: {
        method: 'PATCH',
        path: '/users/{id}',
        headers: [{ name: 'X-Request-ID', schema: { type: 'string' } }]
      }
    })
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      email: z.string().email().optional()
    }))
    .output(z.object({ id: z.string(), name: z.string(), email: z.string().email() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.id !== input.id) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      return db.users.update(input.id, input);
    }),
});

// Generate OpenAPI document
export const openApiDocument = generateOpenApiDocument(appRouter, {
  title: 'My API',
  version: '1.0.0',
  baseUrl: process.env.API_URL || 'http://localhost:3000',
  description: 'Type-safe API with OpenAPI 3.0 support'
});
```

### 5.2 OpenAPI Document Output

```yaml
# Generated openapi.json
{
  "openapi": "3.0.3",
  "info": {
    "title": "My API",
    "version": "1.0.0",
    "description": "Type-safe API with OpenAPI 3.0 support"
  },
  "servers": [{ "url": "http://localhost:3000" }],
  "paths": {
    "/health": {
      "get": {
        "operationId": "health",
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/health" }
              }
            }
          }
        }
      }
    },
    "/users": {
      "post": {
        "operationId": "createUser",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": { "$ref": "#/components/schemas/createUser" }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/createUser" }
              }
            }
          }
        }
      }
    },
    "/users/{id}": {
      "get": { "operationId": "me", ... },
      "patch": { "operationId": "updateUser", ... }
    }
  },
  "components": {
    "schemas": {
      "health": {
        "type": "object",
        "properties": { "status": { "type": "string" } }
      }
    }
  }
}
```

---

## 6. Tooling Integration

### 6.1 OpenAPI Generator Tools

| Tool | Purpose | Language Support |
|------|---------|------------------|
| **openapi-generator** | Generates clients, servers, documentation | 50+ languages |
| **openapi-typescript** | Generates TypeScript types from OpenAPI schemas | TypeScript only |
| **openapi-fetch** | Ultra-fast fetch client generated from OpenAPI | TypeScript only |
| **swagger-codegen** | Legacy generator (replaced by openapi-generator) | 40+ languages |
| **typeschema** | Converts TypeScript types/Zod to JSON Schema | TypeScript |

### 6.2 Client Generation from OpenAPI

Using `openapi-typescript` to generate client types:

```bash
npm install openapi-typescript
npx openapi-typescript ./openapi.json --output ./src/client/types.ts
```

Generated types:
```typescript
// src/client/types.ts
export interface components {
  schemas: {
    health: {
      status: string;
    };
    createUser: {
      id: string;
      name: string;
      email: string;
    };
  };
}
```

Using `openapi-fetch` for type-safe API calls:

```typescript
import createClient from 'openapi-fetch';
import type { paths } from './client/types';

const client = createClient<paths>({ baseUrl: 'http://localhost:3000' });

// Fully typed - IDE autocomplete works!
const { data, error } = await client.get('/users/{id}', {
  params: { path: { id: '123' } },
  headers: { Authorization: `Bearer ${token}` }
});
```

### 6.3 API Testing Tools

**Postman**
- Import OpenAPI spec directly
- Auto-generates request examples
- Environment variables support
- Collection-based test suites

**Insomnia**
- OpenAPI import with workspace organization
- gRPC/REST/GraphQL support
- Code generation for 30+ languages

**Bruno**
- OpenAPI to Bruno format conversion
- Git-friendly API collections
- Offline-first design

### 6.4 Documentation Generation

```bash
# Using redoc-cli
npx redoc-cli bundle openapi.json -o docs.html

# Using swagger-ui
# Host swagger-ui with your OpenAPI spec
```

---

## 7. Implementation Considerations for @deessejs

### 7.1 Design Decisions

| Decision | Recommendation | Rationale |
|----------|----------------|-----------|
| OpenAPI version | 3.0.3 | Widely supported, stable |
| Schema validator | Zod | Type inference, ecosystem |
| Spec generator | Built-in | No external dependencies |
| Client types | openapi-typescript | Official TypeScript support |
| HTTP adapter | Pluggable | Express, Fastify, Hono, Next.js |

### 7.2 Metadata Schema Proposal

```typescript
interface OpenAPIMeta {
  openapi: {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    path: string;
    description?: string;
    tags?: string[];
    protect?: boolean;  // Requires authentication
    headers?: Array<{
      name: string;
      schema: JSONSchema;
      required?: boolean;
    }>;
    responses?: Record<
      number,
      { description: string; schema?: JSONSchema }
    >;
  };
}
```

### 7.3 Implementation Steps

1. **Phase 1: Core Support**
   - Add `OpenApiMeta` type
   - Create `generateOpenApiDocument()` function
   - Implement basic Zod-to-JSON-Schema converter

2. **Phase 2: HTTP Adapters**
   - Add `createOpenApiHttpHandler()` for Express
   - Add support for Fastify, Hono, Next.js
   - Handle path parameters, query params, request body

3. **Phase 3: Advanced Features**
   - Authentication schemes (Bearer, API Key)
   - Custom headers
   - Response headers
   - Error responses

4. **Phase 4: Ecosystem**
   - Generate client types
   - Create React Query integration
   - Add Postman/Insomnia collection export

### 7.4 Error Handling

Map tRPC error codes to HTTP status codes:

| TRPCError Code | HTTP Status |
|----------------|-------------|
| PARSE_ERROR | 400 Bad Request |
| BAD_REQUEST | 400 Bad Request |
| UNAUTHORIZED | 401 Unauthorized |
| FORBIDDEN | 403 Forbidden |
| NOT_FOUND | 404 Not Found |
| METHOD_NOT_SUPPORTED | 405 Method Not Allowed |
| TIMEOUT | 408 Request Timeout |
| CONFLICT | 409 Conflict |
| UNPROCESSABLE_CONTENT | 422 Unprocessable Entity |
| INTERNAL_SERVER_ERROR | 500 Internal Server Error |

---

## 8. REST vs RPC Tradeoffs

### 8.1 RPC Advantages

| Aspect | RPC/tRPC |
|--------|----------|
| **Type safety** | End-to-end without codegen |
| **Simplicity** | Function-like calls |
| **Developer experience** | IDE autocomplete on server types |
| **Bundle size** | No client library overhead |
| **Bidirectional types** | Changes propagate automatically |

### 8.2 REST/OpenAPI Advantages

| Aspect | REST/OpenAPI |
|--------|--------------|
| **Standardization** | Industry-wide convention |
| **Tooling** | Postman, Swagger, Insomnia |
| **Discoverability** | Self-documenting via spec |
| **Cross-language** | Any language can consume |
| **Documentation** | Auto-generated from spec |
| **Mocking** | Easy to create mock servers |

### 8.3 Hybrid Approach Benefits

By supporting both:

```typescript
// RPC call (for TypeScript clients)
const user = await deesseClient.users.get({ id: '123' });

// REST call (for external consumers)
GET /users/123

// Both use the same underlying procedure
export const getUser = procedure
  .meta({ openapi: { method: 'GET', path: '/users/{id}' } })
  .input(z.object({ id: z.string() }))
  .query(({ input }) => db.users.find(input.id));
```

### 8.4 When to Use Each

| Scenario | Recommendation |
|----------|----------------|
| TypeScript monorepo | RPC (tRPC/@deessejs) |
| Public API for external clients | REST/OpenAPI |
| Mobile apps | REST/OpenAPI (standard HTTP) |
| Internal microservices | gRPC or RPC |
| API for non-TypeScript teams | REST/OpenAPI |
| Real-time updates | WebSocket/SSE (separate protocol) |

---

## 9. Risks and Recommendations

### 9.1 Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Spec complexity** | Medium | Start with simple procedures, add features incrementally |
| **Schema drift** | Medium | Automate type generation, tests comparing spec to implementation |
| **Maintenance burden** | High | Keep OpenAPI support optional (not required) |
| **Breaking changes** | Medium | Version OpenAPI spec, support multiple versions |
| **Validation duplication** | Low | Share Zod-to-OpenAPI converter between server and tools |
| **trpc-openapi archive** | Medium | Fork and maintain or build native support |

### 9.2 Recommendations

1. **Make OpenAPI support optional** - Not all users need it
2. **Build on existing patterns** - Follow `trpc-openapi` architecture
3. **Prioritize Zod integration** - Leverage existing ecosystem
4. **Generate client types** - Use `openapi-typescript` for official clients
5. **Version the spec** - Include OpenAPI version in API versioning strategy
6. **Document limitations** - Some RPC patterns don't map cleanly to REST
7. **Test the spec** - Validate generated OpenAPI against actual behavior

### 9.3 Alternative Approaches

| Approach | Pros | Cons |
|----------|------|------|
| **Build native support** | Full control, no dependencies | More work |
| **Fork trpc-openapi** | Faster, proven approach | Maintenance burden |
| **Use trpc-to-openapi** | Active alternative | May lack features |
| **Separate REST layer** | Clean separation | Code duplication |
| **OpenAPI via middleware** | Non-invasive | Limited type mapping |

---

## 10. Conclusion

Integrating OpenAPI support into @deessejs is technically feasible and would provide significant value for projects needing to expose their RPC procedures as RESTful endpoints. The key insight is that tRPC-style procedures can be mapped to OpenAPI operations with proper metadata, though some RPC conveniences (like batching) would need to remain RPC-only.

The recommended approach is to build native OpenAPI support directly into @deessejs/server, following the patterns established by `trpc-openapi`. This should include:

- OpenAPI metadata types and validation
- Spec generation from procedure definitions
- HTTP handlers that conform to OpenAPI semantics
- Integration with openapi-typescript for client generation

OpenAPI support should remain optional, activated only when users provide the appropriate metadata, preserving the simplicity of @deessejs for internal RPC use cases.

---

## References

- [OpenAPI Specification 3.0.3](https://swagger.io/docs/specification/basic-structure/)
- [OpenAPI 3.1 Data Types](https://swagger.io/docs/specification/data-types/)
- [trpc-openapi GitHub](https://github.com/jlalmes/trpc-openapi) (archived)
- [trpc-to-openapi npm](https://www.npmjs.com/package/trpc-to-openapi)
- [openapi-generator](https://openapi-generator.tech/)
- [openapi-typescript](https://github.com/openapi-ts/openapi-typescript)
- [openapi-fetch](https://github.com/openapi-ts/openapi-fetch)
- [Zod](https://zod.dev)
- [TypeSchema](https://github.com/typeofschema/typeschema)
