---
status: partial
phase: 03-authentication
source: [03-VERIFICATION.md]
started: 2026-04-21T02:05:00Z
updated: 2026-04-21T02:05:00Z
---

## Current Test

[awaiting human testing — requires Docker + live stack]

## Tests

### 1. Run backend/test/smoke/run-all.sh against live stack
expected: "ALL SMOKE TESTS PASSED" — register → login → /me → refresh → logout → guard all green
result: [pending]

### 2. POST /auth/login sets rt cookie with correct attributes
expected: Set-Cookie header contains `HttpOnly; SameSite=Strict; Path=/auth` (Secure only in production)
result: [pending]

### 3. Refresh token rotation replay returns 401 TOKEN_REVOKED
expected: Second call with same refresh token → 401 + Set-Cookie clearing rt cookie
result: [pending]

### 4. AUTH-06 + AUTH-07 cross-user behavior
expected: GET /campaigns no token → 401; user A → own campaign → 200; user A → user B's campaign → 404 (not 403)
result: [pending — AUTH-07 formalized in Phase 7 TEST-04; real CRUD lands in Phase 4]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
