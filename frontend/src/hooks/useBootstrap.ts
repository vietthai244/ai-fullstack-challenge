// frontend/src/hooks/useBootstrap.ts
//
// Phase 8 (UI-03): Bootstrap sequence hook.
// Runs /auth/refresh → /auth/me on mount to rehydrate session after page refresh.
// The if (bootstrapped) return guard prevents double-run on re-renders / StrictMode double-invoke.
// On failure: dispatches clearAuth() silently — logged-out user sees no error.
// This hook MUST be called in App.tsx (not in LoginPage) — must run on ALL routes.
import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { api } from '@/lib/apiClient';
import { setAuth, clearAuth } from '@/store/authSlice';
import type { AppDispatch, RootState } from '@/store/index';

export function useBootstrap(): void {
  const dispatch = useDispatch<AppDispatch>();
  const bootstrapped = useSelector((s: RootState) => s.auth.bootstrapped);

  useEffect(() => {
    // Guard: only run bootstrap once (bootstrapped flips to true after first run)
    if (bootstrapped) return;

    async function bootstrap(): Promise<void> {
      try {
        // Step 1: exchange httpOnly refresh cookie for new access token
        const refreshRes = await api.post<{ data: { accessToken: string } }>('/auth/refresh');
        const accessToken = refreshRes.data.data.accessToken;

        // Step 2: fetch user with new access token
        // Inject Authorization header directly — Redux store not yet updated at this point
        const meRes = await api.get<{ data: { id: number; email: string } }>('/auth/me', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        // Step 3: set auth state — bootstrapped=true fires automatically via setAuth
        dispatch(setAuth({ accessToken, user: meRes.data.data }));
      } catch {
        // No refresh cookie / expired — silently fall through to logged-out state.
        // clearAuth() also sets bootstrapped=true to unblock ProtectedRoute.
        dispatch(clearAuth());
      }
    }

    void bootstrap();
  }, [bootstrapped, dispatch]);
}
