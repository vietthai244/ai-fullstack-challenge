# Feature Landscape: Mini Campaign Manager

**Domain:** Email Campaign Management (MarTech)
**Researched:** 2026-04-20
**Confidence:** HIGH for categorization (mature, stable domain); MEDIUM for complexity estimates

## Table Stakes

Features users expect. Missing = product feels broken. For an interview project, these signal domain understanding.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Campaign CRUD with status gating | Every MarTech tool enforces immutable campaigns post-send | Low | The business rule is the point — server-enforced state machine |
| Status lifecycle badges | Visual feedback on campaign state is universal | Low | Grey/blue/yellow/green. The `sending` intermediate state is the nuance evaluators look for |
| Recipient list on campaign | Audit requirement — what did I send to whom | Low | CampaignRecipient join table |
| Stats: total/sent/failed/open_rate/send_rate | Standard deliverability triangle | Low | 6 exact fields from requirements. Derived, not stored. |
| Pagination on campaign list | Any list >20 items needs it | Low | Offset/limit. Spec explicitly asks for it. |
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
| `sending` intermediate badge | Shows actively processing vs just queued | Low | Yellow badge, v2 requirement |
| Per-recipient status in detail | Which addresses failed — high perceived quality | Low | CampaignRecipient rows have `status` + `sent_at` |
| Realistic seed data | Evaluator can explore without manual setup | Low | User + campaigns in draft/scheduled/sent states |
| Progress bar for send_rate | Visual delivery rate vs raw number | Low | shadcn Progress component |

## Anti-Features (Do Not Build)

| Anti-Feature | Why Avoid | What to Do Instead | Trap Severity |
|--------------|-----------|-------------------|---------------|
| Real SMTP/SendGrid delivery | DNS, SPF/DKIM, bounce handling, compliance | Simulate with BullMQ random sent/failed. Document in README. | HIGH — spec excludes |
| Email open tracking pixel | Hosted image URL, tracking endpoint, privacy clients block it | `opened_at` stays null. Show `opened: 0`. Explain in README. | MEDIUM — field exists, tempting |
| WYSIWYG email editor | Tiptap/Quill are complex, inconsistent HTML | Plain `<textarea>` for body | HIGH — rabbit hole |
| Recipient list management (CSV, segments) | Each is a full feature domain | Single POST /recipient, comma-separated email input as UX shortcut | HIGH — scope creep |
| Unsubscribe/suppression | CAN-SPAM compliance — simulation doesn't send real email | Out of scope | MEDIUM |
| A/B testing / variants | Variant management, traffic splitting | Out of scope | LOW |
| Multi-user/team collaboration | RBAC, shared campaigns, audit trails | Out of scope | MEDIUM |
| Real-time WebSocket push | Adds infrastructure complexity | React Query interval polling is sufficient | MEDIUM |
| Send cancellation/retry | BullMQ job termination + rollback for partial state | `failed` is terminal in simulation. Document this. | HIGH |
| Merge tags `{{name}}` | Template parsing, recipient data lookup at render time | Out of scope | MEDIUM |

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
| `draft` | Being built | Edit, Delete, Schedule | grey |
| `scheduled` | Future send time set | View only (auto-fires at scheduled_at) | blue |
| `sending` | BullMQ job processing | Poll stats, no mutations | yellow |
| `sent` | All recipients processed | View stats only | green |

**The `sending` state is the primary interview trap.** Setting `status = sent` synchronously before the worker completes is the most common mistake. Use atomic `UPDATE ... WHERE status IN ('draft', 'scheduled') RETURNING *` to prevent race conditions.

## Scheduling UX

- Use `<input type="datetime-local">` — no library needed
- **Timezone trap:** `datetime-local` returns local string without timezone. Convert: `new Date(value).toISOString()`
- Validate `scheduled_at > now()` on both client (disable past dates) and server (422 if past)
- BullMQ delayed job: `delay: new Date(scheduled_at).getTime() - Date.now()`
- Schedule and Send are separate buttons on the detail page — two-step flow

## Stats

| Metric | Meaningful? | Notes |
|--------|------------|-------|
| `total` | Yes | COUNT(*) from CampaignRecipient |
| `sent` | Yes | COUNT WHERE status = 'sent' |
| `failed` | Yes | COUNT WHERE status = 'failed' |
| `send_rate` | Yes | sent / total — primary KPI |
| `opened` | Informational | Always 0 in simulation. Keep it. Document why. |
| `open_rate` | Informational | Always 0.00. opened / sent. Document in README. |

## Hidden Complexity Flags

### Flag 1: Campaign Creation with Recipient Emails (HIGH)

Looks like a simple form field. Actually requires:
1. Parse email input (comma-separated or tag component)
2. UPSERT each email into Recipient table: `INSERT ... ON CONFLICT (email) DO UPDATE RETURNING id`
3. Create CampaignRecipient rows for resolved IDs
4. Wrap in a transaction

Mitigation: (a) require recipients to pre-exist — use GET /recipients picker on form, or (b) implement UPSERT-in-transaction correctly with clear comments.

### Flag 2: `sending` State Race Condition (HIGH)

Two concurrent send requests both pass status check and both enqueue. Fix with atomic UPDATE:
```sql
UPDATE campaigns SET status = 'sending' WHERE id = $1 AND status IN ('draft', 'scheduled') RETURNING *
```
Check `rowCount` before enqueuing.

### Flag 3: Stats Without Index (MEDIUM)

`WHERE campaign_id = $1` on `campaign_recipients` without explicit index = full table scan. Evaluators check indexing decisions.

### Flag 4: Scheduled Send Ambiguity (MEDIUM)

Does scheduling trigger automatic send? Yes — via BullMQ delayed job enqueued at schedule time. Manual Send button enqueues with no delay. Both converge to same worker function.

### Flag 5: Pagination Response Shape (LOW)

Don't return a raw array. Correct:
```json
{ "data": [...], "pagination": { "total": 42, "page": 1, "pageSize": 10, "totalPages": 5 } }
```

## MVP Build Order

**Must build (no shortcuts):**
1. Auth (register, login, JWT middleware)
2. Campaign CRUD with atomic status gating
3. Status lifecycle: draft → scheduled → sending → sent
4. BullMQ delayed jobs for scheduled auto-send; immediate job for manual send
5. CampaignRecipient with random sent/failed simulation in worker
6. Stats endpoint returning all 6 required fields
7. Frontend: 4 required pages, status badges, conditional buttons, loading/error states
8. React Query polling during `sending` state
9. Docker Compose, seed data, README with Claude Code section

**Low cost, high signal polish:**
- Per-recipient status rows in detail view
- Yellow `sending` badge with spinner
- Progress bar using shadcn Progress for send_rate
- Realistic seed data: 1 draft, 1 scheduled, 1 sent campaign
