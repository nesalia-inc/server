import { Hono } from "hono";
import type { HTTPClient } from "./types.js";
import { getHTTPStatus } from "./errors.js";
import type { Error } from "@deessejs/fp";

interface RequestInfo {
  headers?: Record<string, string>;
  method?: string;
  url?: string;
  [key: string]: unknown;
}

/**
 * Converts a path like "users/get" to "users.get" for procedure lookup
 */
function normalizePath(path: string): string {
  return path.replace(/\//g, ".");
}

/**
 * Checks if a method is a mutation method
 */
function isMutationMethod(method: string): boolean {
  return method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
}

/**
 * Creates a Hono handler from a deesse API client
 */
export function createHonoHandler(client: HTTPClient): Hono {
  const app = new Hono();

  // Register route for all procedures
  // The route captures the path after /api/ prefix
  app.all("/api/:path{.*}", async (c) => {
    // Get the path without the /api/ prefix
    const rawPath = c.req.param("path") || "";
    const path = normalizePath(rawPath);
    const method = c.req.method;

    // Determine args based on method
    let args: Record<string, unknown> = {};
    if (isMutationMethod(method)) {
      // For mutations, parse JSON body
      try {
        const body = await c.req.json();
        // Unwrap args if client wrapped them as { args: {...} }
        args = body.args ?? body;
      } catch {
        args = {};
      }
    } else {
      // For queries, parse search params
      const queryParams = c.req.queries();
      args = queryParams as Record<string, unknown>;
    }

    const requestInfo: RequestInfo = {
      headers: c.req.header(),
      method: c.req.method,
      url: c.req.url,
    };

    // Cast to any to avoid TypeScript confusion with intersection of APIInstance & RouterProxy
    // The execute method signature is correctly defined in APIInstance
    const result = await (client as { execute(route: string, args: unknown, requestInfo?: RequestInfo): Promise<{ ok: boolean; value?: unknown; error?: Error }> }).execute(path, args, requestInfo);

    if (result.ok) {
      return c.json(result);
    }

    // Map error code to HTTP status
    const error = result.error as Error | undefined;
    const status = getHTTPStatus(error?.name);
    return c.json(result, status as 400 | 401 | 403 | 404 | 409 | 500);
  });

  return app;
}
