import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createClient } from '../src/createClient';
import { FetchTransport } from '../src/transport';
import type { Transport } from '../src/types';

describe('createClient', () => {
  it('should create a callable client proxy', async () => {
    const mockTransport = {
      request: vi.fn().mockResolvedValue({
        ok: true,
        value: { id: 1, name: 'John' }
      })
    };

    const client = createClient({ transport: mockTransport as any }) as any;

    expect(typeof client).toBe('function');
  });

  it('should convert nested path to slash-separated path', async () => {
    const mockTransport = {
      request: vi.fn().mockResolvedValue({
        ok: true,
        value: { id: 1 }
      })
    };

    const client = createClient({ transport: mockTransport as any }) as any;

    await client.users.get({ id: 1 });

    expect(mockTransport.request).toHaveBeenCalledWith('users/get', { id: 1 });
  });

  it('should handle deeply nested procedures', async () => {
    const mockTransport = {
      request: vi.fn().mockResolvedValue({
        ok: true,
        value: 'deep'
      })
    };

    const client = createClient({ transport: mockTransport as any }) as any;

    await client.a.b.c.d({ test: true });

    expect(mockTransport.request).toHaveBeenCalledWith('a/b/c/d', { test: true });
  });

  it('should return the raw transport response', async () => {
    const mockResponse = { ok: true, value: { id: 1 } };
    const mockTransport = {
      request: vi.fn().mockResolvedValue(mockResponse)
    };

    const client = createClient({ transport: mockTransport as any }) as any;
    const result = await client.users.get({ id: 1 });

    expect(result).toEqual(mockResponse);
  });

  it('should preserve error responses', async () => {
    const mockResponse = {
      ok: false,
      error: { name: 'NotFoundError', message: 'User not found' }
    };
    const mockTransport = {
      request: vi.fn().mockResolvedValue(mockResponse)
    };

    const client = createClient({ transport: mockTransport as any }) as any;
    const result = await client.users.get({ id: 999 });

    expect(result).toEqual(mockResponse);
  });

  it('should accumulate path correctly through chained property access', async () => {
    const mockTransport = {
      request: vi.fn().mockResolvedValue({ ok: true, value: null })
    };

    const client = createClient({ transport: mockTransport as any }) as any;

    // Access users then get as separate steps
    const users = client.users;
    const getUser = users.get;
    await getUser({ id: 1 });

    expect(mockTransport.request).toHaveBeenCalledWith('users/get', { id: 1 });
  });
});

describe('FetchTransport', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should make POST request by default with JSON body', async () => {
    const mockResponse = {
      ok: true,
      value: { id: 1 }
    };

    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse)
    });

    const transport = new FetchTransport('http://localhost:3000');
    await transport.request('users/get', { id: 1 });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/users/get',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json'
        }),
        body: JSON.stringify({ args: { id: 1 } })
      })
    );
  });

  it('should make GET request with query params when method is GET', async () => {
    const mockResponse = { ok: true, value: [] };

    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse)
    });

    const transport = new FetchTransport('http://localhost:3000');
    await transport.request('users/list', { limit: 10, offset: 0 }, { method: 'GET' });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/users/list?limit=10&offset=0',
      expect.objectContaining({
        method: 'GET',
        body: undefined
      })
    );
  });

  it('should handle baseUrl with trailing slash', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, value: null })
    });

    const transport = new FetchTransport('http://localhost:3000/');
    await transport.request('users/get', { id: 1 });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/users/get',
      expect.any(Object)
    );
  });

  it('should handle path with leading slash', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, value: null })
    });

    const transport = new FetchTransport('http://localhost:3000');
    await transport.request('/users/get', { id: 1 });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/users/get',
      expect.any(Object)
    );
  });

  it('should use custom method when specified', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, value: null })
    });

    const transport = new FetchTransport('http://localhost:3000');
    await transport.request('users/create', { name: 'John' }, { method: 'PUT' });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/users/create',
      expect.objectContaining({
        method: 'PUT'
      })
    );
  });

  it('should include custom headers', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, value: null })
    });

    const transport = new FetchTransport('http://localhost:3000');
    await transport.request('users/get', { id: 1 }, {
      headers: { 'Authorization': 'Bearer token123' }
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/users/get',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'Authorization': 'Bearer token123'
        })
      })
    );
  });
});
