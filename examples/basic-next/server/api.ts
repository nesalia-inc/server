/**
 * @deessejs/server API definition
 *
 * This file defines the API procedures that will be exposed via Next.js.
 * Internal operations (internalQuery, internalMutation) are NOT exposed via HTTP.
 */

import { defineContext, createPublicAPI } from "@deessejs/server";
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
// Mock Database
// ============================================================================

interface User {
  id: number;
  name: string;
  email: string;
}

const db = {
  users: [
    { id: 1, name: "Alice", email: "alice@example.com" },
    { id: 2, name: "Bob", email: "bob@example.com" },
  ] as User[],
  nextId: 3,
};

// ============================================================================
// Define Context and API
// ============================================================================

const { t, createAPI } = defineContext({
  context: {
    db,
    logger: console,
  },
});

// ============================================================================
// Define Procedures
// ============================================================================

// Query: List all users
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

// Internal Query: Get user count (NOT exposed via HTTP)
const getUserCount = t.internalQuery({
  handler: async (ctx) => {
    return ok({ count: ctx.db.users.length });
  },
});

// ============================================================================
// Create API Router
// ============================================================================

const appRouter = t.router({
  users: t.router({
    list: listUsers,
    get: getUser,
    create: createUser,
    count: getUserCount, // Internal - NOT exposed via HTTP
  }),
});

// ============================================================================
// Create API Instances
// ============================================================================

// Full API (for server-side use - can call internal operations)
export const api = createAPI({
  router: appRouter,
});

// Client API (for HTTP exposure - only query and mutation)
export const publicAPI = createPublicAPI(api);

// Type export for client
export type AppRouter = typeof appRouter;
