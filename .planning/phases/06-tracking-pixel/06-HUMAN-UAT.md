---
status: partial
phase: 06-tracking-pixel
source: [06-VERIFICATION.md]
started: 2026-04-21T00:00:00Z
updated: 2026-04-21T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Full smoke suite
expected: bash backend/test/smoke/run-all-phase6.sh exits 0 with both PASS lines and final banner showing TRACK-01
result: [pending]

### 2. Response headers on the wire
expected: curl -si http://localhost:3000/track/open/00000000-0000-0000-0000-000000000000 returns 200, Content-Type: image/gif, Content-Length: 43, Cache-Control: no-store no-cache, Referrer-Policy: no-referrer
result: [pending]

### 3. Idempotent opened_at in Postgres
expected: track-06-idempotent.sh PASS — opened_at set after first hit, unchanged after second
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
