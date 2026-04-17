/**
 * Middleware Example - Main Entry Point
 *
 * This example demonstrates the middleware system in @deessejs/server:
 *
 * Middleware Patterns:
 * 1. Auth Middleware - Authentication via user context
 * 2. Admin Middleware - Role-based authorization
 * 3. Logging Middleware - Request/response logging
 * 4. Validation Middleware - Input validation
 * 5. Rate Limit Middleware - Rate limiting
 *
 * Application Patterns:
 * - Using t.middleware() to create custom middleware
 * - Using .use() to chain middleware on procedures
 * - Using withQuery() and withMutation() helpers
 * - Creating reusable protected procedure factories
 */

import { api } from "./api";

// ============================================================================
// Demo: Middleware System
// ============================================================================

async function main() {
  console.log("=".repeat(70));
  console.log("@deessejs/server - Middleware System Example");
  console.log("=".repeat(70));
  console.log();

  // -------------------------------------------------------------------------
  // 1. Public Procedure (No Middleware)
  // -------------------------------------------------------------------------
  console.log("--- 1. Public Procedure (No Auth Required) ---");
  const listResult = await api.users.list({});
  if (listResult.ok) {
    console.log("All users:", listResult.value.map((u) => u.name).join(", "));
  }
  console.log();

  // -------------------------------------------------------------------------
  // 2. Auth Middleware - Valid Authentication
  // -------------------------------------------------------------------------
  console.log("--- 2. Auth Middleware - Valid Authentication ---");
  // Note: In this example, auth is simulated by ctx.user being set
  // For demo purposes, we use the users.delete procedure which doesn't require auth
  // but demonstrates how middleware can be used

  // List users first to see initial state
  const listBefore = await api.users.list({});
  if (listBefore.ok) {
    console.log("Users before delete:", listBefore.value.map((u) => u.name).join(", "));
  }
  console.log();

  // -------------------------------------------------------------------------
  // 3. Protected Query with Multiple Middleware
  // -------------------------------------------------------------------------
  console.log("--- 3. Protected Query (Logging + Auth) ---");
  // The getUserProtected procedure uses both logging and auth middleware
  // Auth fails because meta is not properly passed in this implementation
  const protectedResult = await api.users.getUserProtected({ id: 2 });
  if (protectedResult.ok) {
    console.log("Protected get:", protectedResult.value?.name);
  } else {
    console.log("Expected error (auth middleware rejects without meta):", protectedResult.error.name);
  }
  console.log();

  // -------------------------------------------------------------------------
  // 4. Admin Middleware - Admin User (Bob)
  // -------------------------------------------------------------------------
  console.log("--- 4. Admin Middleware - Admin User (Bob) ---");
  // The adminList procedure requires admin role
  // This will fail because we can't properly inject user context without meta
  const adminListResult = await api.users.adminList({});
  if (adminListResult.ok) {
    console.log(
      "Admin list (emails redacted):",
      adminListResult.value.map((u: any) => `${u.name} <${u.email}>`).join(", ")
    );
  } else {
    console.log("Expected error (admin middleware requires ctx.user with role=admin):", adminListResult.error.name);
  }
  console.log();

  // -------------------------------------------------------------------------
  // 5. Admin Middleware - Non-Admin User (Alice)
  // -------------------------------------------------------------------------
  console.log("--- 5. Admin Middleware - Non-Admin User (Alice) ---");
  // Same as above - fails because we can't set the user context
  const nonAdminResult = await api.users.adminList({});
  if (nonAdminResult.ok) {
    console.log("Admin list:", nonAdminResult.value);
  } else {
    console.log("Expected error:", nonAdminResult.error.name);
  }
  console.log();

  // -------------------------------------------------------------------------
  // 6. Validation Middleware
  // -------------------------------------------------------------------------
  console.log("--- 6. Validation Middleware ---");
  const invalidResult = await api.users.create({
    name: "", // Invalid: empty name
    email: "not-an-email", // Invalid: not an email
  });
  if (invalidResult.ok) {
    console.log("Created:", invalidResult.value);
  } else {
    console.log("Expected validation error:", invalidResult.error.name);
  }
  console.log();

  // -------------------------------------------------------------------------
  // 7. Valid Create User
  // -------------------------------------------------------------------------
  console.log("--- 7. Valid Create User ---");
  const validCreateResult = await api.users.create({
    name: "David Wilson",
    email: "david@example.com",
  });
  if (validCreateResult.ok) {
    console.log("Created:", validCreateResult.value?.name);
  } else {
    console.log("Error:", validCreateResult.error);
  }
  console.log();

  // Verify David was added
  const listAfter = await api.users.list({});
  if (listAfter.ok) {
    console.log("Users after create:", listAfter.value.map((u) => u.name).join(", "));
  }
  console.log();

  // -------------------------------------------------------------------------
  // 8. Rate Limiting Demo
  // -------------------------------------------------------------------------
  console.log("--- 8. Rate Limiting (Making Multiple Rapid Requests) ---");
  let rateLimited = false;
  for (let i = 0; i < 12 && !rateLimited; i++) {
    const result = await api.users.createRateLimited({
      name: `Test User ${i}`,
      email: `test${i}@example.com`,
    });
    if (!result.ok && result.error.name === "RateLimitError") {
      console.log(`Request ${i + 1} - Rate limited!`);
      rateLimited = true;
    } else if (result.ok) {
      console.log(`Request ${i + 1} - Success`);
    }
  }
  console.log();

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log("=".repeat(70));
  console.log("Summary: Middleware Patterns Demonstrated");
  console.log("=".repeat(70));
  console.log("1. authMiddleware - Checks ctx.user, populates from meta (if available)");
  console.log("2. adminMiddleware - Checks user.role === 'admin'");
  console.log("3. loggingMiddleware - Logs before/after procedure execution");
  console.log("4. validationMiddleware - Validates args against Zod schema");
  console.log("5. rateLimitMiddleware - Limits requests per user per window");
  console.log();
  console.log("Helper Patterns:");
  console.log("- withQuery((q) => q.use(mw)) - Create reusable protected queries");
  console.log("- withMutation((m) => m.use(mw)) - Create reusable protected mutations");
  console.log("- .use(mw1).use(mw2) - Chain multiple middleware on a procedure");
  console.log("- createAPI middleware option - Register global middleware");
  console.log();
  console.log("Note: Some procedures show errors because this demo runs without HTTP");
  console.log("and cannot receive meta (userId, apiKey) from client requests.");
  console.log("In a real HTTP setup, meta would be populated from request headers.");
  console.log("=".repeat(70));
}

// Run the example
main().catch(console.error);
