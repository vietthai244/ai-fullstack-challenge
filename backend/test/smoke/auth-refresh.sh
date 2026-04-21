#!/usr/bin/env bash
# backend/test/smoke/auth-refresh.sh — AUTH-03 (rotation + denylist + CSRF)
set -euo pipefail
BASE="${BASE:-http://localhost:3000}"
EMAIL="${DEMO_EMAIL:-demo@example.com}"
PASSWORD="${DEMO_PASSWORD:-demo1234}"

COOKIE=$(mktemp)
# Login to get the initial rt cookie
curl -sS -o /tmp/smoke-login.json -c "$COOKIE" \
  -X POST "$BASE/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" >/dev/null
FIRST_ACCESS=$(jq -r '.data.accessToken' /tmp/smoke-login.json)

# 1. /refresh WITHOUT X-Requested-With → 401 CSRF_CHECK_FAILED
code=$(curl -sS -b "$COOKIE" -o /tmp/smoke-ref-csrf.json -w '%{http_code}' \
  -X POST "$BASE/auth/refresh")
test "$code" = "401" || { echo "FAIL csrf: got $code"; cat /tmp/smoke-ref-csrf.json; exit 1; }
jq -e '.error.code == "CSRF_CHECK_FAILED"' /tmp/smoke-ref-csrf.json >/dev/null

# 2. /refresh WITH X-Requested-With → 200 + new accessToken + new rt cookie
COOKIE2=$(mktemp)
code=$(curl -sS -b "$COOKIE" -c "$COOKIE2" -o /tmp/smoke-ref.json -w '%{http_code}' \
  -X POST "$BASE/auth/refresh" \
  -H 'X-Requested-With: fetch')
test "$code" = "200" || { echo "FAIL refresh: got $code"; cat /tmp/smoke-ref.json; exit 1; }
NEW_ACCESS=$(jq -r '.data.accessToken' /tmp/smoke-ref.json)
test -n "$NEW_ACCESS" && test "$NEW_ACCESS" != "$FIRST_ACCESS" || \
  { echo "FAIL: new access token is missing or identical to the first"; exit 1; }

# 3. Replay defense: reusing the OLD cookie ($COOKIE) again → 401 TOKEN_REVOKED
code=$(curl -sS -b "$COOKIE" -o /tmp/smoke-ref-replay.json -w '%{http_code}' \
  -X POST "$BASE/auth/refresh" \
  -H 'X-Requested-With: fetch')
test "$code" = "401" || { echo "FAIL replay: got $code"; cat /tmp/smoke-ref-replay.json; exit 1; }
jq -e '.error.code == "TOKEN_REVOKED"' /tmp/smoke-ref-replay.json >/dev/null

# 4. The NEW cookie should still work
code=$(curl -sS -b "$COOKIE2" -c "$COOKIE2" -o /tmp/smoke-ref2.json -w '%{http_code}' \
  -X POST "$BASE/auth/refresh" \
  -H 'X-Requested-With: fetch')
test "$code" = "200" || { echo "FAIL second refresh with new cookie: got $code"; cat /tmp/smoke-ref2.json; exit 1; }

echo "PASS: AUTH-03"
