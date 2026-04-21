---
phase: 10-full-docker-stack-integration-docs
plan: "01"
subsystem: backend/docker
tags: [docker, typescript, build-toolchain, sequelize-cli]
dependency_graph:
  requires: []
  provides: [backend-dockerfile, backend-build-script, backend-tsconfig-build]
  affects: [docker-compose, backend-runtime]
tech_stack:
  added: []
  patterns: [multi-stage-docker-build, yarn-workspaces-focus, tsc-build-tsconfig]
key_files:
  created:
    - backend/tsconfig.build.json
    - backend/Dockerfile
  modified:
    - backend/package.json
decisions:
  - "tsconfig.build.json extends tsconfig.json to inherit rootDir/strict/NodeNext and only overrides noEmit+outDir — avoids duplicating compiler settings"
  - "yarn workspaces focus @campaign/backend --production in prod stage — installs only production deps, excludes devDeps from final image"
  - "sequelize-cli runtime files (migrations/, seeders/, config.cjs, .sequelizerc) explicitly COPY'd — they are excluded from tsconfig include and never compiled"
  - "WORKDIR set to /app/backend before CMD so __dirname in .sequelizerc resolves relative paths correctly"
  - "CMD uses sh -c shell chaining to run db:migrate before node dist/index.js"
metrics:
  duration: "50s"
  completed_date: "2026-04-22"
  tasks_completed: 3
  tasks_total: 3
---

# Phase 10 Plan 01: Backend Dockerfile and Build Toolchain Summary

**One-liner:** Multi-stage Dockerfile with Yarn 4 workspaces, tsc emit via tsconfig.build.json, and sequelize-cli migration gate before server start.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create backend/tsconfig.build.json | bed77bd | backend/tsconfig.build.json |
| 2 | Fix backend/package.json build script | a29be9e | backend/package.json |
| 3 | Create backend/Dockerfile | 751a590 | backend/Dockerfile |

## What Was Built

**backend/tsconfig.build.json** — Extends `./tsconfig.json` and overrides `noEmit: false` (tsconfig.base.json sets it true), adds `outDir: dist`, disables declaration and sourceMap for lean production output.

**backend/package.json** — Replaced the echo placeholder build script with `tsc -p tsconfig.build.json`.

**backend/Dockerfile** — Two-stage build:
- Stage 1 (builder): `node:20-alpine`, corepack enable, `yarn install --immutable`, builds shared workspace then backend workspace
- Stage 2 (production): `node:20-alpine`, corepack enable, `yarn workspaces focus @campaign/backend --production`, copies compiled dist from builder, copies sequelize-cli runtime files (migrations/, seeders/, config.cjs, .sequelizerc) which are excluded from tsc

CMD: `sh -c "yarn sequelize db:migrate && node dist/index.js"` — runs migrations atomically before server boot.

## Deviations from Plan

None — plan executed exactly as written.

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes introduced. Dockerfile follows T-10-01 (no secrets baked in — all via env_file at runtime) and T-10-02 (`yarn install --immutable` enforces lock file integrity).

## Self-Check

- backend/tsconfig.build.json: FOUND (contains `"noEmit": false` and `"outDir": "dist"`)
- backend/package.json build script: FOUND (`tsc -p tsconfig.build.json`)
- backend/Dockerfile: FOUND (builder stage + db:migrate CMD)
- Commits: bed77bd, a29be9e, 751a590 — all present in git log

## Self-Check: PASSED
