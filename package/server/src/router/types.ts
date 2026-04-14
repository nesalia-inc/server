import type { Procedure } from "../types.js";

export type RouterConfig<Ctx> = Record<string, Procedure<Ctx, unknown, unknown> | Record<string, any>>;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}
