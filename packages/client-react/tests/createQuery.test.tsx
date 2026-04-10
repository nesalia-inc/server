import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createQuery, createMutation, QueryClientProvider as DeesseQueryClientProvider } from '../src';

// Mock client with procedures
const mockClient = {
  users: {
    get: vi.fn().mockResolvedValue({ id: 1, name: 'John' }),
    list: vi.fn().mockResolvedValue([{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }]),
    create: vi.fn().mockResolvedValue({ id: 3, name: 'New User' }),
  },
};

describe('createQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a query hook that calls the procedure', async () => {
    const useUser = createQuery(mockClient, 'users.get');

    const queryClient = new QueryClient();

    function TestComponent() {
      const { data, isLoading } = useUser({ id: 1 });

      return (
        <div>
          <span data-testid="loading">{isLoading ? 'loading' : 'done'}</span>
          <span data-testid="data">{JSON.stringify(data)}</span>
        </div>
      );
    }

    render(
      <QueryClientProvider client={queryClient}>
        <TestComponent />
      </QueryClientProvider>
    );

    // Should call the procedure
    expect(mockClient.users.get).toHaveBeenCalledWith({ id: 1 });
  });

  it('parses route path correctly', () => {
    const useUser = createQuery(mockClient, 'users.get');
    expect(useUser).toBeDefined();
  });

  it('parses nested route path correctly', () => {
    const useUsers = createQuery(mockClient, 'users.list');
    expect(useUsers).toBeDefined();
  });
});

describe('createMutation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a mutation hook', () => {
    const useCreateUser = createMutation(mockClient, 'users.create');
    const queryClient = new QueryClient();

    function TestComponent() {
      const createUser = useCreateUser();
      return (
        <div>
          <span data-testid="isPending">{createUser.isPending ? 'pending' : 'idle'}</span>
        </div>
      );
    }

    render(
      <QueryClientProvider client={queryClient}>
        <TestComponent />
      </QueryClientProvider>
    );

    expect(screen.getByTestId('isPending')).toBeDefined();
  });

  it('mutation hook calls procedure when mutate is invoked', async () => {
    const useCreateUser = createMutation(mockClient, 'users.create');
    const queryClient = new QueryClient();

    let mutateFn: ((args: unknown) => void) | undefined;

    function TestComponent() {
      const createUser = useCreateUser();
      mutateFn = createUser.mutate;

      return (
        <div>
          <span data-testid="isPending">{createUser.isPending ? 'pending' : 'idle'}</span>
        </div>
      );
    }

    render(
      <QueryClientProvider client={queryClient}>
        <TestComponent />
      </QueryClientProvider>
    );

    // Trigger mutation
    if (mutateFn) {
      mutateFn({ name: 'New User', email: 'new@example.com' });
    }

    // Wait for the mutation to be called
    await waitFor(() => {
      expect(mockClient.users.create).toHaveBeenCalledWith({
        name: 'New User',
        email: 'new@example.com',
      });
    });
  });
});

describe('QueryClientProvider', () => {
  it('renders children with provided client', () => {
    const queryClient = new QueryClient();

    function TestComponent() {
      return <div data-testid="child">Child Content</div>;
    }

    render(
      <DeesseQueryClientProvider client={queryClient}>
        <TestComponent />
      </DeesseQueryClientProvider>
    );

    expect(screen.getByTestId('child')).toBeDefined();
    expect(screen.getByText('Child Content')).toBeDefined();
  });
});
