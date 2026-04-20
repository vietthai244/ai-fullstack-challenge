# Feature Landscape: Mini Campaign Manager

**Domain:** Email Campaign Management (MarTech)
**Researched:** 2026-04-20
**Updated:** 2026-04-20 (revised — open-tracking moved from anti-feature to differentiator; pagination is cursor-based)
**Confidence:** HIGH for categorization (mature, stable domain); MEDIUM for complexity estimates

## Table Stakes

Features users expect. Missing = product feels broken. For an interview project, these signal domain understanding.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Campaign CRUD with status gating | Every MarTech tool enforces immutable campaigns post-send | Low | The business rule is the point — server-enforced state machine |
| Status lifecycle badges | Visual feedback on campaign state is universal | Low | Grey/blue/amber/green. The `sending` intermediate state is the nuance evaluators look for |
| Recipient list on campaign | Audit requirement — what did I send to whom | Low | CampaignRecipient join table |
| Stats: total/sent/failed/open_rate/send_rate | Standard deliverability triangle | Low | 6 exact fields from requirements. Derived from one aggregate SQL, not stored. |
| Cursor pagination on campaign list | Scalable pattern; senior expectation for list endpoints | Low-Medium | Base64url cursor over `(created_at, id)`. `useInfiniteQuery` on the frontend. |
| Auth-gated API | No public campaign data | Low | JWT middleware, router-level |
| Schedule for future send | Time-based send is fundamental | Medium | Complexity is backend: `scheduled_at` must be future, BullMQ delayed job |
| Conditional action buttons | Don't show invalid actions in UI | Low | Mirrors server-side rules but prevents confusing UX |
| Loading and error states | Users expect feedback | Low-Medium | React Query handles most; medium complexity is worker error propagation |
| Meaningful error messages | API errors must be readable | Low | Standard Express error middleware, proper status codes |

## Differentiators

"Polish signals" for an interview project.

| Feature | Value | Complexity | Notes |
|---------|-------|------------|-------|
| Live stat polling during send | Compelling UX — watching counts increment | Medium | React Query `refetchInterval` while status = `sending` |
| `sending` intermediate badge | Shows actively processing vs just queued | Low | Amber badge + spinner, v2 requirement |
| Per-recipient status in detail | Which addresses failed — high perceived quality | Low | CampaignRecipient rows have `status` + `sent_at` |
| Realistic seed data | Evaluator can explore without manual setup | Low | User + campaigns in draft/scheduled/sent states |
| Progress bar for send_rate / open_rate | Visual delivery rate vs raw number | Low | shadcn Progress component |
| Open-tracking pixel endpoint | Matches real ESP behavior; gives `open_rate` a real story; demoable via `curl` | Medium | `GET /track/open/:trackingToken` → idempotent UPDATE + 200 GIF. Requires `tracking_token UUID` column on `campaign_recipients`. |
| Access-token / refresh-token split | Senior-level auth pattern; XSS-safe refresh cookie + short-lived in-memory access token | Medium | Memoized-promise interceptor for concurrent 401s; bootstrap rehydrate via `/auth/refresh` + `/auth/me` |

## Anti-Features (Do Not Build)

| Anti-Feature | Why Avoid | What to Do Instead | Trap Severity |
|--------------|-----------|-------------------|---------------|
| Real SMTP/SendGrid delivery | DNS, SPF/DKIM, bounce handling, compliance | Simulate with BullMQ random sent/failed. Document in README. | HIGH — spec excludes |
| WYSIWYG email editor | Tiptap/Quill are complex, inconsistent HTML | Plain `<textarea>` for body | HIGH — rabbit hole |
| Recipient list management (CSV, segments) | Each is a full feature domain | Single POST /recipient, comma-separated email input as UX shortcut | HIGH — scope creep |
| Unsubscribe/suppression | CAN-SPAM compliance — simulation doesn't send real email | Out of scope | MEDIUM |
| A/B testing / variants | Variant management, traffic splitting | Out of scope | LOW |
| Multi-user/team collaboration | RBAC, shared campaigns, audit trails | Out of scope | MEDIUM |
| Real-time WebSocket push | Adds infrastructure complexity | React Query interval polling is sufficient | MEDIUM |
| Send cancellation/retry | BullMQ job termination + rollback for partial state | `failed` is terminal in simulation. Document this. | HIGH |
| Merge tags `{{name}}` | Template parsing, recipient data lookup at render time | Out of scope | MEDIUM |
| HMAC-signed tracking tokens | Rate limiting, secret rotation | UUIDv4 `tracking_token` column — 122 bits of entropy is sufficient | LOW |
| Dark mode | Not signaled by eval criteria | Single theme | LOW |

## Campaign Status Lifecycle

```
draft → scheduled → sending → sent
  |         |
(edit,   (auto-fires
 delete)  via BullMQ
          delayed job)
```

| Status | Meaning | Allowed Operations | Color |
|--------|---------|-------------------|-------|
| `draft` | Being built | Edit, Delete, Schedule, Send | grey |
| `scheduled` | Future send time set | View only; Send (forces immediate); cancel-via-edit not supported (out of scope) | blue |
| `sending` | BullMQ job processing | Poll stats, no mutations | amber + spinner |
| `sent` | All recipients processed | View stats only | green |

