#!/usr/bin/env bash
# backend/test/smoke/05-send-queue/run-all-phase5.sh — Phase 5 acceptance gate
#
# Prereqs (the operator must arrange before running):
#   1. `docker compose up -d postgres redis`
#   2. `yarn workspace @campaign/backend db:migrate && yarn workspace @campaign/backend db:seed`
#      (demo user demo@example.com / demo1234 exists)
#   3. `yarn workspace @campaign/backend dev` running on :3000 (BullMQ worker starts with app)
#   4. `jq` available on PATH
#
# Usage:
#   bash backend/test/smoke/05-send-queue/run-all-phase5.sh
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Sanity: server reachable
curl -sS -o /dev/null -w '%{http_code}' "${BASE:-http://localhost:3000}/health" | grep -q 200 \
  || { echo "FAIL: /health unreachable — is \`yarn dev\` running?"; exit 1; }

bash "$HERE/camp-06-schedule.sh"
bash "$HERE/camp-07-send.sh"
bash "$HERE/camp-07-concurrent-send.sh"
bash "$HERE/camp-worker-wait.sh"

echo ""
echo "================================================================"
echo "ALL SMOKE TESTS PASSED — Phase 5 acceptance gate green"
echo "CAMP-06 · CAMP-07 · QUEUE-01 · QUEUE-02 · QUEUE-03 · QUEUE-04"
echo "================================================================"
