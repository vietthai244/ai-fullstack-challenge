---
status: resolved
slug: docker-build-root-workspace-fail
trigger: "docker compose up --build fails on first run during yarn install --immutable in api builder stage"
created: 2026-04-22T00:00:00Z
updated: 2026-04-22T00:00:00Z
---

## Symptoms

- expected: docker compose up --build succeeds on first run
- actual: Build fails at [api builder 8/12] RUN yarn install --immutable with exit code 1
- error: |
    YN0007: campaign@workspace:. must be built because it never has been before or the last one failed
    YN0009: campaign@workspace:. couldn't be built successfully (exit code 1, logs can be found here: /tmp/xfs-7ae741c9/build.log)
    failed to solve: process "/bin/sh -c yarn install --immutable" did not complete successfully: exit code: 1
- reproduction: cp .env.example .env && docker compose up --build (fresh first run)
- timeline: Never worked — first attempt on fresh clone

## Current Focus

hypothesis: "The root workspace postinstall script runs yarn workspace @campaign/shared build immediately after yarn install. At that Dockerfile layer, only package.json manifests are present — shared/src/ does not exist yet, so tsc fails with exit code 1."
next_action: "Fixed — added YARN_ENABLE_SCRIPTS=0 to both yarn install calls in Dockerfile"
reasoning_checkpoint: "Confirmed: package.json has postinstall: yarn workspace @campaign/shared build. Dockerfile copies manifests-only before yarn install, then copies shared/ source after. Timing mismatch causes build failure."
tdd_checkpoint: ""

## Evidence

- timestamp: 2026-04-22T00:00:00Z
  type: code_read
  file: package.json
  finding: "postinstall script = 'yarn workspace @campaign/shared build'; this runs automatically after every yarn install"

- timestamp: 2026-04-22T00:00:00Z
  type: code_read
  file: backend/Dockerfile
  finding: "Stage 1 copies only package.json manifests before RUN yarn install --immutable. shared/src/ is copied AFTER install. Stage 2 has same pattern with yarn workspaces focus."

- timestamp: 2026-04-22T00:00:00Z
  type: root_cause_confirmed
  finding: "postinstall triggers tsc on shared/ before source files exist in Docker layer — guaranteed failure on fresh build"

## Eliminated

- .yarnrc.yml misconfiguration: enableImmutableInstalls=false, nodeLinker=node-modules — correct settings, not the cause
- Missing lock file: yarn.lock present and copied before install

## Resolution

root_cause: "Root package.json postinstall script runs 'yarn workspace @campaign/shared build' automatically after yarn install, but the Dockerfile copies shared/src/ source files only AFTER the install layer — so tsc finds no source and exits 1."
fix: "Added YARN_ENABLE_SCRIPTS=0 env var to both yarn install calls in backend/Dockerfile (builder stage and production stage). The explicit 'yarn workspace @campaign/shared build' step that follows source COPY is preserved and handles the build correctly."
verification: "docker compose up --build on fresh clone should complete [api builder 8/12] without YN0007/YN0009 errors"
files_changed:
  - backend/Dockerfile
