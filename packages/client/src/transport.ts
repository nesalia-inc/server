import type { Transport, RequestOptions } from './types';

/**
 * Fetch-based transport implementation for making HTTP requests.
 * Uses POST by default with JSON body, and GET with query params.
 */
export class FetchTransport implements Transport {
  constructor(private baseUrl: string = '') {}

  async request(
    path: string,
    args: unknown,
    options: RequestOptions = {}
  ): Promise<Response> {
    const method = options.method || 'POST';
    const url = this.buildUrl(path, args, method);

    return fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      body: method === 'GET' ? undefined : JSON.stringify({ args }),
    });
  }

  private buildUrl(path: string, args: unknown, method: string): string {
    const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
    let base = this.baseUrl;

    // If baseUrl is a relative path (like /api), we need to handle it differently
    if (!base) {
      base = '';
    } else if (!base.startsWith('http://') && !base.startsWith('https://')) {
      // It's a relative path - use window.location.origin or similar in browser
      // For SSR/Node, we need to construct the full URL
      // Default to relative path for browser compatibility
      base = base.endsWith('/') ? base.slice(0, -1) : base;
    }

    if (method === 'GET' && args && typeof args === 'object' && Object.keys(args).length > 0) {
      const searchParams = new URLSearchParams(
        args as Record<string, string>
      );
      return `${base}/${normalizedPath}?${searchParams}`;
    }

    return `${base}/${normalizedPath}`;
  }
}

/**
 * Factory function to create a FetchTransport instance.
 * @param baseUrl - The base URL for all requests (default: '')
 * @returns A new FetchTransport instance
 */
export function fetchTransport(baseUrl: string = ''): Transport {
  return new FetchTransport(baseUrl);
}
