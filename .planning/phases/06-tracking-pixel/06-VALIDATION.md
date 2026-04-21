---
phase: 6
slug: tracking-pixel
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-21
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | smoke scripts (curl + psql) — Vitest deferred to Phase 7 |
| **Config file** | none — Phase 7 installs Vitest infrastructure |
| **Quick run command** | `bash backend/test/smoke/track-06.sh` |
| **Full suite command** | `bash backend/test/smoke/run-all-phase6.sh` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bash backend/test/smoke/track-06.sh`
- **After every plan wave:** Run `bash backend/test/smoke/run-all-phase6.sh`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 6-01-01 | 01 | 1 | TRACK-01 | C17 | Always 200 + GIF; no 404 oracle leak | smoke | `bash backend/test/smoke/track-06.sh` | ❌ W0 | ⬜ pending |
| 6-01-02 | 01 | 1 | TRACK-01 | C17 | Invalid token → same 200 + GIF | smoke | `bash backend/test/smoke/track-06.sh` | ❌ W0 | ⬜ pending |
| 6-01-03 | 01 | 1 | TRACK-01 | C17 | No auth header → 200 (public route) | smoke | `bash backend/test/smoke/track-06.sh` | ❌ W0 | ⬜ pending |
| 6-01-04 | 01 | 1 | TRACK-01 | C17 | First open sets opened_at; second does not overwrite | smoke | `bash backend/test/smoke/track-06-idempotent.sh` | ❌ W0 | ⬜ pending |
| 6-01-05 | 01 | 1 | TRACK-01 | — | PIXEL buffer declared at module scope (not inside handler) | grep | `grep -n 'Buffer.from' backend/src/routes/track.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/test/smoke/track-06.sh` — curl smoke for TRACK-01 criteria 1-3 (valid token, invalid token, no auth)
- [ ] `backend/test/smoke/track-06-idempotent.sh` — idempotency check (criterion 4: opened_at first-write-wins)
- [ ] `backend/test/smoke/run-all-phase6.sh` — runs both smoke scripts + updates run-all.sh

*All smoke scripts already follow the pattern from Phases 3-5 in `backend/test/smoke/`.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Content-Length: 43 in curl response | TRACK-01 | Header value requires visual inspection | `curl -i http://localhost:3000/track/open/<uuid>` — check `Content-Length: 43` in output |
| PIXEL.length === 43 at runtime | TRACK-01 | Buffer byte count not easily grep-checked | Read `backend/src/routes/track.ts` and verify hex string decodes to 43 bytes via `node -e "console.log(Buffer.from('...','hex').length)"` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
