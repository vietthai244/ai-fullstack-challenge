#!/usr/bin/env bash
# backend/test/smoke/auth-me.sh — AUTH-05
set -euo pipefail
BASE="${BASE:-http://localhost:3000}"
EMAIL="${DEMO_EMAIL:-demo@example.com}"
PASSWORD="${DEMO_PASSWORD:-demo1234}"

# Get an access token
curl -sS -o /tmp/smoke-login.json \
  -X POST "$BASE/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" >/dev/null
ACCESS=$(jq -r '.data.accessToken' /tmp/smoke-login.json)

# 1. /auth/me with valid Bearer → 200 + {id, email, name}
code=$(curl -sS -o /tmp/smoke-me.json -w '%{http_code}' \
  -H "Authorization: Bearer $ACCESS" "$BASE/auth/me")
test "$code" = "200" || { echo "FAIL me valid: got $code"; cat /tmp/smoke-me.json; exit 1; }
jq -e ".data.email == \"$EMAIL\" and (.data.id | (type == \"number\" or type == \"string\"))" /tmp/smoke-me.json >/dev/null

# 2. /auth/me without Bearer → 401 MISSING_TOKEN
code=$(curl -sS -o /tmp/smoke-me-missing.json -w '%{http_code}' "$BASE/auth/me")
test "$code" = "401" || { echo "FAIL me missing: got $code"; cat /tmp/smoke-me-missing.json; exit 1; }
jq -e '.error.code == "MISSING_TOKEN"' /tmp/smoke-me-missing.json >/dev/null

# 3. /auth/me with tampered Bearer → 401 INVALID_TOKEN
code=$(curl -sS -o /tmp/smoke-me-tampered.json -w '%{http_code}' \
  -H "Authorization: Bearer not.a.real.token" "$BASE/auth/me")
test "$code" = "401" || { echo "FAIL me tampered: got $code"; cat /tmp/smoke-me-tampered.json; exit 1; }
jq -e '.error.code == "INVALID_TOKEN"' /tmp/smoke-me-tampered.json >/dev/null

echo "PASS: AUTH-05"
