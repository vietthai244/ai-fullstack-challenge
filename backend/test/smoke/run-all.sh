#!/usr/bin/env bash
# backend/test/smoke/run-all.sh — Phase 3 acceptance gate
#
# Prereqs (the operator must arrange before running):
#   1. `docker compose up -d postgres redis`
#   2. `yarn workspace @campaign/backend db:migrate && yarn workspace @campaign/backend db:seed`
#      (demo user demo@example.com / demo1234 exists)
#   3. `yarn workspace @campaign/backend dev` running on :3000
#   4. `jq` available on PATH
#
# Usage:
#   bash backend/test/smoke/run-all.sh
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Sanity: server reachable
curl -sS -o /dev/null -w '%{http_code}' "${BASE:-http://localhost:3000}/health" | grep -q 200 \
  || { echo "FAIL: /health unreachable — is \`yarn dev\` running?"; exit 1; }

bash "$HERE/auth-register.sh"
bash "$HERE/auth-login.sh"
bash "$HERE/auth-refresh.sh"
bash "$HERE/auth-logout.sh"
bash "$HERE/auth-me.sh"
bash "$HERE/auth-guard.sh"

echo ""
echo "================================================================"
echo "ALL SMOKE TESTS PASSED — Phase 3 acceptance gate green"
echo "AUTH-01 · AUTH-02 · AUTH-03 · AUTH-04 · AUTH-05 · AUTH-06 · AUTH-07"
echo "================================================================"
