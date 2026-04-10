import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { MutationConfig } from './types';
import { getQueryKey } from './utils';

export function createMutation<TRoutes>(
  client: TRoutes,
  route: string
) {
  const path = route.split('.');

  return function useDeesseMutation(
    config: MutationConfig<any, any, any> = {}
  ) {
    const queryClient = useQueryClient();

    return useMutation({
      mutationFn: (args: Record<string, unknown>) => {
        const procedure = getNestedProperty(client, path);
        return procedure(args);
      },
      onSuccess: () => {
        // Invalidate related queries
        // Could use server events for smarter invalidation
      },
      ...config.mutationOptions,
    });
  };
}

function getNestedProperty(obj: any, path: string[]): any {
  let current = obj;
  for (const key of path) {
    current = current[key];
  }
  return current;
}
