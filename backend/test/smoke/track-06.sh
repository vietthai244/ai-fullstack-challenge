#!/usr/bin/env bash
# backend/test/smoke/track-06.sh — TRACK-01 (criteria 1-3)
# Validates: 200 + GIF + headers for valid token, invalid token, and no-auth request.
#
# Prereqs:
#   1. docker compose up -d postgres redis
#   2. yarn workspace @campaign/backend db:migrate && yarn workspace @campaign/backend db:seed
#   3. yarn workspace @campaign/backend dev running on :3000
#   4. jq + psql available on PATH; DATABASE_URL set in env
set -euo pipefail
BASE="${BASE:-http://localhost:3000}"
DATABASE_URL="${DATABASE_URL:-postgres://postgres:postgres@localhost:5432/campaigns}"

# --- Fetch a valid tracking token from the DB ---
VALID_TOKEN=$(psql "$DATABASE_URL" -t -c \
  "SELECT tracking_token FROM campaign_recipients LIMIT 1;" 2>/dev/null | xargs)
if [ -z "$VALID_TOKEN" ]; then
  echo "SKIP track-06: no campaign_recipients rows found — run db:seed first"
  exit 0
fi

# --- Criterion 1: valid token → 200 + correct headers ---
code=$(curl -sS -o /tmp/smoke-track06-valid.gif -w '%{http_code}' \
  "$BASE/track/open/$VALID_TOKEN")
test "$code" = "200" || { echo "FAIL track-06 criterion 1: got $code (expected 200)"; exit 1; }

ct=$(curl -sS -o /dev/null -w '%{content_type}' \
  "$BASE/track/open/$VALID_TOKEN")
echo "$ct" | grep -q "image/gif" \
  || { echo "FAIL track-06 criterion 1: Content-Type was '$ct' (expected image/gif)"; exit 1; }

cl=$(curl -sS -o /dev/null -w '%{size_download}' \
  "$BASE/track/open/$VALID_TOKEN")
test "$cl" = "43" \
  || { echo "FAIL track-06 criterion 1: body size was $cl bytes (expected 43)"; exit 1; }

# --- Criterion 2: invalid token → same 200 + GIF (oracle defense) ---
FAKE="00000000-0000-0000-0000-000000000000"
code=$(curl -sS -o /tmp/smoke-track06-fake.gif -w '%{http_code}' \
  "$BASE/track/open/$FAKE")
test "$code" = "200" || { echo "FAIL track-06 criterion 2: got $code (expected 200 for invalid token)"; exit 1; }

fake_size=$(curl -sS -o /dev/null -w '%{size_download}' \
  "$BASE/track/open/$FAKE")
test "$fake_size" = "43" \
  || { echo "FAIL track-06 criterion 2: invalid token body was $fake_size bytes (expected 43)"; exit 1; }

# --- Criterion 3: no Authorization header → 200 (public route) ---
code=$(curl -sS -o /dev/null -w '%{http_code}' \
  "$BASE/track/open/$VALID_TOKEN")
test "$code" = "200" || { echo "FAIL track-06 criterion 3: got $code without auth header"; exit 1; }

echo "PASS: TRACK-01 (criteria 1-3)"
