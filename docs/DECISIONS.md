# Design Decisions

This document captures the senior-flex design decisions made while building
Mini Campaign Manager. Reviewers: the expanded rationale for each of these
lives in `.planning/research/*.md` and the per-phase `.planning/phases/*/`
directories; this file is the short, linkable summary.

Covered sections (full set per DOC-03): 4-state machine, index choices,
async queue, open-tracking, JWT split — the first JWT entry lands below;
others accrue as their phases close.

## JWT: refresh cookie Path = `/auth` (not `/auth/refresh`)

**Decision:** the `rt` refresh cookie is set with `Path=/auth`, not the
narrower `Path=/auth/refresh` recommended in
`.planning/research/ARCHITECTURE.md` §8.

**Why the narrower path doesn't work:** with `Path=/auth/refresh`, the
browser sends `rt` ONLY to that exact endpoint. `POST /auth/logout` then
cannot read the cookie, so:

1. The server has no `jti` to denylist in Redis — AUTH-04's "revokes
   refresh token via Redis denylist" requirement cannot be satisfied.
2. `res.clearCookie('rt', {path:'/auth/refresh'})` succeeds, but since the
   original cookie was sent with `Path=/auth/refresh`, the browser only
   clears it when a matching Set-Cookie comes back on the SAME path —
   `/auth/logout` is a different path, so `clearCookie` silently no-ops.

**Why the cookie can't be read from the body instead:** the cookie is
`HttpOnly`. The frontend cannot read it, cannot forward it in a logout
body, and should not — that would defeat the XSS defense.

**The design that actually works:** widen the cookie to `Path=/auth`. Every
endpoint under the auth router can now both receive AND clear the cookie:

| Cookie Path       | Sent on /auth/refresh? | Sent on /auth/logout? | clearCookie works? |
|-------------------|------------------------|-----------------------|--------------------|
| /auth/refresh     | yes                    | **no**                | —                  |
| /auth (chosen)    | yes                    | yes                   | yes (matching path)|

**Security posture unchanged:**
- `HttpOnly` still means JS cannot read the cookie — XSS exfiltration is
  still blocked.
- `SameSite=Strict` still means cross-origin requests cannot include the
  cookie — CSRF is still blocked.
- `Secure` still means the cookie is sent only over TLS in production.
- Every endpoint under `/auth/*` is a trusted endpoint we control, so
  widening from `/auth/refresh` to `/auth` does not expose the cookie to
  any untrusted handler.

**Defense-in-depth retained:** `POST /auth/refresh` additionally requires a
`X-Requested-With: fetch` header (A7). A cross-origin form POST cannot set
custom headers, so this catches edge cases where a browser extension or CDN
strips `SameSite`.

**References:**
- ARCHITECTURE.md §8 (the pattern we deviate from)
- 03-RESEARCH.md §Refresh Token Design — full analysis
- 03-RESEARCH.md Assumptions Log — A1
- Express `clearCookie` path-matching requirement:
  https://github.com/expressjs/express/issues/3941

## GET /campaigns: offset pagination (overrides CLAUDE.md §5 cursor-only rule)

**Decision:** `GET /campaigns` uses **offset pagination** (`?page=1&limit=20`) with a page-number
UI, not the cursor-based infinite-scroll pagination specified in CLAUDE.md constraint #5.

**Why:** The UX requirement is a numbered page control (e.g. "Page 3 of 12") that lets users
jump to arbitrary pages. Cursor pagination is append-only — it supports "load more" but cannot
support "jump to page N" without materialising every prior page. The product requirement
(explicit page-number navigation) is incompatible with cursor semantics.

**Scope of override:** Campaigns list only. `GET /recipients` retains cursor pagination — it has
no page-jump requirement and the cursor is the safer default for large unbounded result sets.

**Trade-offs accepted:**
- Offset pagination has O(offset) cost for deep pages on large tables. For a take-home
  campaign manager with at most hundreds of campaigns per user, this is irrelevant.
