import type { Result } from "@deessejs/fp";
import type {
  BeforeInvokeHook,
  AfterInvokeHook,
  OnSuccessHook,
  OnErrorHook,
} from "../types.js";

export interface Hooks<Ctx, Args, Output> {
  beforeInvoke?: BeforeInvokeHook<Ctx, Args>;
  afterInvoke?: AfterInvokeHook<Ctx, Args, Output>;
  onSuccess?: OnSuccessHook<Ctx, Args, Output>;
  onError?: OnErrorHook<Ctx, Args, any>;
}