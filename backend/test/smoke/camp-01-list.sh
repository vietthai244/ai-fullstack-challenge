#!/usr/bin/env bash
# backend/test/smoke/camp-01-list.sh — CAMP-01 (offset pagination)
set -euo pipefail
BASE="${BASE:-http://localhost:3000}"
EMAIL="${DEMO_EMAIL:-demo@example.com}"
PASSWORD="${DEMO_PASSWORD:-demo1234}"

# Login to get ACCESS_TOKEN
code=$(curl -sS -o /tmp/smoke-camp01-login.json -w '%{http_code}' \
  -X POST "$BASE/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
test "$code" = "200" || { echo "FAIL camp-01 login: got $code"; cat /tmp/smoke-camp01-login.json; exit 1; }
ACCESS_TOKEN=$(jq -r '.data.accessToken' /tmp/smoke-camp01-login.json)

# 1. GET /campaigns → 200 with offset pagination envelope
code=$(curl -sS -o /tmp/smoke-camp01.json -w '%{http_code}' \
  "$BASE/campaigns" \
  -H "Authorization: Bearer $ACCESS_TOKEN")
test "$code" = "200" || { echo "FAIL camp-01 list: got $code"; cat /tmp/smoke-camp01.json; exit 1; }

# Assert pagination fields present (offset shape, NOT cursor shape)
jq -e '.data | type == "array"' /tmp/smoke-camp01.json >/dev/null
jq -e '.pagination.page | type == "number"' /tmp/smoke-camp01.json >/dev/null
jq -e '.pagination.limit | type == "number"' /tmp/smoke-camp01.json >/dev/null
jq -e '.pagination.total | type == "number"' /tmp/smoke-camp01.json >/dev/null
jq -e '.pagination.totalPages | type == "number"' /tmp/smoke-camp01.json >/dev/null

# 2. Page 2 with limit=5 → 200, pagination.page === 2
code=$(curl -sS -o /tmp/smoke-camp01-p2.json -w '%{http_code}' \
  "$BASE/campaigns?page=2&limit=5" \
  -H "Authorization: Bearer $ACCESS_TOKEN")
test "$code" = "200" || { echo "FAIL camp-01 page2: got $code"; cat /tmp/smoke-camp01-p2.json; exit 1; }
jq -e '.pagination.page == 2' /tmp/smoke-camp01-p2.json >/dev/null

# 3. Invalid limit (>100) → 400 VALIDATION_ERROR
code=$(curl -sS -o /tmp/smoke-camp01-bad.json -w '%{http_code}' \
  "$BASE/campaigns?limit=999" \
  -H "Authorization: Bearer $ACCESS_TOKEN")
test "$code" = "400" || { echo "FAIL camp-01 invalid limit: got $code (expected 400)"; cat /tmp/smoke-camp01-bad.json; exit 1; }
jq -e '.error.code == "VALIDATION_ERROR"' /tmp/smoke-camp01-bad.json >/dev/null

echo "PASS: CAMP-01"
