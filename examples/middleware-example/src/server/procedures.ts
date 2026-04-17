/**
 * Procedures with Middleware Examples
 *
 * This module demonstrates various ways to apply middleware to procedures:
 *
 * 1. Direct .use() chaining on procedures
 * 2. Using withQuery() and withMutation() helper functions
 * 3. Creating reusable protected procedure factories
 * 4. Chaining multiple middleware in sequence
 */

import { t, createAPI } from "./context";
import {
  authMiddleware,
  adminMiddleware,
  loggingMiddleware,
  rateLimitMiddleware,
  validationMiddleware,
} from "./middleware";
import { withQuery, withMutation } from "@deessejs/server";
import { ok, err, error } from "@deessejs/fp";
import { z } from "zod";

// ============================================================================
// Error Definitions
// ============================================================================

const NotFoundError = error({
  name: "NotFoundError",
  message: (args: { id: number }) => `User with ID ${args.id} not found`,
});

// ============================================================================
// Reusable Protected Procedure Factories
// ============================================================================

/**
 * Pattern 1: Create protected query using withQuery helper (curried form)
 *
 * withQuery((q) => q.use(middleware)) returns a function that takes a query
 * and applies the middleware to it. This is useful for creating reusable
 * middleware configurations.
 *
 * Usage:
 *   const protectedQuery = protectedQueryFactory(t.query({ ... }));
 */
const protectedQuery = withQuery((q: ReturnType<typeof t.query>) =>
  q.use(authMiddleware)
);

/**
 * Pattern 2: Create protected mutation using withMutation helper (curried form)
 *
 * Same as protectedQuery but for mutations. Creates a factory function that
 * applies authMiddleware to any mutation.
 *
 * Usage:
 *   const protectedMutation = protectedMutationFactory(t.mutation({ ... }));
 */
const protectedMutation = withMutation((m: ReturnType<typeof t.mutation>) =>
  m.use(authMiddleware)
);

/**
 * Pattern 3: Admin mutation factory using composition
 *
 * Chains multiple middleware: authMiddleware runs first, then adminMiddleware.
 * The order matters - authMiddleware populates ctx.user, then adminMiddleware
 * checks if user is an admin.
 *
 * Usage:
 *   const adminMutation = adminMutationFactory(t.mutation({ ... }));
 */
const adminMutation = withMutation(
  (m: ReturnType<typeof t.mutation>) => m.use(adminMiddleware).use(authMiddleware)
);

/**
 * Pattern 4: Query with logging using withQuery
 *
 * Adds logging middleware to any query for observability.
 *
 * Usage:
 *   const loggedQuery = loggedQueryFactory(t.query({ ... }));
 */
const loggedQuery = withQuery((q: ReturnType<typeof t.query>) =>
  q.use(loggingMiddleware)
);

/**
 * Pattern 5: Mutation with rate limiting using withMutation
 *
 * Adds rate limiting to prevent abuse.
 *
 * Usage:
 *   const rateLimitedMutation = rateLimitedMutationFactory(t.mutation({ ... }));
 */
const rateLimitedMutation = withMutation((m: ReturnType<typeof t.mutation>) =>
  m.use(rateLimitMiddleware)
);

// ============================================================================
// Public Procedures (No Middleware)
// ============================================================================

/**
 * Public Query: List all users
 *
 * No authentication required. This is useful for public endpoints like
 * listing publicly available information.
 */
const listUsers = t.query({
  handler: async (ctx) => {
    ctx.logger.log("[HANDLER] listUsers called");
    return ok(ctx.db.users);
  },
});

/**
 * Public Query: Get user by ID
 *
 * A basic query that shows argument validation with Zod.
 */
const getUser = t.query({
  args: z.object({
    id: z.number().int().positive("ID must be a positive integer"),
  }),
  handler: async (ctx, args) => {
    const user = ctx.db.users.find((u) => u.id === args.id);
    if (!user) {
      return err(NotFoundError({ id: args.id }));
    }
    return ok(user);
  },
});

/**
 * Public Mutation: Create a new user (with validation middleware)
 *
 * Uses validationMiddleware to validate input before the handler runs.
 */
const createUser = withMutation(
  t.mutation({
    args: z.object({
      name: z.string().min(1, "Name is required").max(100),
      email: z.string().email("Invalid email address"),
      role: z.enum(["user", "admin"]).default("user"),
    }),
    handler: async (ctx, args) => {
      // Check for duplicate email
      const existing = ctx.db.users.find((u) => u.email === args.email);
      if (existing) {
        return err(
          error({
            name: "ValidationError",
            message: () => "Email already in use",
          })({})
        );
      }

      const user = {
        id: ctx.db.nextUserId++,
        name: args.name,
        email: args.email,
        role: args.role ?? "user",
      };

      ctx.db.users.push(user);
      ctx.db.auditLogs.push(`User ${user.id} created`);

      return ok(user);
    },
  }),
  validationMiddleware(
    z.object({
      name: z.string().min(1).max(100),
      email: z.string().email(),
    })
  )
);