**The `sending` state is the primary interview trap.** Setting `status = sent` synchronously before the worker completes is the most common mistake. Use atomic `UPDATE ... WHERE status IN ('draft', 'scheduled') RETURNING *` to prevent race conditions.

## Scheduling UX

- Use `<input type="datetime-local">` — no library needed
- **Timezone trap:** `datetime-local` returns local string without timezone. Convert: `new Date(value).toISOString()`
- Validate `scheduled_at > now()` on both client (disable past dates) and server (400 if past)
- BullMQ delayed job: `delay: new Date(scheduled_at).getTime() - Date.now()`
- Schedule and Send are separate buttons on the detail page — two-step flow. Worker re-checks status when the delayed job fires (handles cancel-via-edit cleanly).

## Stats

| Metric | Meaningful? | Notes |
|--------|------------|-------|
| `total` | Yes | COUNT(*) from CampaignRecipient |
| `sent` | Yes | COUNT WHERE status = 'sent' |
| `failed` | Yes | COUNT WHERE status = 'failed' |
| `send_rate` | Yes | sent / total — primary KPI |
| `opened` | Yes (with caveat) | Populated via tracking pixel. Caveat: Gmail / Apple proxies prefetch images → inflated opens |
| `open_rate` | Yes (with caveat) | opened / sent. Document the proxy-prefetch caveat in README |

## Hidden Complexity Flags

### Flag 1: Campaign Creation with Recipient Emails (HIGH)

Looks like a simple form field. Actually requires:
1. Parse email input (comma-separated or tag component)
2. UPSERT each email into Recipient table: `INSERT ... ON CONFLICT (email) DO UPDATE RETURNING id`
3. Create CampaignRecipient rows for resolved IDs (each auto-gets a `tracking_token` via `DEFAULT gen_random_uuid()`)
4. Wrap in a transaction

Mitigation: (a) require recipients to pre-exist — use GET /recipients picker on form, or (b) implement UPSERT-in-transaction correctly with clear comments.

### Flag 2: `sending` State Race Condition (HIGH)

Two concurrent send requests both pass status check and both enqueue. Fix with atomic UPDATE:
```sql
UPDATE campaigns SET status = 'sending' WHERE id = $1 AND status IN ('draft', 'scheduled') RETURNING *
```
Check `rowCount` before enqueuing. Two concurrent requests = exactly one 202 + one 409.

### Flag 3: Stats Without Index (MEDIUM)

`WHERE campaign_id = $1` on `campaign_recipients` without explicit index = full table scan. Evaluators check indexing decisions. Use composite `(campaign_id, status)` index.

### Flag 4: Scheduled Send Ambiguity (MEDIUM)

Does scheduling trigger automatic send? Yes — via BullMQ delayed job enqueued at schedule time. Manual Send button enqueues with no delay. Both converge to same worker function. Worker re-checks status on fire (delayed job can't assume the campaign is still in `scheduled`).

### Flag 5: Cursor Pagination Response Shape (LOW)

Don't return a raw array. Correct cursor shape:
```json
{ "data": [...], "nextCursor": "eyJjIjoi...", "hasMore": true }
```
Do NOT include a `total` count — it defeats cursor pagination's O(limit) benefit.

### Flag 6: Refresh-Token Races (HIGH — frontend)

Without a memoized in-flight promise, N concurrent 401s = N calls to `/auth/refresh` = rotation collisions that denylist each other's tokens and log the user out. Single memoized promise + queue is mandatory.

### Flag 7: Tracking Pixel Always Returns 200 (LOW — but important)

404 leaks token existence (oracle attack). Always serve the 43-byte GIF with `Content-Type: image/gif`, even when the token doesn't match any row. The GIF is a cached byte buffer, not read from disk per-request.

## MVP Build Order

**Must build (no shortcuts):**
1. Auth (register, login, refresh, logout, /me, JWT middleware with split tokens + denylist)
2. Campaign CRUD with atomic status gating
3. Status lifecycle: draft → scheduled → sending → sent
4. Cursor pagination on `/campaigns`
5. BullMQ delayed jobs for scheduled auto-send; immediate job for manual send
6. CampaignRecipient with random sent/failed simulation in worker
7. Open-tracking pixel endpoint `GET /track/open/:trackingToken`
8. Stats endpoint returning all 6 required fields via single SQL aggregate
9. Frontend: 4 required pages, status badges, conditional buttons, loading/error states, axios refresh interceptor
10. React Query polling during `sending` state
11. Docker Compose (postgres + redis + api), seed data, README with "How I Used Claude Code" section

**Low cost, high signal polish:**
- Per-recipient status rows in detail view
- Amber `sending` badge with spinner
- Progress bar using shadcn Progress for send_rate and open_rate
- Realistic seed data: 1 draft, 1 scheduled, 1 sent campaign
- `docs/DECISIONS.md` explaining 4-state machine, indexes, split-token auth, pixel-tracking design
