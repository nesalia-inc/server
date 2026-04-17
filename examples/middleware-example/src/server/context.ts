/**
 * Context Definition with Middleware System
 *
 * This file sets up the application context and demonstrates:
 * - Creating custom middleware using t.middleware()
 * - Registering middleware globally with createAPI
 * - Using .use() to chain middleware on procedures
 * - Using withQuery and withMutation helper functions
 */

import { defineContext } from "@deessejs/server";

// ============================================================================
// Type Definitions
// ============================================================================

// User entity for demo purposes
interface User {
  id: number;
  name: string;
  email: string;
  role: "user" | "admin";
  apiKey?: string;
}

// Request metadata passed by clients
interface RequestMeta {
  userId?: number;
  apiKey?: string;
  requestId?: string;
  timestamp?: number;
}

// Application context type
interface Context {
  db: {
    users: User[];
    nextUserId: number;
    auditLogs: string[];
  };
  logger: Console;
}

// ============================================================================
// Create Context
// ============================================================================

const { t, createAPI } = defineContext({
  context: {
    db: {
      users: [
        { id: 1, name: "Alice Johnson", email: "alice@example.com", role: "user" },
        { id: 2, name: "Bob Smith", email: "bob@example.com", role: "admin" },
        { id: 3, name: "Charlie Brown", email: "charlie@example.com", role: "user" },
      ],
      nextUserId: 4,
      auditLogs: [],
    },
    logger: console,
  } as Context,
});

export { t, createAPI };
