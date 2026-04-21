#!/usr/bin/env bash
# backend/test/smoke/run-all-phase4.sh — Phase 4 acceptance gate
#
# Prereqs (the operator must arrange before running):
#   1. `docker compose up -d postgres redis`
#   2. `yarn workspace @campaign/backend db:migrate && yarn workspace @campaign/backend db:seed`
#      (demo user demo@example.com / demo1234 exists)
#   3. `yarn workspace @campaign/backend dev` running on :3000
#   4. `jq` available on PATH
#
# Usage:
#   bash backend/test/smoke/run-all-phase4.sh
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Sanity: server reachable
curl -sS -o /dev/null -w '%{http_code}' "${BASE:-http://localhost:3000}/health" | grep -q 200 \
  || { echo "FAIL: /health unreachable — is \`yarn dev\` running?"; exit 1; }

bash "$HERE/camp-01-list.sh"
bash "$HERE/camp-02-create.sh"
bash "$HERE/camp-03-detail.sh"
bash "$HERE/camp-04-patch.sh"
bash "$HERE/camp-05-delete.sh"
bash "$HERE/camp-08-stats.sh"
bash "$HERE/recip-01-upsert.sh"
bash "$HERE/recip-02-list.sh"

echo ""
echo "================================================================"
echo "ALL SMOKE TESTS PASSED — Phase 4 acceptance gate green"
echo "CAMP-01 · CAMP-02 · CAMP-03 · CAMP-04 · CAMP-05 · CAMP-08"
echo "RECIP-01 · RECIP-02"
echo "================================================================"
