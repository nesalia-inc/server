/**
 * @deessejs/server API definition
 *
 * This file defines the API procedures that will be exposed via Next.js.
 * Internal operations (internalQuery, internalMutation) are NOT exposed via HTTP.
 *
 * PER-REQUEST CONTEXT PATTERN:
 * This example demonstrates using createContext factory for per-request context
 * with auth user extraction from HTTP headers.
 */

import { defineContext, createPublicAPI } from "@deessejs/server";
import { ok, err, error } from "@deessejs/fp";
import { z } from "zod";
import type { RequestInfo } from "@deessejs/server";

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

const UnauthorizedError = error({
  name: "UnauthorizedError",
  message: "Authentication required",
});

// ============================================================================
// Mock Database
// ============================================================================

interface User {
  id: number;
  name: string;
  email: string;
  role: "admin" | "user";
}

const db = {
  users: [
    { id: 1, name: "Alice", email: "alice@example.com", role: "admin" },
    { id: 2, name: "Bob", email: "bob@example.com", role: "user" },
  ] as User[],
  nextId: 3,
};

// ============================================================================
// Context Types - define what data is available in procedure handlers
// ============================================================================

interface AuthUser {
  id: number;
  email: string;
  role: "admin" | "user";
}

interface AppContext {
  db: typeof db;
  logger: Console;
  user: AuthUser | null; // Will be set per-request from auth header
}

// ============================================================================
// Define Context and API
// ============================================================================

/**
 * Using createContext factory for per-request context.
 *
 * This pattern allows extracting user info from HTTP headers on each request.
 * The requestInfo includes headers, method, url - available from HTTP adapter.
 */
const { t, createAPI } = defineContext({
  createContext: (requestInfo?: RequestInfo): AppContext => ({
    db,
    logger: console,
    // Extract user from Authorization header (simplified auth pattern)
    // In production, you'd validate a JWT or session token
    user: requestInfo?.headers?.authorization
      ? extractUserFromToken(requestInfo.headers.authorization)
      : null,
  }),
});

/**
 * Simulated token extraction - in production, decode JWT or validate session
 */
function extractUserFromToken(authHeader: string): AuthUser | null {
  // Format: "Bearer user_123" or similar
  const match = authHeader.match(/^Bearer\s+(\w+)$/);
  if (!match) return null;

  const token = match[1];
  // Simulate lookup - in real app, validate JWT or session
  if (token.startsWith("admin_")) {
    return { id: 1, email: "alice@example.com", role: "admin" };
  }
  if (token.startsWith("user_")) {
    return { id: 2, email: "bob@example.com", role: "user" };
  }
  return null;
}

// ============================================================================
// Define Procedures
// ============================================================================

// Query: List all users (public - no auth required)
const listUsers = t.query({
  handler: async (ctx) => {
    ctx.logger.log("listUsers called, user:", ctx.user?.email ?? "anonymous");
    return ok(ctx.db.users);
  },
});

// Query: Get user by ID (public - no auth required)
const getUser = t.query({
  args: z.object({ id: z.number() }),
  handler: async (ctx, args) => {
    ctx.logger.log(`getUser(${args.id}) called, user:`, ctx.user?.email ?? "anonymous");
    const user = ctx.db.users.find((u) => u.id === args.id);
    if (!user) {
      return err(NotFoundError({ resource: "User", id: args.id }));
    }
    return ok(user);
  },
});

// Mutation: Create a new user (requires authentication)
const createUser = t.mutation({
  args: z.object({
    name: z.string().min(1),
    email: z.string().email(),
  }),
  handler: async (ctx, args) => {
    // Auth check - require user to be authenticated
    if (!ctx.user) {
      return err(UnauthorizedError({}));
    }

    ctx.logger.log(`createUser called by:`, ctx.user.email);

    const existing = ctx.db.users.find((u) => u.email === args.email);
    if (existing) {
      return err(ConflictError({ field: "email", value: args.email }));
    }
    const user: User = {
      id: ctx.db.nextId++,
      name: args.name,
      email: args.email,
      role: "user",
    };
    ctx.db.users.push(user);
    return ok(user);
  },
});

// Mutation: Delete user (requires admin role)
const deleteUser = t.mutation({
  args: z.object({ id: z.number() }),
  handler: async (ctx, args) => {
    // Auth check - require admin role
    if (!ctx.user) {
      return err(UnauthorizedError({}));
    }
    if (ctx.user.role !== "admin") {
      return err(error({
        name: "ForbiddenError",
        message: "Admin role required"
      })({}));
    }

    ctx.logger.log(`deleteUser(${args.id}) called by:`, ctx.user.email);

    const index = ctx.db.users.findIndex((u) => u.id === args.id);
    if (index === -1) {
      return err(NotFoundError({ resource: "User", id: args.id }));
    }
    ctx.db.users.splice(index, 1);
    return ok({ deleted: true });
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
    delete: deleteUser,
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
