#!/usr/bin/env bash
# backend/test/smoke/auth-logout.sh — AUTH-04
set -euo pipefail
BASE="${BASE:-http://localhost:3000}"
EMAIL="${DEMO_EMAIL:-demo@example.com}"
PASSWORD="${DEMO_PASSWORD:-demo1234}"

COOKIE=$(mktemp)
curl -sS -o /tmp/smoke-login.json -c "$COOKIE" \
  -X POST "$BASE/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" >/dev/null

# 1. /auth/logout → 200 + {data:{ok:true}} + clears cookie
code=$(curl -sS -b "$COOKIE" -c "$COOKIE" -o /tmp/smoke-logout.json -D /tmp/smoke-logout.hdrs \
  -w '%{http_code}' -X POST "$BASE/auth/logout")
test "$code" = "200" || { echo "FAIL logout: got $code"; cat /tmp/smoke-logout.json; exit 1; }
jq -e '.data.ok == true' /tmp/smoke-logout.json >/dev/null
# Server sent a clear-cookie (rt= with Max-Age=0 or empty + matching Path=/auth)
grep -i '^Set-Cookie: rt=' /tmp/smoke-logout.hdrs | grep -qi 'Path=/auth' || \
  { echo "FAIL: logout did not emit clear-cookie for rt with Path=/auth"; cat /tmp/smoke-logout.hdrs; exit 1; }

# 2. Subsequent /refresh with the same cookie jar → 401
#    (cookie jar was updated by curl -c; the rt cookie was cleared by server response)
code=$(curl -sS -b "$COOKIE" -o /tmp/smoke-ref-after-logout.json -w '%{http_code}' \
  -X POST "$BASE/auth/refresh" \
  -H 'X-Requested-With: fetch')
test "$code" = "401" || { echo "FAIL post-logout refresh: got $code"; cat /tmp/smoke-ref-after-logout.json; exit 1; }

echo "PASS: AUTH-04"
