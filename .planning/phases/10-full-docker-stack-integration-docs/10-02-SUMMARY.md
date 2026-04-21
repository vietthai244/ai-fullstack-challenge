---
phase: 10-full-docker-stack-integration-docs
plan: "02"
subsystem: web-container
tags: [docker, nginx, frontend, spa, proxy]
dependency_graph:
  requires: []
  provides: [frontend/Dockerfile, nginx.conf]
  affects: [docker-compose.yml (web service context)]
tech_stack:
  added: [nginx:alpine, node:20-alpine multi-stage build]
  patterns: [multi-stage Dockerfile, nginx SPA reverse-proxy]
key_files:
  created:
    - nginx.conf
    - frontend/Dockerfile
  modified: []
key_decisions:
  - "nginx.conf at repo root (not frontend/); frontend/Dockerfile uses build context = repo root to COPY it"
  - "proxy_pass with trailing slash on both sides preserves /api/ and /track/ path prefixes"
  - "No VITE_API_URL: frontend uses relative paths; nginx intercepts and proxies same-origin"
  - "corepack enable in builder stage provides Yarn 4; not relying on pre-installed yarn"
metrics:
  duration: "~3min"
  completed: "2026-04-22"
  tasks_completed: 2
  files_created: 2
  files_modified: 0
---

# Phase 10 Plan 02: Frontend Dockerfile and nginx.conf Summary

Multi-stage Docker build producing nginx:alpine SPA image with reverse-proxy for API and tracking pixel requests, eliminating CORS by making all browser requests same-origin.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create nginx.conf | 52b4983 | nginx.conf |
| 2 | Create frontend/Dockerfile | 37e96ff | frontend/Dockerfile |

## What Was Built

**nginx.conf** (repo root): nginx server block that:
- Proxies `/api/` to `http://api:3000/api/` with HTTP/1.1 keep-alive and forwarding headers
- Proxies `/track/` to `http://api:3000/track/` with same headers
- Serves React SPA with `try_files $uri $uri/ /index.html` fallback for client-side routing

**frontend/Dockerfile** (multi-stage):
- Stage 1 (`node:20-alpine AS builder`): enables corepack for Yarn 4, copies workspace manifests, installs all deps with `--immutable`, builds `@campaign/shared` first, then builds `@campaign/frontend` via Vite
- Stage 2 (`nginx:alpine`): copies nginx.conf to `/etc/nginx/conf.d/default.conf`, copies compiled SPA from builder `/app/frontend/dist` to nginx html root

## Verification Results

All four plan verification checks passed:
1. `try_files $uri $uri/ /index.html` present in nginx.conf
2. Two `proxy_pass` directives (/api/ and /track/) present
3. `FROM nginx:alpine` present in frontend/Dockerfile
4. Zero `VITE_API_URL` references in either file

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None — T-10-04 (X-Real-IP / X-Forwarded-For headers) and T-10-06 (default nginx config replaced) mitigations are both implemented as required. T-10-05 (api:3000 via Docker DNS) accepted by design.

## Self-Check: PASSED

- nginx.conf: FOUND at repo root
- frontend/Dockerfile: FOUND at frontend/Dockerfile
- Commit 52b4983: exists (nginx.conf)
- Commit 37e96ff: exists (frontend/Dockerfile)
- No VITE_API_URL in either file: verified
