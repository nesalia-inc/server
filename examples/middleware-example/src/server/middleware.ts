/**
 * Middleware Definitions
 *
 * This module demonstrates how to create custom middleware using t.middleware().
 * Middleware in @deessejs/server is a function that wraps procedure execution,
 * allowing you to run code before and after the procedure handler.
 *
 * Middleware patterns demonstrated:
 * 1. Auth Middleware - Authentication check (checks ctx.user)
 * 2. Admin Middleware - Authorization check for admin-only procedures
 * 3. Logging Middleware - Request/response logging
 * 4. Validation Middleware - Input validation
 * 5. RateLimit Middleware - Rate limiting simulation
 */

import { t } from "./context";
import { error } from "@deessejs/fp";
import { z } from "zod";

// ============================================================================
// Error Definitions
// ============================================================================

const UnauthorizedError = error({
  name: "UnauthorizedError",
  message: () => "Not authenticated - please provide valid credentials",
});

const ForbiddenError = error({
  name: "ForbiddenError",
  message: () => "Access denied - insufficient permissions",
});

const ValidationError = error({
  name: "ValidationError",
  message: (args: { field: string; message: string }) =>
    `Validation error on ${args.field}: ${args.message}`,
});

const RateLimitError = error({
  name: "RateLimitError",
  message: (args: { retryAfter: number }) =>
    `Rate limit exceeded. Retry after ${args.retryAfter} seconds`,
});

// ============================================================================
// Type Definitions
// ============================================================================

// Extend the Context type to include user
interface User {
  id: number;
  name: string;
  email: string;
  role: "user" | "admin";
}

interface AuthenticatedContext {
  user?: User;
}

// ============================================================================
// Middleware Definitions
// ============================================================================

/**
 * Auth Middleware
 *
 * Demonstrates authentication middleware that checks for ctx.user.
 * This middleware:
 * - Checks if user exists in context (set by global middleware or previous middleware)
 * - Injects the authenticated user into context for downstream use
 *
 * Usage:
 *   const protectedQuery = t.query({ ... }).use(authMiddleware);
 *   const protectedMutation = t.mutation({ ... }).use(authMiddleware);
 */
export const authMiddleware = t.middleware({
  name: "auth",
  handler: async (ctx, { next }) => {
    const authCtx = ctx as typeof ctx & AuthenticatedContext;
    ctx.logger.log("[AUTH] Checking authentication...");

    if (!authCtx.user) {
      ctx.logger.log("[AUTH] No user in context - rejecting");
      return {
        ok: false,
        error: UnauthorizedError({}),
      };
    }

    ctx.logger.log(`[AUTH] User ${authCtx.user.id} authenticated successfully`);
    return next({ ctx: authCtx as typeof ctx });
  },
});

/**
 * Admin Middleware
 *
 * Demonstrates authorization middleware that checks for admin role.
 * This middleware:
 * - Assumes authMiddleware has already run (user is in ctx)
 * - Checks if user.role === 'admin'
 * - Used to protect admin-only procedures
 *
 * Note: Middleware order matters! Admin middleware should be used AFTER
 * authMiddleware so that ctx.user is available.
 *
 * Usage:
 *   const adminProcedure = t.query({ ... }).use(authMiddleware).use(adminMiddleware);
 */
export const adminMiddleware = t.middleware({
  name: "admin",
  handler: async (ctx, { next }) => {
    const authCtx = ctx as typeof ctx & AuthenticatedContext;
    ctx.logger.log("[ADMIN] Checking admin privileges...");

    if (!authCtx.user) {
      ctx.logger.log("[ADMIN] No user in context - auth middleware likely not run");
      return {
        ok: false,
        error: UnauthorizedError({}),
      };
    }

    if (authCtx.user.role !== "admin") {
      ctx.logger.log(`[ADMIN] User ${authCtx.user.id} is not admin - access denied`);
      return {
        ok: false,
        error: ForbiddenError({}),
      };
    }

    ctx.logger.log(`[ADMIN] User ${authCtx.user.id} is admin - access granted`);
    return next({ ctx: authCtx as typeof ctx });
  },
});

