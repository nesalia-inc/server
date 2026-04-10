import type { Router, Procedure } from "../types.js";

export type RouterConfig<Ctx> = Record<string, Procedure<Ctx, any, any> | Router<Ctx>>;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}