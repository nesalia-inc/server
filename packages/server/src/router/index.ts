export type { RouterConfig, ValidationResult } from "./types.js";
export {
  flattenRouter,
  getPublicRoutes,
  getInternalRoutes,
  isRouter,
  isProcedure,
  resolvePath,
  validateRouter,
} from "./builder.js";