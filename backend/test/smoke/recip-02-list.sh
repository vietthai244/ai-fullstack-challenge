#!/usr/bin/env bash
# backend/test/smoke/recip-02-list.sh — RECIP-02 (cursor pagination)
set -euo pipefail
BASE="${BASE:-http://localhost:3000}"
EMAIL="${DEMO_EMAIL:-demo@example.com}"
PASSWORD="${DEMO_PASSWORD:-demo1234}"

# Login to get ACCESS_TOKEN
code=$(curl -sS -o /tmp/smoke-recip02-login.json -w '%{http_code}' \
  -X POST "$BASE/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
test "$code" = "200" || { echo "FAIL recip-02 login: got $code"; cat /tmp/smoke-recip02-login.json; exit 1; }
ACCESS_TOKEN=$(jq -r '.data.accessToken' /tmp/smoke-recip02-login.json)

# Ensure at least one recipient exists for meaningful cursor test
code=$(curl -sS -o /tmp/smoke-recip02-seed.json -w '%{http_code}' \
  -X POST "$BASE/recipients" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"recip-cursor-seed-$(date +%s)@example.com\",\"name\":\"Cursor Seed\"}")
test "$code" = "201" || { echo "FAIL recip-02 seed: got $code"; cat /tmp/smoke-recip02-seed.json; exit 1; }

# 1. GET /recipients → 200
code=$(curl -sS -o /tmp/smoke-recip02.json -w '%{http_code}' \
  "$BASE/recipients" \
  -H "Authorization: Bearer $ACCESS_TOKEN")
test "$code" = "200" || { echo "FAIL recip-02 list: got $code"; cat /tmp/smoke-recip02.json; exit 1; }

# Assert cursor pagination shape (NOT offset — nextCursor/hasMore, not pagination.page)
jq -e '.data | type == "array"' /tmp/smoke-recip02.json >/dev/null
jq -e 'has("nextCursor")' /tmp/smoke-recip02.json >/dev/null
jq -e 'has("hasMore")' /tmp/smoke-recip02.json >/dev/null
jq -e '.hasMore | type == "boolean"' /tmp/smoke-recip02.json >/dev/null

# 2. Test with limit=1 → if hasMore == true, nextCursor must be non-null string
code=$(curl -sS -o /tmp/smoke-recip02-limit1.json -w '%{http_code}' \
  "$BASE/recipients?limit=1" \
  -H "Authorization: Bearer $ACCESS_TOKEN")
test "$code" = "200" || { echo "FAIL recip-02 limit=1: got $code"; cat /tmp/smoke-recip02-limit1.json; exit 1; }
jq -e '.data | length <= 1' /tmp/smoke-recip02-limit1.json >/dev/null

HAS_MORE=$(jq -r '.hasMore' /tmp/smoke-recip02-limit1.json)
if [ "$HAS_MORE" = "true" ]; then
  jq -e '.nextCursor | type == "string" and length > 0' /tmp/smoke-recip02-limit1.json >/dev/null
  echo "  [hasMore=true, nextCursor present]"
else
  echo "  [hasMore=false, single page]"
fi

# 3. Test invalid cursor → 400
code=$(curl -sS -o /tmp/smoke-recip02-badcursor.json -w '%{http_code}' \
  "$BASE/recipients?cursor=badbase64!!!" \
  -H "Authorization: Bearer $ACCESS_TOKEN")
test "$code" = "400" || { echo "FAIL recip-02 bad cursor: got $code (expected 400)"; cat /tmp/smoke-recip02-badcursor.json; exit 1; }
jq -e '.error.code == "VALIDATION_ERROR"' /tmp/smoke-recip02-badcursor.json >/dev/null

echo "PASS: RECIP-02"
