export { createClient } from './createTypedClient';
export { QueryClientProvider, QueryClient } from './QueryClientProvider';
export type { QueryConfig, MutationConfig } from './types';
export { dehydrate, hydrate, HydrationBoundary, useQueryClient } from '@tanstack/react-query';
export type { DehydratedState } from '@tanstack/react-query';
export { ErrorBoundary, useErrorBoundary, withErrorBoundary } from './ErrorBoundary';
export type { ErrorBoundaryProps, FallbackProps } from './ErrorBoundary';
export { useQueryErrorBoundary } from './useQueryErrorBoundary';
export { useMutationErrorBoundary } from './useMutationErrorBoundary';