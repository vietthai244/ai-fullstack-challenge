#!/usr/bin/env bash
# backend/test/smoke/run-all-phase6.sh — Phase 6 acceptance gate
#
# Prereqs:
#   1. docker compose up -d postgres redis
#   2. yarn workspace @campaign/backend db:migrate && yarn workspace @campaign/backend db:seed
#      (demo data with campaign_recipients rows exists)
#   3. yarn workspace @campaign/backend dev running on :3000
#   4. jq + psql available on PATH; DATABASE_URL set in env
#
# Usage:
#   bash backend/test/smoke/run-all-phase6.sh
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Sanity: server reachable
curl -sS -o /dev/null -w '%{http_code}' "${BASE:-http://localhost:3000}/health" | grep -q 200 \
  || { echo "FAIL: /health unreachable — is yarn dev running?"; exit 1; }

bash "$HERE/track-06.sh"
bash "$HERE/track-06-idempotent.sh"

echo ""
echo "================================================================"
echo "ALL SMOKE TESTS PASSED — Phase 6 acceptance gate green"
echo "TRACK-01"
echo "================================================================"
