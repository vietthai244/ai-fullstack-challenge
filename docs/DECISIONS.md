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
