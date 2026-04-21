#!/usr/bin/env bash
# backend/test/smoke/auth-register.sh — AUTH-01
# Prereq: yarn dev running on :3000; postgres up; jq installed.
set -euo pipefail
BASE="${BASE:-http://localhost:3000}"

# Use a unique email per run so re-running the script works without DB reset.
EMAIL="smoke-$(date +%s)-$RANDOM@example.com"

# 1. New email → 201 + { data: { id, email, name } }
code=$(curl -sS -o /tmp/smoke-reg.json -w '%{http_code}' \
  -X POST "$BASE/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"password123\",\"name\":\"Smoke Test\"}")
test "$code" = "201" || { echo "FAIL register new: got $code"; cat /tmp/smoke-reg.json; exit 1; }
jq -e ".data.email == \"$EMAIL\" and (.data.id | (type == \"number\" or type == \"string\"))" /tmp/smoke-reg.json >/dev/null

# 2. Duplicate email → 409 + EMAIL_ALREADY_REGISTERED
code=$(curl -sS -o /tmp/smoke-reg-dup.json -w '%{http_code}' \
  -X POST "$BASE/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"password123\",\"name\":\"Smoke Test\"}")
test "$code" = "409" || { echo "FAIL register dup: got $code"; cat /tmp/smoke-reg-dup.json; exit 1; }
jq -e '.error.code == "EMAIL_ALREADY_REGISTERED"' /tmp/smoke-reg-dup.json >/dev/null

# 3. Malformed body → 400 + VALIDATION_ERROR
code=$(curl -sS -o /tmp/smoke-reg-bad.json -w '%{http_code}' \
  -X POST "$BASE/auth/register" \
  -H 'Content-Type: application/json' \
  -d '{"email":"notanemail","password":"x","name":""}')
test "$code" = "400" || { echo "FAIL register bad: got $code"; cat /tmp/smoke-reg-bad.json; exit 1; }
jq -e '.error.code == "VALIDATION_ERROR"' /tmp/smoke-reg-bad.json >/dev/null

echo "PASS: AUTH-01"
