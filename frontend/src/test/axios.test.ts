// frontend/src/test/axios.test.ts
//
// Phase 8 (UI-05): axios interceptor test — Wave 0 scaffold.
// Tests will pass after Plan 02 implements the memoized refresh interceptor.
import { describe, it } from 'vitest';

describe('apiClient interceptor', () => {
  it.todo('injects Authorization: Bearer header from Redux store on each request');
  it.todo('on 401: fires exactly 1 /auth/refresh call for N concurrent 401 responses (memoized promise)');
  it.todo('retries the original request with the new token after successful refresh');
  it.todo('dispatches clearAuth and redirects to /login on persistent 401 (refresh itself 401s)');
});
