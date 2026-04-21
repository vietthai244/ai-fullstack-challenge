// frontend/src/lib/apiClient.ts
//
// Phase 8 (UI-05): axios instance + request/response interceptors.
// C6 guard: memoized module-scope refreshPromise — N concurrent 401s = exactly 1 /auth/refresh call.
// withCredentials: true on instance (not per-call) so httpOnly refresh cookie is always sent.
// X-Requested-With: fetch set globally — backend /auth/refresh CSRF check requires it.
import axios from 'axios';
import { store } from '@/store/index';
import { setToken, clearAuth } from '@/store/authSlice';

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true, // MANDATORY — sends httpOnly refresh cookie on every call
});

// Global CSRF header — backend POST /auth/refresh enforces X-Requested-With: fetch
api.defaults.headers.common['X-Requested-With'] = 'fetch';

// Module-scope singleton for in-flight refresh promise.
// CRITICAL: must be module scope (not component state, not inside a closure).
// If stored anywhere that resets on re-render, N concurrent 401s → N /auth/refresh calls
// → backend rotates token on first, rest return 401 → user silently logged out (C6).
let refreshPromise: Promise<string> | null = null;

// Request interceptor: inject Authorization: Bearer from Redux store
api.interceptors.request.use((config) => {
  const token = store.getState().auth.accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: handle 401 with single memoized refresh
api.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    const axiosError = error as import('axios').AxiosError;
    const originalRequest = axiosError.config as import('axios').InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // Only intercept 401s; skip if this request already retried (prevents infinite loop)
    if (axiosError.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }
    originalRequest._retry = true;

    // Skip retry for auth endpoints — let their 401s propagate to React Query (D-01).
    // Without this guard: /auth/login 401 → interceptor tries refresh → refresh fails
    // → hard redirect, loginMutation.isError never fires (bug 1).
    if (originalRequest.url?.includes('/auth/')) {
      return Promise.reject(error);
    }

    try {
      // Create a single shared refresh promise if one is not already in-flight.
      // All concurrent 401s await the SAME promise — exactly 1 network call.
      if (!refreshPromise) {
        refreshPromise = api
          .post<{ data: { accessToken: string } }>('/auth/refresh')
          .then((res) => {
            const token = res.data.data.accessToken;
            store.dispatch(setToken(token));
            return token;
          })
          .finally(() => {
            // Clear in .finally() (not .then()) so a failed refresh also clears the ref.
            // If cleared only in .then(), a failing refresh leaves a resolved-rejected promise
            // cached — the next 401 awaits it and immediately gets the old rejection.
            refreshPromise = null;
          });
      }

      const newToken = await refreshPromise;
      originalRequest.headers = originalRequest.headers ?? {};
      originalRequest.headers.Authorization = `Bearer ${newToken}`;
      return api(originalRequest);
    } catch {
      // Refresh itself returned 401 — refresh token expired or denylisted.
      // Clear auth state and redirect to login. No toast here (Phase 9 adds toasts).
      store.dispatch(clearAuth());
      window.location.href = '/login';
      return Promise.reject(error);
    }
  },
);
