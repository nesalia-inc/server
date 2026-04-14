/**
 * Client-side API wrapper for @deessejs/server
 *
 * Uses @deessejs/client-react for type-safe React Query hooks.
 */

import { createClient } from "@deessejs/client-react";
import { FetchTransport } from "@deessejs/client";
import type { AppRouter } from "@/server/api";

// Create client with fetch transport
const transport = new FetchTransport("/api");
export const client = createClient<AppRouter>({ transport });
