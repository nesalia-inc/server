import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { QueryConfig, MutationConfig } from "./types";
import { getQueryKey } from "./utils";

/**
 * Transport interface for making HTTP requests
 */
interface Transport {
  request(path: string, args: unknown): Promise<Response>;
}

/**
 * Procedure type tag
 */
type ProcedureType = "query" | "mutation" | "internalQuery" | "internalMutation";

/**
 * Base procedure shape (mirrors server/types.ts)
 */
interface BaseProcedure {
  readonly type: ProcedureType;
  readonly argsSchema?: unknown;
  readonly handler: unknown;
  readonly name?: string;
}

interface QueryProcedure extends BaseProcedure {
  readonly type: "query";
}

interface MutationProcedure extends BaseProcedure {
  readonly type: "mutation";
}

type Procedure = QueryProcedure | MutationProcedure | (BaseProcedure & { readonly type: "internalQuery" | "internalMutation" });

/**
 * SealedRouter is a type-safe router without index signature.
 * This ensures that accessing a non-existent route is a compile-time error.
 */
type SealedRouter<TRoutes extends Record<string, unknown>> = {
  [K in keyof TRoutes & string]: TRoutes[K] extends infer Value
    ? Value extends { type: "query" | "mutation" | "internalQuery" | "internalMutation" }
      ? Value
      : Value extends Record<string, unknown>
        ? SealedRouter<Value>
        : never
    : never;
};

/**
 * Recursively traverse router to build a typed client interface
 */
type RouterToClient<TRouter extends SealedRouter<Record<string, unknown>>> = {
  [K in keyof TRouter & string]: TRouter[K] extends { type: "query" }
    ? QueryHooks
    : TRouter[K] extends { type: "mutation" }
      ? MutationHooks
      : TRouter[K] extends Record<string, unknown>
        ? RouterToClient<TRouter[K]>
        : never;
};

interface QueryHooks {
  useQuery: <TData = unknown>(
    args?: Record<string, unknown>,
    config?: QueryConfig<TData, unknown> & {
      enabled?: boolean;
      placeholderData?: TData | ((prev: TData | undefined) => TData | undefined);
    }
  ) => ReturnType<typeof useQuery<TData>>;
}

interface MutationHooks {
  useMutation: <TData = unknown, TVariables = Record<string, unknown>>(
    config?: MutationConfig<TData, unknown, TVariables> & {
      onMutate?: (variables: TVariables) => Promise<TData> | TData;
      onError?: (error: Error, variables: TVariables, context?: unknown) => Promise<void> | void;
      onSettled?: (data: TData | undefined, error: Error | null, variables: TVariables) => Promise<void> | void;
    }
  ) => ReturnType<typeof useMutation<TData, unknown, TVariables>>;
}

/**
 * Create a type-safe client from a router type
 *
 * @example
 * ```typescript
 * const client = createClient<AppRouter>({ transport });
 *
 * // Typed query hook - no strings needed
 * const { data } = client.users.list.useQuery({});
 *
 * // Typed mutation hook
 * const { mutate } = client.users.create.useMutation();
 * ```
 */
export function createClient<TRouter extends SealedRouter<Record<string, unknown>>>(
  config: { transport: { request: (path: string, args: unknown) => Promise<Response> } }
): RouterToClient<TRouter> {
  return createRouterProxy(config.transport, []) as RouterToClient<TRouter>;
}

function createRouterProxy(transport: Transport, pathParts: string[]): unknown {
  return new Proxy({}, {
    get(_target, prop) {
      if (typeof prop !== "string") return undefined;

      // Skip Promise-like properties
      if (prop === "then" || prop === "catch" || prop === "finally") {
        return undefined;
      }

      const newPathParts = [...pathParts, prop];

      // Create a handler that returns hooks
      return createHookHandlers(transport, newPathParts);
    },
  });
}

function createHookHandlers(transport: Transport, pathParts: string[]): unknown {
  return {
    useQuery: (args: Record<string, unknown> = {}, config?: QueryConfig<unknown, unknown>) => {
      const queryKey = config?.queryKey ?? getQueryKey(pathParts, args);

      return useQuery({
        queryKey,
        queryFn: async () => {
          const response = await transport.request(pathParts.join("."), args);
          const data = await response.json();
          if (data.ok !== false) {
            return data.value;
          }
          throw new Error(data.error?.message ?? "Request failed");
        },
        ...config?.queryOptions,
      });
    },
    useMutation: (config?: MutationConfig<unknown, unknown, Record<string, unknown>> & {
      onMutate?: (variables: Record<string, unknown>) => Promise<unknown> | unknown;
      onError?: (error: Error, variables: Record<string, unknown>, context?: unknown) => Promise<void> | void;
      onSettled?: (data: unknown, error: Error | null, variables: Record<string, unknown>) => Promise<void> | void;
    }) => {
      const queryClient = config?.queryClient ?? useQueryClient();
      const queryKey = pathParts;

      // Extract user callbacks from mutationOptions - these will be passed directly
      // to useMutation so TanStack calls them directly (not through our wrapper)
      const userOnMutate = config?.mutationOptions?.onMutate;
      const userOnSuccess = config?.mutationOptions?.onSuccess;
      const userOnError = config?.mutationOptions?.onError;
      const userOnSettled = config?.mutationOptions?.onSettled;

      // NOTE: Current error handling throws on failure which is a breaking change from
      // Result-based returns. The error object includes `data` field from server for
      // future fixes when we decide on proper error type handling.
      return useMutation({
        mutationFn: async (args: Record<string, unknown>) => {
          const response = await transport.request(pathParts.join("."), args);
          const data = await response.json();
          if (data.ok !== false) {
            return data.value;
          }
          const err = new Error(data.error?.message ?? "Request failed");
          (err as Record<string, unknown>).data = data;
          throw err;
        },
        onMutate: userOnMutate,
        onSuccess: (data, variables, context) => {
          // TanStack calls userOnSuccess directly, we just add auto-invalidation
          userOnSuccess?.(data, variables, context);
          queryClient.invalidateQueries({ queryKey });
        },
        onError: userOnError,
        onSettled: userOnSettled,
      });
    },
  };
}