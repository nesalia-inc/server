import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryConfig } from './types';
import { getQueryKey } from './utils';

export function createQuery<TRoutes>(
  client: TRoutes,
  route: string
) {
  const path = route.split('.');

  return function useDeesseQuery(
    args: Record<string, unknown>,
    config: QueryConfig<any, any> = {}
  ) {
    const queryClient = useQueryClient();
    const queryKey = config.queryKey ?? getQueryKey(path, args);

    return useQuery({
      queryKey,
      queryFn: () => {
        const procedure = getNestedProperty(client, path);
        return procedure(args);
      },
      ...config.queryOptions,
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
