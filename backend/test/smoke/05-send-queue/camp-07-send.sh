#!/usr/bin/env bash
# backend/test/smoke/05-send-queue/camp-07-send.sh — CAMP-07
# Tests: POST /campaigns/:id/send
#   1. Create a draft campaign
#   2. Send it → 202 + status=sending
#   3. Send again → 409 CAMPAIGN_NOT_SENDABLE
set -euo pipefail
BASE="${BASE:-http://localhost:3000}"
EMAIL="${DEMO_EMAIL:-demo@example.com}"
PASSWORD="${DEMO_PASSWORD:-demo1234}"

code=$(curl -sS -o /tmp/smoke-camp07-login.json -w '%{http_code}' \
  -X POST "$BASE/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
test "$code" = "200" || { echo "FAIL camp-07 login: got $code"; cat /tmp/smoke-camp07-login.json; exit 1; }
ACCESS_TOKEN=$(jq -r '.data.accessToken' /tmp/smoke-camp07-login.json)

# 1. Create a fresh draft campaign
TIMESTAMP=$(date +%s)
code=$(curl -sS -o /tmp/smoke-camp07-create.json -w '%{http_code}' \
  -X POST "$BASE/campaigns" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Smoke Send $TIMESTAMP\",\"subject\":\"Send subject\",\"body\":\"Send body\",\"recipientEmails\":[\"send-a@example.com\",\"send-b@example.com\",\"send-c@example.com\"]}")
test "$code" = "201" || { echo "FAIL camp-07 create draft: got $code"; cat /tmp/smoke-camp07-create.json; exit 1; }
CAMPAIGN_ID=$(jq -r '.data.id' /tmp/smoke-camp07-create.json)

# 2. Send → 202
code=$(curl -sS -o /tmp/smoke-camp07-send.json -w '%{http_code}' \
  -X POST "$BASE/campaigns/$CAMPAIGN_ID/send" \
  -H "Authorization: Bearer $ACCESS_TOKEN")
test "$code" = "202" || { echo "FAIL camp-07 send: got $code (expected 202)"; cat /tmp/smoke-camp07-send.json; exit 1; }
jq -e '.data.status == "sending"' /tmp/smoke-camp07-send.json >/dev/null
jq -e '.data.id | (type == "number" or type == "string")' /tmp/smoke-camp07-send.json >/dev/null
echo "  [202 send verified for campaign $CAMPAIGN_ID]"

# 3. Send again → 409 (already sending)
code=$(curl -sS -o /tmp/smoke-camp07-409.json -w '%{http_code}' \
  -X POST "$BASE/campaigns/$CAMPAIGN_ID/send" \
  -H "Authorization: Bearer $ACCESS_TOKEN")
test "$code" = "409" || { echo "FAIL camp-07 duplicate send: got $code (expected 409)"; cat /tmp/smoke-camp07-409.json; exit 1; }
jq -e '.error.code == "CAMPAIGN_NOT_SENDABLE"' /tmp/smoke-camp07-409.json >/dev/null
echo "  [409 CAMPAIGN_NOT_SENDABLE verified]"

echo "PASS: CAMP-07"
