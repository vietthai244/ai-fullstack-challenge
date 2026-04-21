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
