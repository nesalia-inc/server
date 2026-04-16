import  { type Result } from "@deessejs/fp";
import  { type BeforeInvokeHook } from "../types.js";
import  { type Hooks } from "./types.js";

export async function executeHooks<Ctx, Args, Output>(
  hooks: Hooks<Ctx, Args, Output>,
  ctx: Ctx,
  args: Args,
  result: Result<Output>
): Promise<void> {
  // Call afterInvoke first (always runs)
  if (hooks.afterInvoke) {
    await hooks.afterInvoke(ctx, args, result);
  }

  // Then call onSuccess or onError based on result
  if (result.ok) {
    if (hooks.onSuccess) {
      await hooks.onSuccess(ctx, args, result.value);
    }
  } else {
    if (hooks.onError) {
      await hooks.onError(ctx, args, result.error);
    }
  }
}

export async function executeBeforeInvoke<Ctx, Args>(
  hook: BeforeInvokeHook<Ctx, Args> | undefined,
  ctx: Ctx,
  args: Args
): Promise<void> {
  if (hook) {
    await hook(ctx, args);
  }
}
