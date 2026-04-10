import type { UseQueryOptions, UseMutationOptions } from '@tanstack/react-query';

export interface QueryConfig<TData, TError> {
  queryKey?: unknown[];
  queryOptions?: Omit<UseQueryOptions<TData, TError>, 'queryKey' | 'queryFn'>;
}

export interface MutationConfig<TData, TError, TVariables> {
  mutationOptions?: Omit<UseMutationOptions<TData, TError, TVariables>, 'mutationFn'>;
}
