import { useErrorBoundary } from 'react-error-boundary';

export function useQueryErrorBoundary() {
  const errorBoundary = useErrorBoundary();

  return {
    onError: (error: Error) => {
      // User can decide what to invalidate in their onError callback
      // We just reset the boundary
      errorBoundary.resetBoundary();
    }
  };
}
