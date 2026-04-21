#!/usr/bin/env bash
# backend/test/smoke/auth-login.sh — AUTH-02
set -euo pipefail
BASE="${BASE:-http://localhost:3000}"
EMAIL="${DEMO_EMAIL:-demo@example.com}"
PASSWORD="${DEMO_PASSWORD:-demo1234}"

# 1. Valid creds → 200 + accessToken + user + Set-Cookie rt
COOKIE=$(mktemp)
HDRS=$(mktemp)
code=$(curl -sS -o /tmp/smoke-login.json -D "$HDRS" -c "$COOKIE" \
  -w '%{http_code}' \
  -X POST "$BASE/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
test "$code" = "200" || { echo "FAIL login: got $code"; cat /tmp/smoke-login.json; exit 1; }
jq -e '(.data.accessToken | length > 20) and (.data.user.email | length > 0)' /tmp/smoke-login.json >/dev/null

# 2. Set-Cookie carries HttpOnly + SameSite=Strict + Path=/auth
grep -i '^Set-Cookie:' "$HDRS" | grep -qi 'HttpOnly'     || { echo "FAIL: missing HttpOnly"; cat "$HDRS"; exit 1; }
grep -i '^Set-Cookie:' "$HDRS" | grep -qi 'SameSite=Strict' || { echo "FAIL: missing SameSite=Strict"; cat "$HDRS"; exit 1; }
grep -i '^Set-Cookie:' "$HDRS" | grep -qi 'Path=/auth'   || { echo "FAIL: missing Path=/auth"; cat "$HDRS"; exit 1; }
# Cookie jar has `rt`
grep -q $'\trt\t' "$COOKIE" || { echo "FAIL: cookie jar missing rt"; cat "$COOKIE"; exit 1; }

# 3. Wrong password → 401 INVALID_CREDENTIALS
code=$(curl -sS -o /tmp/smoke-login-bad.json -w '%{http_code}' \
  -X POST "$BASE/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"wrong\"}")
test "$code" = "401" || { echo "FAIL bad pw: got $code"; cat /tmp/smoke-login-bad.json; exit 1; }
jq -e '.error.code == "INVALID_CREDENTIALS"' /tmp/smoke-login-bad.json >/dev/null

# 4. Unknown email → 401 INVALID_CREDENTIALS (same code as wrong pw — enumeration defense)
code=$(curl -sS -o /tmp/smoke-login-nouser.json -w '%{http_code}' \
  -X POST "$BASE/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"nobody-here@example.com","password":"whatever"}')
test "$code" = "401" || { echo "FAIL no user: got $code"; cat /tmp/smoke-login-nouser.json; exit 1; }
jq -e '.error.code == "INVALID_CREDENTIALS"' /tmp/smoke-login-nouser.json >/dev/null

echo "PASS: AUTH-02"
