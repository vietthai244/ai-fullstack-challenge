#!/usr/bin/env bash
# backend/test/smoke/auth-guard.sh — AUTH-06 + AUTH-07 (stub proof)
set -euo pipefail
BASE="${BASE:-http://localhost:3000}"
EMAIL="${DEMO_EMAIL:-demo@example.com}"
PASSWORD="${DEMO_PASSWORD:-demo1234}"

# 1. AUTH-06: /campaigns/1 without Bearer → 401 MISSING_TOKEN
code=$(curl -sS -o /tmp/smoke-g-missing.json -w '%{http_code}' "$BASE/campaigns/1")
test "$code" = "401" || { echo "FAIL guard missing: got $code"; cat /tmp/smoke-g-missing.json; exit 1; }
jq -e '.error.code == "MISSING_TOKEN"' /tmp/smoke-g-missing.json >/dev/null

# 2. AUTH-06: /recipients/1 without Bearer → 401
code=$(curl -sS -o /tmp/smoke-g-recip.json -w '%{http_code}' "$BASE/recipients/1")
test "$code" = "401" || { echo "FAIL guard recipients: got $code"; cat /tmp/smoke-g-recip.json; exit 1; }

# 3. AUTH-06: tampered Bearer → 401 INVALID_TOKEN
code=$(curl -sS -o /tmp/smoke-g-tampered.json -w '%{http_code}' \
  -H "Authorization: Bearer xxx.yyy.zzz" "$BASE/campaigns/1")
test "$code" = "401" || { echo "FAIL guard tampered: got $code"; cat /tmp/smoke-g-tampered.json; exit 1; }
jq -e '.error.code == "INVALID_TOKEN"' /tmp/smoke-g-tampered.json >/dev/null

# 4. AUTH-07 shape: with valid Bearer on a non-owned/non-existent campaign → 404 (not 403)
curl -sS -o /tmp/smoke-login.json \
  -X POST "$BASE/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" >/dev/null
ACCESS=$(jq -r '.data.accessToken' /tmp/smoke-login.json)

code=$(curl -sS -o /tmp/smoke-g-404.json -w '%{http_code}' \
  -H "Authorization: Bearer $ACCESS" "$BASE/campaigns/99999")
test "$code" = "404" || { echo "FAIL AUTH-07 shape: got $code (want 404)"; cat /tmp/smoke-g-404.json; exit 1; }
jq -e '.error.code == "CAMPAIGN_NOT_FOUND"' /tmp/smoke-g-404.json >/dev/null

echo "PASS: AUTH-06 + AUTH-07 (stub)"
