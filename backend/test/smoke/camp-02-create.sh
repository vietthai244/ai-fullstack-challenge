#!/usr/bin/env bash
# backend/test/smoke/camp-02-create.sh — CAMP-02 (draft creation)
set -euo pipefail
BASE="${BASE:-http://localhost:3000}"
EMAIL="${DEMO_EMAIL:-demo@example.com}"
PASSWORD="${DEMO_PASSWORD:-demo1234}"

# Login to get ACCESS_TOKEN
code=$(curl -sS -o /tmp/smoke-camp02-login.json -w '%{http_code}' \
  -X POST "$BASE/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
test "$code" = "200" || { echo "FAIL camp-02 login: got $code"; cat /tmp/smoke-camp02-login.json; exit 1; }
ACCESS_TOKEN=$(jq -r '.data.accessToken' /tmp/smoke-camp02-login.json)

TIMESTAMP=$(date +%s)
CAMPAIGN_NAME="Smoke $TIMESTAMP"

# 1. POST /campaigns with valid payload → 201, status=draft
code=$(curl -sS -o /tmp/smoke-camp02.json -w '%{http_code}' \
  -X POST "$BASE/campaigns" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"$CAMPAIGN_NAME\",\"subject\":\"Test subject\",\"body\":\"Test body\",\"recipientEmails\":[\"a@example.com\",\"b@example.com\"]}")
test "$code" = "201" || { echo "FAIL camp-02 create: got $code"; cat /tmp/smoke-camp02.json; exit 1; }

# Assert status is draft and id is present
jq -e '.data.status == "draft"' /tmp/smoke-camp02.json >/dev/null
jq -e '.data.id | (type == "number" or type == "string")' /tmp/smoke-camp02.json >/dev/null
jq -e '.data.name == "'"$CAMPAIGN_NAME"'"' /tmp/smoke-camp02.json >/dev/null

# Store campaign ID for potential use by other scripts
CAMPAIGN_ID=$(jq -r '.data.id' /tmp/smoke-camp02.json)
echo "$CAMPAIGN_ID" > /tmp/smoke-camp02-id.txt

# 2. POST /campaigns with missing required field → 400 VALIDATION_ERROR
code=$(curl -sS -o /tmp/smoke-camp02-bad.json -w '%{http_code}' \
  -X POST "$BASE/campaigns" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":""}')
test "$code" = "400" || { echo "FAIL camp-02 bad body: got $code (expected 400)"; cat /tmp/smoke-camp02-bad.json; exit 1; }
jq -e '.error.code == "VALIDATION_ERROR"' /tmp/smoke-camp02-bad.json >/dev/null

echo "PASS: CAMP-02"
