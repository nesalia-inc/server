/**
 * User Router
 *
 * This module defines the user-related procedures (queries and mutations).
 * It demonstrates how to use ctx.send() to emit events from mutations.
 */

import { t } from "../context";
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

const ValidationError = error({
  name: "ValidationError",
  message: (args: { field: string; message: string }) =>
    `Validation error on ${args.field}: ${args.message}`,
});

// ============================================================================
// Middleware Examples
// ============================================================================

/**
 * Auth Middleware
 *
 * Demonstrates how to create authentication middleware using t.middleware().
 * This middleware checks if a user is present in the context (simulating auth).
 * If no user is found, it short-circuits the request with an unauthorized error.
 */
const authMiddleware = t.middleware({
  name: "auth",
  handler: async (ctx, { next, meta }) => {
    // Simulate auth check - in real apps, you'd check a token/session
    // Here we use a custom header passed via meta for demonstration
    const userId = meta?.userId as number | undefined;

    if (!userId) {
      ctx.logger.log("[AUTH] No userId provided, rejecting request");
      return err(
        error({
          name: "UnauthorizedError",
          message: () => "Not authenticated",
        })({})
      );
    }

    ctx.logger.log(`[AUTH] User ${userId} authenticated, proceeding`);
    // Note: In real apps, you'd extend the Context type to include user
    // For this example, we use type assertion since user is dynamically added
    return next({ ctx: { ...ctx, user: { id: userId } } as typeof ctx });
  },
});

/**
 * Admin Middleware
 *
 * Demonstrates chaining middleware with .use().
 * This middleware checks if the user has admin role.
 * Applied AFTER authMiddleware, so it runs in sequence.
 */
const adminMiddleware = t.middleware({
  name: "admin",
  handler: async (ctx, { next }) => {
    // Check if user has admin role (simulated via ctx.user.isAdmin)
    const user = (ctx as any).user;
    if (!user?.isAdmin) {
      ctx.logger.log("[ADMIN] User is not admin, rejecting request");
      return err(
        error({
          name: "ForbiddenError",
          message: () => "Admin access required",
        })({})
      );
    }

    ctx.logger.log("[ADMIN] User is admin, proceeding");
    return next({ ctx });
  },
});

/**
 * Logging Middleware
 *
 * Demonstrates logging middleware that runs before and after procedures.
 * This middleware doesn't modify context, just observes.
 */
const loggingMiddleware = t.middleware({
  name: "logger",
  handler: async (ctx, { next, args, meta }) => {
    const procedureName = meta?.procedureName as string || "unknown";
    ctx.logger.log(`[LOGGER] Before ${procedureName} with args:`, args);

    const result = await next({ ctx });

    if (result.ok) {
      ctx.logger.log(`[LOGGER] ${procedureName} succeeded`);
    } else {
      ctx.logger.log(`[LOGGER] ${procedureName} failed:`, result.error);
    }

    return result;
  },
});

// ============================================================================
// Protected Procedure Helpers using withQuery and withMutation
// ============================================================================

/**
 * Reusable protected query creator using withQuery helper
 *
 * Pattern 1: Direct middleware application
 *   const authQuery = (query) => withQuery(query, authMiddleware);
 *
 * Pattern 2: Curried form for composition
 *   const authQuery = withQuery((q) => q.use(authMiddleware));
 */
const authQuery = withQuery((q: ReturnType<typeof t.query>) =>
  q.use(authMiddleware)
);

/**
 * Reusable protected mutation creator using withMutation helper
 *
 * Pattern 1: Direct middleware application
 *   const authMutation = (mutation) => withMutation(mutation, authMiddleware);
 *
 * Pattern 2: Curried form for composition
 *   const authMutation = withMutation((m) => m.use(authMiddleware));
 */
const authMutation = withMutation((m: ReturnType<typeof t.mutation>) =>
  m.use(authMiddleware)
);

/**
 * Admin mutation with composed middleware chain
 *
 * Using withMutation with composition to chain multiple middleware:
 *   withMutation((m) => m.use(adminMiddleware).use(authMiddleware))
 *
 * Middleware is applied in order - authMiddleware runs first, then adminMiddleware.
 */
const adminMutation = withMutation((m: ReturnType<typeof t.mutation>) =>
  m.use(adminMiddleware).use(authMiddleware)
);

// ============================================================================
// User CRUD Procedures
// ============================================================================

// Query: List all users (with logging middleware)
const listUsers = t.query({
  handler: async (ctx) => {
    return ok([...ctx.db.users]);
  },
}).use(loggingMiddleware);

// Query: Get user by ID (with auth middleware)
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
}).use(authMiddleware);

// Query: Get user profile (with auth and logging middleware chained)
// This demonstrates chaining multiple middleware with .use()
const getProfile = t.query({
  handler: async (ctx) => {
    const user = (ctx as any).user;
    if (!user) {
      return err(
        error({
          name: "NotFoundError",
          message: () => "Profile not found",
        })({})
      );
    }
    const dbUser = ctx.db.users.find((u) => u.id === user.id);
    return ok(dbUser || null);
  },
})
  .use(loggingMiddleware)
  .use(authMiddleware);

