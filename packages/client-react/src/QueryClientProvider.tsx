import { QueryClient, QueryClientProvider as QCProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

export function QueryClientProvider({
  children,
  client = new QueryClient()
}: {
  children: ReactNode;
  client?: QueryClient;
}) {
  return <QCProvider client={client}>{children}</QCProvider>;
}

export { QueryClient };
