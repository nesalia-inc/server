import { createHonoHandler } from "@deessejs/server-hono";
import type { HTTPClient } from "@deessejs/server-hono";
import type { NextRequest } from "next/server.js";

type NextjsHandler = (request: Request | NextRequest) => Promise<Response>;

/**
 * Next.js handler object with HTTP methods
 */
export interface NextHandler {
  GET: NextjsHandler;
  POST: NextjsHandler;
  PUT: NextjsHandler;
  PATCH: NextjsHandler;
  DELETE: NextjsHandler;
  OPTIONS: NextjsHandler;
}

/**
 * Creates a Next.js handler from a deesse API client
 * Uses Hono internally for routing and procedure execution
 */
export function createNextHandler(client: HTTPClient): NextHandler {
  const app = createHonoHandler(client);

  const handler: NextjsHandler = (request) => {
    return app.fetch(request) as Promise<Response>;
  };

  return {
    GET: handler,
    POST: handler,
    PUT: handler,
    PATCH: handler,
    DELETE: handler,
    OPTIONS: handler,
  };
}