import { error as errorFn, err as errFn } from "@deessejs/fp";
import  { type Error } from "@deessejs/fp";
import  { type Result } from "@deessejs/fp";

export { ok, err } from "@deessejs/fp";

export class ServerException extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly args: Readonly<{ message: string; data?: Record<string, unknown> }>;

  constructor(code: string, message: string, statusCode = 500, data?: Record<string, unknown>) {
    const errData = createError(code, { message, data } as { message: string; data?: Record<string, unknown> });
    super(message);
    this.name = "ServerException";
    this.code = code;
    this.statusCode = statusCode;
    this.stack = errData.stack;
    this.cause = errData.cause;
    this.args = errData.args as Readonly<{ message: string; data?: Record<string, unknown> }>;
  }
}

export class NotFoundException extends ServerException {
  constructor(message = "Resource not found") {
    super("NOT_FOUND", message, 404);
    this.name = "NotFoundException";
  }
}

export class UnauthorizedException extends ServerException {
  constructor(message = "Unauthorized") {
    super("UNAUTHORIZED", message, 401);
    this.name = "UnauthorizedException";
  }
}

export class ValidationException extends ServerException {
  constructor(message: string) {
    super("VALIDATION_ERROR", message, 400);
    this.name = "ValidationException";
  }
}

// ============================================
// Error Codes
// ============================================

export const ErrorCodes = {
  NOT_FOUND: "NOT_FOUND",
  UNAUTHORIZED: "UNAUTHORIZED",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  FORBIDDEN: "FORBIDDEN",
  CONFLICT: "CONFLICT",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  ROUTE_NOT_FOUND: "ROUTE_NOT_FOUND",
  INVALID_ARGS: "INVALID_ARGS",
} as const;

// ============================================
// Error Builder Helper
// ============================================

const ERROR_BUILDERS = {
  NOT_FOUND: errorFn({
    name: "NOT_FOUND",
    message: (args: { message: string }) => args.message,
  }),
  FORBIDDEN: errorFn({
    name: "FORBIDDEN",
    message: (args: { message: string }) => args.message,
  }),
  CONFLICT: errorFn({
    name: "CONFLICT",
    message: (args: { message: string }) => args.message,
  }),
  INTERNAL_ERROR: errorFn({
    name: "INTERNAL_ERROR",
    message: (args: { message: string }) => args.message,
  }),
  ROUTE_NOT_FOUND: errorFn({
    name: "ROUTE_NOT_FOUND",
    message: (args: { message: string }) => args.message,
  }),
  VALIDATION_ERROR: errorFn({
    name: "VALIDATION_ERROR",
    message: (args: { message: string }) => args.message,
  }),
} as const;

function createError(name: string, args: { message: string; data?: Record<string, unknown> }): Error {
  const builder = ERROR_BUILDERS[name as keyof typeof ERROR_BUILDERS];
  if (builder) {
    return builder(args) as Error;
  }
  return errorFn({ name, message: (a: { message: string }) => a.message })(args) as Error;
}

// Helper to create error result properly typed
export function createErrorResult(code: string, message: string, data?: Record<string, unknown>): Result<never> {
  const err = createError(code, { message, data } as { message: string; data?: Record<string, unknown> });
  return errFn(err);
}
