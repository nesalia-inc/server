import  { type Middleware } from "../types.js";

export function createMiddleware<Ctx, Args>(config: Middleware<Ctx, Args>): Middleware<Ctx, Args> {
  return config;
}