// ============================================================================
// Protected Procedures (With Auth Middleware)
// ============================================================================

/**
 * Protected Query: Get user by ID (requires auth)
 *
 * Demonstrates chaining multiple middleware with .use().
 * Logging runs first, then auth. The order of .use() matters:
 * .use(loggingMiddleware).use(authMiddleware) means logging runs before auth.
 */
const getUserProtected = t
  .query({
    args: z.object({
      id: z.number().int().positive(),
    }),
    handler: async (ctx, args) => {
      const user = ctx.db.users.find((u) => u.id === args.id);
      if (!user) {
        return err(NotFoundError({ id: args.id }));
      }
      return ok(user);
    },
  })
  .use(loggingMiddleware)
  .use(authMiddleware);

/**
 * Protected Mutation: Update own profile
 *
 * Uses protectedMutation factory which applies authMiddleware.
 * This demonstrates how to create reusable middleware patterns.
 */
const updateMyProfile = protectedMutation(
  t.mutation({
    args: z.object({
      name: z.string().min(1).max(100).optional(),
      email: z.string().email().optional(),
    }),
    handler: async (ctx, args) => {
      const user = (ctx as any).user;
      if (!user) {
        return err(
          error({
            name: "UnauthorizedError",
            message: () => "Not authenticated",
          })({})
        );
      }

      const userIndex = ctx.db.users.findIndex((u) => u.id === user.id);
      if (userIndex === -1) {
        return err(NotFoundError({ id: user.id }));
      }

      const dbUser = ctx.db.users[userIndex];

      if (args.name !== undefined) {
        dbUser.name = args.name;
      }
      if (args.email !== undefined) {
        dbUser.email = args.email;
      }

      ctx.db.auditLogs.push(`User ${dbUser.id} updated their profile`);

      return ok(dbUser);
    },
  })
);

// ============================================================================
// Admin-Only Procedures (With Auth + Admin Middleware)
// ============================================================================

/**
 * Admin Query: List all users with sensitive data
 *
 * Uses both authMiddleware and adminMiddleware via chaining.
 * Middleware runs in order: logging -> auth -> admin
 */
const adminListUsers = t
  .query({
    handler: async (ctx) => {
      ctx.logger.log("[ADMIN] Returning all users with sensitive data");
      return ok(
        ctx.db.users.map((u) => ({
          ...u,
          email: "[REDACTED]",
        }))
      );
    },
  })
  .use(loggingMiddleware)
  .use(authMiddleware)
  .use(adminMiddleware);

/**
 * Admin Mutation: Delete any user
 *
 * Uses adminMutation factory which chains auth and admin middleware.
 * This demonstrates creating admin-only mutations.
 */
const adminDeleteUser = adminMutation(
  t.mutation({
    args: z.object({
      id: z.number().int().positive(),
    }),
    handler: async (ctx, args) => {
      const userIndex = ctx.db.users.findIndex((u) => u.id === args.id);
      if (userIndex === -1) {
        return err(NotFoundError({ id: args.id }));
      }

      const user = ctx.db.users[userIndex];
      ctx.db.users.splice(userIndex, 1);

      ctx.db.auditLogs.push(`Admin deleted user ${user.id}`);

      return ok({ deleted: true, id: args.id });
    },
  })
);

// ============================================================================
// Rate Limited Procedures
// ============================================================================

/**
 * Rate Limited Mutation: Create multiple users
 *
 * Demonstrates rate limiting middleware.
 * Users are limited to 10 requests per minute.
 */
const createUserRateLimited = rateLimitedMutation(
  t.mutation({
    args: z.object({
      name: z.string().min(1).max(100),
      email: z.string().email(),
    }),
    handler: async (ctx, args) => {
      const existing = ctx.db.users.find((u) => u.email === args.email);
      if (existing) {
        return err(
          error({
            name: "ValidationError",
            message: () => "Email already in use",
          })({})
        );
      }

      const user = {
        id: ctx.db.nextUserId++,
        name: args.name,
        email: args.email,
        role: "user" as const,
      };

      ctx.db.users.push(user);
      return ok(user);
    },
  })
);

// ============================================================================
// Export Router
// ============================================================================

export const usersRouter = t.router({
  // Public procedures
  list: listUsers,
  get: getUser,
  create: createUser,

  // Protected procedures (auth required)
  getUserProtected,
  updateMyProfile,

  // Admin-only procedures (auth + admin required)
  adminList: adminListUsers,
  adminDelete: adminDeleteUser,

  // Rate limited
  createRateLimited: createUserRateLimited,
});

export type UsersRouter = typeof usersRouter;