import type { Router, Procedure } from "../types.js";

// ============================================
// Router Helpers
// ============================================

/**
 * Flatten a hierarchical router to get all procedure paths
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function flattenRouter<Ctx, R extends Router<Ctx, any>>(
  router: R,
  prefix: string[] = []
): Array<{ path: string; procedure: Procedure<Ctx, any, any> }> {
  const result: Array<{ path: string; procedure: Procedure<Ctx, any, any> }> = [];

  for (const key in router) {
    const value = (router as any)[key];
    const path = [...prefix, key];

    if (isProcedure(value)) {
      result.push({ path: path.join("."), procedure: value });
    } else if (isRouter(value)) {
      result.push(...flattenRouter(value, path));
    }
  }

  return result;
}

/**
 * Get all public routes (query and mutation only)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getPublicRoutes<Ctx, R extends Router<Ctx, any>>(
  router: R
): Array<{ path: string; procedure: Procedure<Ctx, any, any> }> {
  return flattenRouter(router).filter(
    (item) => item.procedure.type === "query" || item.procedure.type === "mutation"
  );
}

/**
 * Get all internal routes (internalQuery and internalMutation)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getInternalRoutes<Ctx, R extends Router<Ctx, any>>(
  router: R
): Array<{ path: string; procedure: Procedure<Ctx, any, any> }> {
  return flattenRouter(router).filter(
    (item) => item.procedure.type === "internalQuery" || item.procedure.type === "internalMutation"
  );
}

// ============================================
// Type Guards
// ============================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isRouter(obj: any): obj is Router<any, any> {
  if (!obj || typeof obj !== "object") return false;

  // If any key contains a procedure, it's not a plain router
  for (const key of Object.keys(obj)) {
    if (isProcedure(obj[key])) {
      return false;
    }
  }

  return true;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isProcedure(obj: any): obj is Procedure<any, any, any> {
  return (
    obj &&
    typeof obj === "object" &&
    "type" in obj &&
    ["query", "mutation", "internalQuery", "internalMutation"].includes(obj.type)
  );
}

// ============================================
// Path Resolution
// ============================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function resolvePath(router: Router, path: string): Procedure<any, any, any> | Router | undefined {
  const parts = path.split(".");
  let current: any = router;

  for (const part of parts) {
    if (current === undefined || current === null) {
      return undefined;
    }
    current = current[part];
  }

  return current;
}

// ============================================
// Router Validation
// ============================================

import type { ValidationResult } from "./types.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function validateRouter<Ctx, R extends Router<Ctx, any>>(router: R): ValidationResult {
  const errors: string[] = [];

  const validate = (current: any, path: string[]): void => {
    for (const key of Object.keys(current)) {
      const value = current[key];
      const currentPath = [...path, key];

      if (isProcedure(value)) {
        // Validate procedure
        if (!value.handler) {
          errors.push(`Procedure at "${currentPath.join(".")}" missing handler`);
        }
      } else if (isRouter(value)) {
        validate(value, currentPath);
      } else if (typeof value === "object" && value !== null) {
        // Could be a nested router without procedures at this level
        validate(value, currentPath);
      }
    }
  };

  validate(router, []);
  return { valid: errors.length === 0, errors };
}