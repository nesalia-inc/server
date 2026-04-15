import type { UseQueryOptions, UseMutationOptions, QueryClient } from '@tanstack/react-query';

export interface QueryConfig<TData, TError> {
  queryKey?: unknown[];
  queryOptions?: Omit<UseQueryOptions<TData, TError>, 'queryKey' | 'queryFn'>;
}

export interface MutationConfig<TData, TError, TVariables> {
  queryKey?: unknown[];
  mutationOptions?: Omit<UseMutationOptions<TData, TError, TVariables>, 'mutationFn'>;
  queryClient?: QueryClient;
}
