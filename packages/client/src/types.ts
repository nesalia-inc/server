// Transport interface for making HTTP requests
export interface Transport {
  request(path: string, args: unknown, options?: RequestOptions): Promise<any>;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
}

// Client configuration
export interface ClientConfig<TRoutes> {
  transport: Transport;
}
