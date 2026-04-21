#!/usr/bin/env bash
# backend/test/smoke/recip-01-upsert.sh — RECIP-01 (email upsert with COALESCE name)
set -euo pipefail
BASE="${BASE:-http://localhost:3000}"
EMAIL="${DEMO_EMAIL:-demo@example.com}"
PASSWORD="${DEMO_PASSWORD:-demo1234}"

# Login to get ACCESS_TOKEN
code=$(curl -sS -o /tmp/smoke-recip01-login.json -w '%{http_code}' \
  -X POST "$BASE/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
test "$code" = "200" || { echo "FAIL recip-01 login: got $code"; cat /tmp/smoke-recip01-login.json; exit 1; }
ACCESS_TOKEN=$(jq -r '.data.accessToken' /tmp/smoke-recip01-login.json)

# Use a unique email per run so tests are idempotent across DB resets
RECIP_EMAIL="recip-smoke-$(date +%s)-$RANDOM@example.com"

# 1. First call — create with name
code=$(curl -sS -o /tmp/smoke-recip01-first.json -w '%{http_code}' \
  -X POST "$BASE/recipients" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$RECIP_EMAIL\",\"name\":\"First Name\"}")
test "$code" = "201" || { echo "FAIL recip-01 first call: got $code"; cat /tmp/smoke-recip01-first.json; exit 1; }
jq -e ".data.email == \"$RECIP_EMAIL\"" /tmp/smoke-recip01-first.json >/dev/null
jq -e '.data.name == "First Name"' /tmp/smoke-recip01-first.json >/dev/null
RECIP_ID=$(jq -r '.data.id' /tmp/smoke-recip01-first.json)

# 2. Second call — same email, updated name (COALESCE updates name when provided)
code=$(curl -sS -o /tmp/smoke-recip01-second.json -w '%{http_code}' \
  -X POST "$BASE/recipients" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$RECIP_EMAIL\",\"name\":\"Updated Name\"}")
test "$code" = "200" || { echo "FAIL recip-01 second call: got $code"; cat /tmp/smoke-recip01-second.json; exit 1; }
jq -e '.data.name == "Updated Name"' /tmp/smoke-recip01-second.json >/dev/null
# Assert idempotent — same record id returned
jq -e ".data.id == $RECIP_ID" /tmp/smoke-recip01-second.json >/dev/null

# 3. Third call — same email, no name (COALESCE preserves existing name when null provided)
code=$(curl -sS -o /tmp/smoke-recip01-third.json -w '%{http_code}' \
  -X POST "$BASE/recipients" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$RECIP_EMAIL\"}")
test "$code" = "200" || { echo "FAIL recip-01 third call (no name): got $code"; cat /tmp/smoke-recip01-third.json; exit 1; }
# COALESCE(EXCLUDED.name, recipients.name) → preserves "Updated Name" when no name provided
jq -e '.data.name == "Updated Name"' /tmp/smoke-recip01-third.json >/dev/null
# idempotent — same record id again
jq -e ".data.id == $RECIP_ID" /tmp/smoke-recip01-third.json >/dev/null

echo "PASS: RECIP-01"
