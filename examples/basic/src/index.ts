/**
 * Basic example of @deessejs/server
 *
 * This example demonstrates:
 * - defineContext() - creating a context with a database
 * - t.query() - defining public read operations
 * - t.mutation() - defining public write operations
 * - t.internalQuery() - defining server-only read operations
 * - t.router() - organizing procedures hierarchically
 * - createAPI() - creating an executable API
 * - Direct method access: api.users.list({}) instead of api.execute("users.list", {})
 */

import { defineContext } from "@deessejs/server";
import { ok, err, error } from "@deessejs/fp";
import { z } from "zod";

// ============================================================================
// Error Definitions
// ============================================================================

const NotFoundError = error({
  name: "NotFoundError",
  message: (args: { resource: string; id: number }) =>
    `${args.resource} ${args.id} not found`,
});

const ConflictError = error({
  name: "ConflictError",
  message: (args: { field: string; value: string }) =>
    `${args.field} "${args.value}" already exists`,
});

// ============================================================================
// 1. Mock Database
// ============================================================================

interface User {
  id: number;
  name: string;
  email: string;
}

// In-memory "database"
const db = {
  users: [
    { id: 1, name: "Alice", email: "alice@example.com" },
    { id: 2, name: "Bob", email: "bob@example.com" },
  ] as User[],
  nextId: 3,
};

// ============================================================================
// 2. Define Context
// ============================================================================

const { t, createAPI } = defineContext({
  context: {
    db,
    logger: console,
  },
});

// ============================================================================
// 3. Define Procedures
// ============================================================================

// Query: Get all users
const listUsers = t.query({
  handler: async (ctx) => {
    return ok(ctx.db.users);
  },
});

// Query: Get user by ID
const getUser = t.query({
  args: z.object({ id: z.number() }),
  handler: async (ctx, args) => {
    const user = ctx.db.users.find((u) => u.id === args.id);
    if (!user) {
      return err(NotFoundError({ resource: "User", id: args.id }));
    }
    return ok(user);
  },
});

// Mutation: Create a new user
const createUser = t.mutation({
  args: z.object({
    name: z.string().min(1),
    email: z.string().email(),
  }),
  handler: async (ctx, args) => {
    const existing = ctx.db.users.find((u) => u.email === args.email);
    if (existing) {
      return err(ConflictError({ field: "email", value: args.email }));
    }
    const user: User = {
      id: ctx.db.nextId++,
      name: args.name,
      email: args.email,
    };
    ctx.db.users.push(user);
    return ok(user);
  },
});

// Internal Query: Get user count (not exposed via HTTP)
const getUserCount = t.internalQuery({
  handler: async (ctx) => {
    return ok({ count: ctx.db.users.length });
  },
});

// ============================================================================
// 4. Create API Router
// ============================================================================

const appRouter = t.router({
  users: t.router({
    list: listUsers,
    get: getUser,
    create: createUser,
    count: getUserCount, // Internal - won't be exposed via HTTP
  }),
});

// ============================================================================
// 5. Create API Instance
// ============================================================================

const api = createAPI({
  router: appRouter,
});

// ============================================================================
// 6. Execute Locally (Server-side)
// ============================================================================

async function main() {
  console.log("=== @deessejs/server Basic Example ===\n");

  // NEW SYNTAX: Direct method access (RECOMMENDED)
  console.log("--- Using Direct Method Access (api.users.list({})) ---");

  // List all users
  console.log("1. List all users:");
  const listResult = await api.users.list({});
  if (listResult.ok) {
    console.log("   Success:", listResult.value);
  }

  // Get user by ID
  console.log("\n2. Get user by ID:");
  const getResult = await api.users.get({ id: 1 });
  if (getResult.ok) {
    console.log("   Success:", getResult.value);
  } else {
    console.log("   Error:", getResult.error);
  }

  // Get non-existent user
  console.log("\n3. Get non-existent user (id: 999):");
  const notFoundResult = await api.users.get({ id: 999 });
  if (notFoundResult.ok) {
    console.log("   Success:", notFoundResult.value);
  } else {
    console.log("   Error:", notFoundResult.error);
  }

  // Create a new user
  console.log("\n4. Create new user:");
  const createResult = await api.users.create({ name: "Charlie", email: "charlie@example.com" });
  if (createResult.ok) {
    console.log("   Success:", createResult.value);
  } else {
    console.log("   Error:", createResult.error);
  }

  // Try to create duplicate email
  console.log("\n5. Try duplicate email:");
  const duplicateResult = await api.users.create({ name: "Duplicate", email: "alice@example.com" });
  if (duplicateResult.ok) {
    console.log("   Success:", duplicateResult.value);
  } else {
    console.log("   Error:", duplicateResult.error);
  }

  // Internal query (server-only) - still works with direct access
  console.log("\n6. Internal query (getUserCount):");
  const countResult = await api.users.count({});
  if (countResult.ok) {
    console.log("   Success:", countResult.value);
  }
  // Direct method access (api.users.list({})) is the recommended pattern
  // See the example above for usage
  console.log("
--- All tests completed ---");


  console.log("\n=== Done ===");
}

main().catch(console.error);
