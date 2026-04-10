import type { Transport, ClientConfig } from './types';

/**
 * Creates a type-safe client proxy that mirrors the server router structure.
 *
 * @example
 * ```typescript
 * const client = createClient<AppRouter>({ transport });
 *
 * // Call procedures by accessing the full path and then calling
 * const result = await client.users.get({ id: 1 });
 * const list = await client.users.list({});
 * ```
 */
export function createClient<TRoutes>(config: ClientConfig<TRoutes>): TRoutes {
  return createRouterProxy(config.transport, []);
}

async function parseResult(response: Response): Promise<{ ok: boolean; value?: any; error?: { message: string; code?: string } }> {
  const data = await response.json();

  if (data.ok === true) {
    return { ok: true, value: data.value };
  }

  // Handle error case - ensure error has a message
  const error = data.error || { message: `HTTP ${response.status}: ${data.message || 'Unknown error'}` };
  return { ok: false, error };
}

function createRouterProxy(transport: Transport, pathParts: string[]): any {
  async function procedureFunc(args: unknown) {
    const response = await transport.request(pathParts.join('/'), args);
    return parseResult(response);
  }

  return new Proxy(procedureFunc, {
    get(_target, prop) {
      if (typeof prop !== 'string') return undefined;

      // Skip Promise-like properties to allow await
      if (prop === 'then' || prop === 'catch' || prop === 'finally') {
        return undefined;
      }

      // Build the new path by appending this property
      const newPathParts = [...pathParts, prop];

      // Return a new proxy that has the extended path
      return createRouterProxy(transport, newPathParts);
    },
    apply(_target, _thisArg, [args]) {
      // When the proxy is called directly, use the stored path
      return procedureFunc(args);
    }
  });
}
