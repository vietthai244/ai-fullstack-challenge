// frontend/src/test/bootstrap.test.tsx
//
// Phase 8 (UI-03): Bootstrap sequence test — Wave 0 scaffold.
// Tests will pass after Plan 03 implements useBootstrap + authSlice.
// RED state intentional — implementations do not exist yet.
import { describe, it, vi, beforeEach } from 'vitest';

describe('useBootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.todo('fires single /auth/refresh then /auth/me on mount');
  it.todo('dispatches setAuth on success');
  it.todo('dispatches clearAuth silently on 401 (logged-out user)');
  it.todo('does not run bootstrap again if bootstrapped is already true');
});