// Query: Admin-only list (with auth + admin middleware)
// Demonstrates chaining middleware for role-based access control
const adminListUsers = t.query({
  handler: async (ctx) => {
    ctx.logger.log("[ADMIN] Returning all users including sensitive data");
    return ok(ctx.db.users.map((u) => ({ ...u, email: `[REDACTED]` })));
  },
})
  .use(loggingMiddleware)
  .use(authMiddleware)
  .use(adminMiddleware);

// Mutation: Create a new user
const createUser = t.mutation({
  args: z.object({
    name: z.string().min(1, "Name is required").max(100),
    email: z.string().email("Invalid email address"),
  }),
  handler: async (ctx, args) => {
    // Check for duplicate email
    const existing = ctx.db.users.find((u) => u.email === args.email);
    if (existing) {
      return err(
        ValidationError({
          field: "email",
          message: "Email already in use",
        })
      );
    }

    // Create the user
    const user = {
      id: ctx.db.nextUserId++,
      name: args.name,
      email: args.email,
    };

    ctx.db.users.push(user);

    // Emit event on success - events are only emitted if the mutation succeeds
    ctx.send("user.created", {
      id: user.id,
      email: user.email,
      name: user.name,
    });

    // Also emit an email event for welcome email
    ctx.send("email.sent", {
      to: user.email,
      template: "welcome",
      subject: "Welcome to our platform!",
    });

    return ok(user);
  },
});

// Mutation: Update an existing user
const updateUser = t.mutation({
  args: z.object({
    id: z.number().int().positive(),
    name: z.string().min(1).max(100).optional(),
    email: z.string().email().optional(),
  }),
  handler: async (ctx, args) => {
    const userIndex = ctx.db.users.findIndex((u) => u.id === args.id);
    if (userIndex === -1) {
      return err(NotFoundError({ id: args.id }));
    }

    const user = ctx.db.users[userIndex];
    const changes: Record<string, unknown> = {};

    // Apply updates and track changes
    if (args.name !== undefined && args.name !== user.name) {
      changes.name = { from: user.name, to: args.name };
      user.name = args.name;
    }

    if (args.email !== undefined && args.email !== user.email) {
      // Check for duplicate email
      const emailExists = ctx.db.users.find(
        (u) => u.email === args.email && u.id !== args.id
      );
      if (emailExists) {
        return err(
          ValidationError({
            field: "email",
            message: "Email already in use",
          })
        );
      }
      changes.email = { from: user.email, to: args.email };
      user.email = args.email;
    }

    // Only emit if there were actual changes
    if (Object.keys(changes).length > 0) {
      ctx.send("user.updated", {
        id: user.id,
        changes,
      });
    }

    return ok(user);
  },
});

// Mutation: Delete a user
const deleteUser = t.mutation({
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

    // Emit deletion event
    ctx.send("user.deleted", { id: user.id });

    return ok({ deleted: true, id: args.id });
  },
});

// ============================================================================
// Protected Procedures using withQuery and withMutation helpers
// ============================================================================

/**
 * Protected Query: Get current user (uses withQuery helper)
 * Demonstrates applying auth middleware using withQuery helper
 */
const getCurrentUser = authQuery(
  t.query({
    handler: async (ctx) => {
      const user = (ctx as any).user;
      if (!user) {
        return err(
          error({
            name: "NotFoundError",
            message: () => "Not authenticated",
          })({})
        );
      }
      const dbUser = ctx.db.users.find((u) => u.id === user.id);
      return ok(dbUser || null);
    },
  })
);

/**
 * Protected Mutation: Admin delete user (uses adminMutation helper)
 * Demonstrates chaining middleware using withMutation composition
 *
 * Usage: withMutation((m) => m.use(adminMiddleware).use(authMiddleware))
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

      ctx.logger.log(`[ADMIN] User ${user.id} deleted by admin`);
      ctx.send("user.deleted", { id: user.id });

      return ok({ deleted: true, id: args.id });
    },
  })
);

/**
 * Protected Mutation: Update own profile (uses authMutation helper)
 * Demonstrates applying auth middleware using withMutation helper
 */
const updateMyProfile = authMutation(
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
      const changes: Record<string, unknown> = {};

      if (args.name !== undefined && args.name !== dbUser.name) {
        changes.name = { from: dbUser.name, to: args.name };
        dbUser.name = args.name;
      }

      if (args.email !== undefined && args.email !== dbUser.email) {
        changes.email = { from: dbUser.email, to: args.email };
        dbUser.email = args.email;
      }

      if (Object.keys(changes).length > 0) {
        ctx.send("user.updated", { id: dbUser.id, changes });
      }

      return ok(dbUser);
    },
  })
);

// ============================================================================
// Export Router
// ============================================================================

export const usersRouter = t.router({
  list: listUsers,
  get: getUser,
  profile: getProfile,
  adminList: adminListUsers,
  create: createUser,
  update: updateUser,
  delete: deleteUser,
  // Protected procedures using withQuery and withMutation helpers:
  getCurrentUser,
  adminDeleteUser,
  updateMyProfile,
});
