// frontend/src/test/bootstrap.test.tsx
//
// Phase 8 (UI-03): useBootstrap unit tests.
// Verifies /auth/refresh → /auth/me chain and silent failure for logged-out users.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '@/store/authSlice';
import type { ReactNode } from 'react';

// Mock the api module — we test the hook behavior, not real HTTP
vi.mock('@/lib/apiClient', () => ({
  api: {
    post: vi.fn(),
    get: vi.fn(),
    defaults: { headers: { common: {} } },
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
}));

// Import after mock is set up
const { api } = await import('@/lib/apiClient');
const { useBootstrap } = await import('@/hooks/useBootstrap');

function makeStore(bootstrapped = false) {
  return configureStore({
    reducer: { auth: authReducer },
    preloadedState: {
      auth: { accessToken: null, user: null, bootstrapped },
    },
  });
}

function wrapper(store: ReturnType<typeof makeStore>) {
  return ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
}

describe('useBootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fires /auth/refresh then /auth/me on mount and dispatches setAuth on success', async () => {
    const store = makeStore(false);
    vi.mocked(api.post).mockResolvedValueOnce({
      data: { data: { accessToken: 'tok123' } },
    });
    vi.mocked(api.get).mockResolvedValueOnce({
      data: { data: { id: 1, email: 'user@test.com' } },
    });

    renderHook(() => useBootstrap(), {
      wrapper: wrapper(store),
    });

    // Wait for async bootstrap to complete
    await vi.waitFor(() => {
      const state = store.getState().auth;
      expect(state.bootstrapped).toBe(true);
    });

    expect(vi.mocked(api.post)).toHaveBeenCalledWith('/auth/refresh');
    expect(vi.mocked(api.get)).toHaveBeenCalledWith(
      '/auth/me',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer tok123' }) }),
    );
    expect(store.getState().auth.accessToken).toBe('tok123');
    expect(store.getState().auth.user).toEqual({ id: 1, email: 'user@test.com' });
  });

  it('dispatches clearAuth silently when /auth/refresh returns 401', async () => {
    const store = makeStore(false);
    vi.mocked(api.post).mockRejectedValueOnce({ response: { status: 401 } });

    renderHook(() => useBootstrap(), { wrapper: wrapper(store) });

    await vi.waitFor(() => {
      expect(store.getState().auth.bootstrapped).toBe(true);
    });

    // clearAuth sets bootstrapped=true, accessToken=null, user=null
    expect(store.getState().auth.accessToken).toBeNull();
    expect(store.getState().auth.user).toBeNull();
    // api.get must NOT have been called — bootstrap stops after failed refresh
    expect(vi.mocked(api.get)).not.toHaveBeenCalled();
  });

  it('does not run bootstrap again when bootstrapped is already true', async () => {
    const store = makeStore(true); // already bootstrapped

    renderHook(() => useBootstrap(), { wrapper: wrapper(store) });

    // Allow a tick for any async side effects
    await new Promise((r) => setTimeout(r, 10));

    expect(vi.mocked(api.post)).not.toHaveBeenCalled();
    expect(vi.mocked(api.get)).not.toHaveBeenCalled();
  });
});