- Page results can drift between requests if rows are inserted/deleted mid-session (a user
  on page 3 may see a repeated or skipped campaign if the list changes). Acceptable for this
  use case — campaigns are rarely created/deleted rapidly during a browsing session.

**Response shape:**
```json
{
  "data": [...],
  "pagination": { "page": 1, "limit": 20, "total": 47, "totalPages": 3 }
}
```

**References:**
- CLAUDE.md §5 (constraint being overridden for this endpoint)
- 04-CONTEXT.md D-16..D-21 (updated pagination decisions)

## Per-User Recipients (Phase 4)

Recipients are scoped to the creating user (`recipients.user_id` FK, `UNIQUE(user_id, email)` composite constraint) rather than a global email registry. This aligns with AUTH-07's cross-user-404 enumeration defense and enables multi-user correctness: user A's campaign cannot accidentally be linked to user B's recipient records. A new migration (`20260421000001-add-user-id-to-recipients.cjs`) backfills existing seed rows to the demo user via `SELECT MIN(id) FROM users` and swaps the global `UNIQUE(email)` constraint for the composite one.

## Campaign List Pagination: Offset over Cursor (Phase 4)

`GET /campaigns` uses offset pagination (`?page=1&limit=20`) rather than the cursor-based `(created_at, id)` approach used for `GET /recipients`. Rationale: the campaign list requires page-number UI (jump to page N, show "Page 3 of 12") which cursor pagination cannot support. The consistency risk of offset is acceptable here because the campaign count per user is small (< 1000 for any realistic v1 user), inserts during pagination are infrequent, and the UX value of numbered pages outweighs cursor consistency guarantees. `GET /recipients` retains cursor pagination because recipient lists can be large and are consumed programmatically (no page-jump UI).

---

## 4-State Campaign Machine (draft → scheduled → sending → sent)

**Decision:** Campaign status follows a strict four-state machine enforced atomically at the database layer via `UPDATE campaigns SET status = 'sending' WHERE id = $1 AND status IN ('draft', 'scheduled')`. The API returns 409 Conflict when the guard matches zero rows.

**Why four states instead of three:** A three-state machine (draft → sending → sent) cannot represent a campaign that has been committed to send at a future time but has not yet started sending. `scheduled` is the state where `scheduled_at` is set and a BullMQ delayed job is queued. If the BullMQ job fires and the campaign has been deleted or edited in the interim, the worker re-checks status on entry and bails cleanly — no orphaned state.

**Why atomic guard matters:** Two concurrent `POST /campaigns/:id/send` requests can race. Without the `WHERE status IN (...)` guard, both read `draft`, both write `sending`, and both enqueue a worker job — the campaign is processed twice. The atomic `UPDATE ... RETURNING` returns `[affectedCount]`; if the count is 0, the race was lost and the handler returns 409. This is verified by the TEST-02 concurrent-send test.

**Why 409 and not 400:** 409 Conflict is the semantically correct HTTP status for a state machine guard violation — the request is syntactically valid but conflicts with the current resource state. 400 would imply the client sent malformed input.

**References:**
- CAMP-04, CAMP-05, CAMP-06, CAMP-07 in REQUIREMENTS.md
- TEST-02 (concurrent-send atomicity) in REQUIREMENTS.md
- backend/src/services/campaignService.ts (triggerSend guard)

---

## Index Choices

**Decision:** Two explicit composite indexes were created beyond the auto-generated unique and primary key indexes.

1. `idx_campaigns_created_by_created_at_id` on `campaigns(created_by, created_at DESC, id DESC)` — supports `GET /campaigns` which filters by `created_by = req.user.id` and orders by `(created_at DESC, id DESC)`. The three-column index allows Postgres to satisfy the filter + sort in a single B-tree scan with no file sort.

2. `idx_campaign_recipients_campaign_id_status` on `campaign_recipients(campaign_id, status)` — supports `GET /campaigns/:id/stats` which runs `COUNT(*) FILTER (WHERE status = 'sent')` etc. The index allows Postgres to aggregate by scanning the index directly (index-only scan on supported Postgres versions) rather than the full heap.

