---
status: complete
phase: 10-full-docker-stack-integration-docs
source: [10-01-SUMMARY.md, 10-02-SUMMARY.md, 10-03-SUMMARY.md, 10-04-SUMMARY.md]
started: 2026-04-22T00:00:00Z
updated: 2026-04-22T21:30:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: `docker compose up --build` completes without error. All 4 services (postgres, redis, api, web) reach healthy/started state. `docker compose exec api yarn db:seed` succeeds. `http://localhost:8080` loads the login page.
result: pass

### 2. nginx SPA proxy — /api/ routing
expected: In the browser at http://localhost:8080, logging in with demo@example.com / password123 succeeds (POST /api/auth/login returns 200 via nginx proxy, no CORS errors in console).
result: issue
reported: "POST http://localhost:8080/api/auth/login returns 404 Not Found"
severity: blocker

### 3. nginx SPA fallback — deep link refresh
expected: Navigate to http://localhost:8080 and log in. Then directly open http://localhost:8080/campaigns/1 in a new tab (hard refresh). The page loads the campaign detail (no 404 from nginx — SPA fallback returns index.html).
result: pass

### 4. Tracking pixel proxy
expected: `curl -si http://localhost:8080/track/open/00000000-0000-0000-0000-000000000000` returns 200, Content-Type: image/gif, Content-Length: 43 (proxied through nginx to the api container).
result: pass

### 5. db:migrate runs automatically on api container start
expected: Without running db:seed, restart only the api service (`docker compose restart api`). Logs show `db:migrate` completing (0 migrations pending) before the Express server binds port 3000.
result: pass

### 6. README quick start completeness
expected: Following the README Quick Start exactly (clone → cp .env.example .env → fill JWT secrets → docker compose up --build → docker compose exec api yarn db:seed → open http://localhost:8080) lands you at a working login page with no extra steps required.
result: pass

## Summary

total: 6
passed: 5
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "POST /api/auth/login proxied through nginx returns 200"
  status: failed
  reason: "User reported: POST http://localhost:8080/api/auth/login returns 404 Not Found"
  severity: blocker
  test: 2
  root_cause: "nginx.conf proxy_pass http://api:3000/api/ preserved the /api/ prefix, forwarding /api/auth/login to Express as /api/auth/login — but Express mounts routes at /auth (no /api/ prefix), causing 404"
  artifacts:
    - path: "nginx.conf"
      issue: "proxy_pass http://api:3000/api/ should be http://api:3000/ to strip the /api/ prefix"
  missing:
    - "Change proxy_pass to http://api:3000/ so nginx strips /api/ before forwarding"
  debug_session: ""
