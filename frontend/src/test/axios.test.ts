// frontend/src/test/axios.test.ts
//
// Phase 8 (UI-05): axios apiClient interceptor unit tests.
// Key invariant: N concurrent 401s = exactly 1 /auth/refresh call (C6 guard).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We need to test the real interceptor logic.
// Reset module state between tests to reset refreshPromise.
// The apiClient uses module-scope state — we reset by re-importing via resetModules.

describe('apiClient interceptor', () => {
  let mockStore: { getState: ReturnType<typeof vi.fn>; dispatch: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.resetModules();

    // Mock the store before importing apiClient
    mockStore = {
      getState: vi.fn().mockReturnValue({ auth: { accessToken: 'initial-token' } }),
      dispatch: vi.fn(),
    };

    vi.doMock('@/store/index', () => ({ store: mockStore }));
    vi.doMock('@/store/authSlice', () => ({
      setToken: (token: string) => ({ type: 'auth/setToken', payload: token }),
      clearAuth: () => ({ type: 'auth/clearAuth' }),
    }));
  });

  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('injects Authorization: Bearer header from Redux store on each request', async () => {
    mockStore.getState.mockReturnValue({ auth: { accessToken: 'my-token' } });
    const { api } = await import('@/lib/apiClient');

    // Get the request interceptor function
    const requestInterceptor = (
      api.interceptors.request as unknown as { handlers: Array<{ fulfilled: (c: unknown) => unknown }> }
    ).handlers[0]?.fulfilled;

    if (!requestInterceptor) {
      throw new Error('Request interceptor not registered');
    }

    const config = { headers: {} as Record<string, string> };
    const result = requestInterceptor(config) as typeof config;
    expect(result.headers.Authorization).toBe('Bearer my-token');
  });

  it('on 401: fires exactly 1 /auth/refresh call for N concurrent 401 responses', async () => {
    const { api } = await import('@/lib/apiClient');

    let refreshCallCount = 0;
    const originalPost = api.post.bind(api);

    vi.spyOn(api, 'post').mockImplementation(async (url: string, ...args: unknown[]) => {
      if (url === '/auth/refresh') {
        refreshCallCount++;
        return { data: { data: { accessToken: 'new-token' } } };
      }
      return originalPost(url, ...args);
    });

    vi.spyOn(api, 'request').mockResolvedValue({ data: 'retried' });

    // Simulate N concurrent 401 errors
    const error401 = () => ({
      response: { status: 401 },
      config: { headers: {}, _retry: false },
    });

    const responseInterceptorRejected = (
      api.interceptors.response as unknown as { handlers: Array<{ rejected: (e: unknown) => unknown }> }
    ).handlers[0]?.rejected;

    if (!responseInterceptorRejected) {
      throw new Error('Response interceptor not registered');
    }

    // Fire 3 concurrent 401 errors — must produce exactly 1 refresh call
    await Promise.allSettled([
      responseInterceptorRejected(error401()),
      responseInterceptorRejected(error401()),
      responseInterceptorRejected(error401()),
    ]);

    expect(refreshCallCount).toBe(1);
  });

  it('dispatches clearAuth and sets window.location.href to /login on persistent 401', async () => {
    const { api } = await import('@/lib/apiClient');

    // Patch window.location
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { href: '' },
    });

    vi.spyOn(api, 'post').mockRejectedValue({ response: { status: 401 } });

    const responseInterceptorRejected = (
      api.interceptors.response as unknown as { handlers: Array<{ rejected: (e: unknown) => unknown }> }
    ).handlers[0]?.rejected;

    if (!responseInterceptorRejected) {
      throw new Error('Response interceptor not registered');
    }

    await (responseInterceptorRejected({
      response: { status: 401 },
      config: { headers: {}, _retry: false },
    }) as Promise<unknown>).catch(() => {});

    expect(mockStore.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'auth/clearAuth' }),
    );
    expect(window.location.href).toBe('/login');

    // Restore
    Object.defineProperty(window, 'location', { writable: true, value: originalLocation });
  });
});