**What was NOT indexed (and why):**
- `users.email` and `recipients.email` — covered by `UNIQUE` constraints which auto-create B-tree unique indexes in Postgres. A duplicate explicit index would waste write amplification (Pitfall 9 in the research notes).
- `campaign_recipients.tracking_token` — covered by `UNIQUE` constraint for the same reason.
- `campaign_recipients(campaign_id, recipient_id)` — the composite primary key already creates a unique index on those columns.

**References:**
- DATA-02 in REQUIREMENTS.md
- backend/src/migrations/ (indexes created in migration files)

---

## Async Queue Design (BullMQ)

**Decision:** Email sending is delegated to a BullMQ worker that processes jobs from a Redis queue. The HTTP handler transitions the campaign to `sending` atomically, enqueues a job, and returns 202 Accepted immediately. The worker runs inside a Sequelize transaction and transitions the campaign to `sent` when all recipients are processed.

**Why a queue and not synchronous processing:** Email sending (even simulated) is I/O-bound and can be slow. Blocking the HTTP response thread until all recipients are processed would degrade API responsiveness and prevent proper 202 semantics. The queue also enables delayed scheduling (`POST /campaigns/:id/schedule`): BullMQ's `delay` option holds the job until the scheduled timestamp.

**Why separate IORedis connections for Queue and Worker:** BullMQ's documentation requires separate connections for the queue (producer) and the worker (consumer). A single shared connection can cause deadlocks because the worker uses Redis blocking commands (`BRPOP`) that would block the queue's ability to add jobs. Both connections use `maxRetriesPerRequest: null` — the BullMQ default, required to prevent silent job hangs under load (Pitfall C5).

**Worker correctness guarantees:**
- Status re-check on entry: if the campaign is no longer `sending` when the job fires (deleted, or stale delayed job), the worker returns without touching recipient rows.
- Transaction wrapping: all recipient status updates and the campaign `sent` transition are in one Sequelize transaction — partial state on crash is impossible.
- `worker.on('failed')` and `worker.on('error')` handlers log via pino — no silent failures.

**References:**
- QUEUE-01..04 in REQUIREMENTS.md
- backend/src/lib/queue.ts, backend/src/services/sendWorker.ts

---

## Open-Tracking Pixel Design

**Decision:** `GET /track/open/:trackingToken` serves a 43-byte transparent GIF89a and runs an idempotent `UPDATE campaign_recipients SET opened_at = NOW() WHERE tracking_token = $1 AND opened_at IS NULL`. The endpoint is public (no auth) and **always returns 200 + GIF** regardless of whether the token matches any row.

**Why the tracking_token column instead of the composite PK:** The composite primary key `(campaign_id, recipient_id)` is composed of BIGINT values. Embedding `?campaign_id=1&recipient_id=42` in pixel URLs would allow enumeration of all campaign-recipient combinations via sequential integer scanning. The `tracking_token UUID` column provides 122 bits of entropy — brute force enumeration is computationally infeasible.

**Why always-200 (oracle defense):** If the endpoint returned 404 for an invalid token, an attacker could confirm which tokens are valid by observing the response code. With always-200, the caller learns nothing about token validity — even a completely garbage token receives the same pixel response.

**Why idempotent UPDATE (WHERE opened_at IS NULL):** Email clients (and Google's image proxy) may fetch the pixel multiple times. The first fetch sets `opened_at`; subsequent fetches match zero rows and return 200 + GIF with no state change. This ensures `opened_at` always reflects the first open, not the most recent.

**Why a module-scoped pixel buffer:** The 43-byte GIF is allocated once at module load and reused for every request. Allocating a new Buffer per request would be unnecessary GC pressure for a hot, stateless endpoint.

**References:**
- TRACK-01 in REQUIREMENTS.md
- backend/src/routes/track.ts