/**
 * Logging Middleware
 *
 * Demonstrates logging middleware that tracks procedure execution.
 * This middleware:
 * - Logs before and after procedure execution
 * - Captures timing information
 * - Records success/failure outcomes
 *
 * Usage:
 *   const loggedQuery = t.query({ ... }).use(loggingMiddleware);
 */
export const loggingMiddleware = t.middleware({
  name: "logger",
  handler: async (ctx, { next, args, meta }) => {
    const procedureName = (meta as any)?.procedureName || "unknown";
    const startTime = Date.now();

    ctx.logger.log(`[LOGGER] -> ${procedureName} called with:`, args);

    const result = await next({ ctx });

    const duration = Date.now() - startTime;
    if (result.ok) {
      ctx.logger.log(`[LOGGER] <- ${procedureName} succeeded in ${duration}ms`);
    } else {
      ctx.logger.log(
        `[LOGGER] <- ${procedureName} failed in ${duration}ms:`,
        result.error
      );
    }

    return result;
  },
});

/**
 * Validation Middleware
 *
 * Demonstrates input validation middleware.
 * This middleware:
 * - Validates input arguments against a schema
 * - Returns early with validation errors if args are invalid
 * - Allows valid requests to proceed to the handler
 *
 * Usage:
 *   const validatedMutation = withMutation(
 *     t.mutation({ ... }),
 *     validationMiddleware(schema)
 *   );
 */
export function validationMiddleware(schema: z.ZodSchema) {
  return t.middleware({
    name: "validation",
    handler: async (ctx, { next, args }) => {
      ctx.logger.log("[VALIDATION] Validating input...");

      const result = schema.safeParse(args);
      if (!result.success) {
        const firstError = result.error.errors[0];
        ctx.logger.log(`[VALIDATION] Failed: ${firstError.message}`);
        return {
          ok: false,
          error: ValidationError({
            field: firstError.path.join("."),
            message: firstError.message,
          }),
        };
      }

      ctx.logger.log("[VALIDATION] Input is valid");
      return next({ ctx });
    },
  });
}

/**
 * Rate Limit Middleware (Simple Implementation)
 *
 * Demonstrates rate limiting middleware.
 * This middleware:
 * - Tracks requests per user in a simple map
 * - Blocks requests that exceed the limit
 * - Simulates rate limiting without external dependencies
 *
 * Note: This is a simple in-memory implementation. For production,
 * use Redis or another distributed rate limiter.
 *
 * Usage:
 *   const rateLimitedQuery = t.query({ ... }).use(rateLimitMiddleware);
 */
const requestCounts = new Map<number, { count: number; resetAt: number }>();

export const rateLimitMiddleware = t.middleware({
  name: "rateLimit",
  handler: async (ctx, { next, meta }) => {
    const authCtx = ctx as typeof ctx & AuthenticatedContext;
    const userId = authCtx.user?.id;

    if (!userId) {
      // Allow unauthenticated requests but log it
      ctx.logger.log("[RATE-LIMIT] No userId, allowing without limit tracking");
      return next({ ctx });
    }

    const now = Date.now();
    const limit = 10; // requests
    const windowMs = 60000; // 1 minute window

    let userRequest = requestCounts.get(userId);

    if (!userRequest || now > userRequest.resetAt) {
      // New window
      userRequest = { count: 0, resetAt: now + windowMs };
      requestCounts.set(userId, userRequest);
    }

    userRequest.count++;
    ctx.logger.log(
      `[RATE-LIMIT] User ${userId}: ${userRequest.count}/${limit} requests`
    );

    if (userRequest.count > limit) {
      const retryAfter = Math.ceil((userRequest.resetAt - now) / 1000);
      ctx.logger.log(
        `[RATE-LIMIT] User ${userId} exceeded limit, retry after ${retryAfter}s`
      );
      return {
        ok: false,
        error: RateLimitError({ retryAfter }),
      };
    }

    return next({ ctx });
  },
});

// ============================================================================
// Re-export for convenience
// ============================================================================

export { UnauthorizedError, ForbiddenError, ValidationError, RateLimitError };
