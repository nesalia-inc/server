import type { Transport } from './types';

/**
 * Creates a query function for a specific procedure path.
 * Useful when you need to call a specific procedure without going through the full proxy.
 *
 * @example
 * ```typescript
 * const getUser = createQuery(transport, 'users/get');
 * const result = await getUser({ id: 1 });
 * ```
 */
export function createQuery(transport: Transport, path: string) {
  return (args: unknown) => transport.request(path, args);
}
