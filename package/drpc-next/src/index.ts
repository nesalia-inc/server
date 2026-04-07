/**
 * @deessejs/drpc-next
 *
 * Next.js integration for DRPC (Distributed Remote Procedure Call)
 *
 * Usage:
 * ```typescript
 * import { client } from "@/server/drpc"
 * import { toNextJsHandler } from "@deessejs/drpc-next"
 *
 * export const { GET, POST, PUT, PATCH, DELETE } = toNextJsHandler(client)
 * ```
 */

import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

type DRPCClient = Record<string, unknown>

type HTTPMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

/**
 * Recursively resolves a procedure from the DRPC client by traversing
 * nested router objects using the procedure name parts.
 *
 * @example
 * // For "users.get" with slug ["users", "get"]
 * // Resolves to client.users.get
 */
function getProcedure(
  api: unknown,
  parts: string[]
): unknown {
  if (parts.length === 0) return undefined
  let current: unknown = api
  for (const part of parts) {
    if (current === null || current === undefined) return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

/**
 * Execute a procedure and format the response.
 */
async function executeProcedure(
  procedure: unknown,
  args: unknown
): Promise<NextResponse> {
  try {
    if (!procedure) {
      return NextResponse.json(
        { ok: false, error: { message: "Procedure not found" } },
        { status: 404 }
      )
    }

    const procedureFn = procedure as (args: unknown) => Promise<unknown>
    const result = await procedureFn(args)

    return NextResponse.json({ ok: true, value: result })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          message: error instanceof Error ? error.message : "Unknown error",
        },
      },
      { status: 500 }
    )
  }
}

/**
 * Creates Next.js route handlers for all HTTP methods.
 *
 * | Method | Description |
 * |--------|-------------|
 * | GET | Query operations (list, get, search) |
 * | POST | Mutation operations (create) |
 * | PUT | Mutation operations (update/replace) |
 * | PATCH | Mutation operations (partial update) |
 * | DELETE | Mutation operations (delete) |
 *
 * The procedure name is extracted from the URL path:
 * - /api/users.list → users.list procedure
 * - /api/users.get → users.get procedure
 * - /api/users.create → users.create procedure
 *
 * All methods accept JSON body: { args: { ... } }
 *
 * @param api - The DRPC client (created via createClient)
 * @returns Object with GET, POST, PUT, PATCH, DELETE route handlers
 */
export function toNextJsHandler(api: DRPCClient): {
  GET: (request: NextRequest) => Promise<NextResponse>
  POST: (request: NextRequest) => Promise<NextResponse>
  PUT: (request: NextRequest) => Promise<NextResponse>
  PATCH: (request: NextRequest) => Promise<NextResponse>
  DELETE: (request: NextRequest) => Promise<NextResponse>
} {
  /**
   * Extract procedure name and args from request.
   */
  async function parseRequest(request: NextRequest): Promise<{
    procedure: unknown
    args: unknown
  }> {
    const url = new URL(request.url)
    const pathname = url.pathname
    const slugStr = pathname.replace(/^\//, "") // Remove leading slash

    if (!slugStr) {
      return {
        procedure: null,
        args: {},
      }
    }

    const slugParts = slugStr.split(".")
    const procedure = getProcedure(api, slugParts)

    let args = {}
    if (request.method !== "GET") {
      try {
        const body = await request.json()
        args = body?.args ?? {}
      } catch {
        // Invalid JSON, use empty args
      }
    } else {
      // For GET, try to get args from searchParams
      const argsStr = url.searchParams.get("args")
      if (argsStr) {
        try {
          args = JSON.parse(argsStr)
        } catch {
          // Invalid JSON, use empty args
        }
      }
    }

    return { procedure, args }
  }

  const GET = async (request: NextRequest): Promise<NextResponse> => {
    const { procedure, args } = await parseRequest(request)
    return executeProcedure(procedure, args)
  }

  const POST = async (request: NextRequest): Promise<NextResponse> => {
    const { procedure, args } = await parseRequest(request)
    return executeProcedure(procedure, args)
  }

  const PUT = async (request: NextRequest): Promise<NextResponse> => {
    const { procedure, args } = await parseRequest(request)
    return executeProcedure(procedure, args)
  }

  const PATCH = async (request: NextRequest): Promise<NextResponse> => {
    const { procedure, args } = await parseRequest(request)
    return executeProcedure(procedure, args)
  }

  const DELETE = async (request: NextRequest): Promise<NextResponse> => {
    const { procedure, args } = await parseRequest(request)
    return executeProcedure(procedure, args)
  }

  return { GET, POST, PUT, PATCH, DELETE }
}

/**
 * @deprecated Use `toNextJsHandler` instead.
 *
 * Creates a Next.js route handler for the DRPC client.
 * This is a compatibility alias for the POST handler only.
 *
 * @param client - The DRPC client (created via createClient)
 * @returns POST route handler
 */
export function createRouteHandler(
  client: DRPCClient
): (request: NextRequest) => Promise<NextResponse> {
  return (request) => toNextJsHandler(client).POST(request)
}
