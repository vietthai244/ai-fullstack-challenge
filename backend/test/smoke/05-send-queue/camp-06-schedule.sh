#!/usr/bin/env bash
# backend/test/smoke/05-send-queue/camp-06-schedule.sh — CAMP-06
# Tests: POST /campaigns/:id/schedule
#   1. Create a draft campaign
#   2. Schedule it with a future scheduled_at → 202 + status=scheduled
#   3. Try to schedule again → 409 CAMPAIGN_NOT_SCHEDULABLE
#   4. Try to schedule with past date → 400 SCHEDULED_AT_NOT_FUTURE
set -euo pipefail
BASE="${BASE:-http://localhost:3000}"
EMAIL="${DEMO_EMAIL:-demo@example.com}"
PASSWORD="${DEMO_PASSWORD:-demo1234}"

code=$(curl -sS -o /tmp/smoke-camp06-login.json -w '%{http_code}' \
  -X POST "$BASE/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
test "$code" = "200" || { echo "FAIL camp-06 login: got $code"; cat /tmp/smoke-camp06-login.json; exit 1; }
ACCESS_TOKEN=$(jq -r '.data.accessToken' /tmp/smoke-camp06-login.json)

# 1. Create a fresh draft campaign
TIMESTAMP=$(date +%s)
code=$(curl -sS -o /tmp/smoke-camp06-create.json -w '%{http_code}' \
  -X POST "$BASE/campaigns" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Smoke Schedule $TIMESTAMP\",\"subject\":\"Schedule subject\",\"body\":\"Schedule body\",\"recipientEmails\":[\"sched-a@example.com\",\"sched-b@example.com\"]}")
test "$code" = "201" || { echo "FAIL camp-06 create draft: got $code"; cat /tmp/smoke-camp06-create.json; exit 1; }
CAMPAIGN_ID=$(jq -r '.data.id' /tmp/smoke-camp06-create.json)

# 2. Schedule with a future date (30 minutes from now)
FUTURE_AT=$(date -u -v +30M +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -d "+30 minutes" +"%Y-%m-%dT%H:%M:%SZ")
code=$(curl -sS -o /tmp/smoke-camp06-sched.json -w '%{http_code}' \
  -X POST "$BASE/campaigns/$CAMPAIGN_ID/schedule" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"scheduled_at\":\"$FUTURE_AT\"}")
test "$code" = "202" || { echo "FAIL camp-06 schedule: got $code (expected 202)"; cat /tmp/smoke-camp06-sched.json; exit 1; }
jq -e '.data.status == "scheduled"' /tmp/smoke-camp06-sched.json >/dev/null
jq -e '.data.id | (type == "number" or type == "string")' /tmp/smoke-camp06-sched.json >/dev/null
echo "  [202 schedule verified for campaign $CAMPAIGN_ID]"

# 3. Try to schedule again → 409 (already scheduled)
code=$(curl -sS -o /tmp/smoke-camp06-409.json -w '%{http_code}' \
  -X POST "$BASE/campaigns/$CAMPAIGN_ID/schedule" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"scheduled_at\":\"$FUTURE_AT\"}")
test "$code" = "409" || { echo "FAIL camp-06 duplicate schedule: got $code (expected 409)"; cat /tmp/smoke-camp06-409.json; exit 1; }
jq -e '.error.code == "CAMPAIGN_NOT_SCHEDULABLE"' /tmp/smoke-camp06-409.json >/dev/null
echo "  [409 CAMPAIGN_NOT_SCHEDULABLE verified]"

# 4. Create another draft and try past date → 400
TIMESTAMP2=$(date +%s)
code=$(curl -sS -o /tmp/smoke-camp06-create2.json -w '%{http_code}' \
  -X POST "$BASE/campaigns" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Smoke Schedule Past $TIMESTAMP2\",\"subject\":\"Past subject\",\"body\":\"Past body\",\"recipientEmails\":[\"sched-c@example.com\"]}")
test "$code" = "201" || { echo "FAIL camp-06 create draft 2: got $code"; cat /tmp/smoke-camp06-create2.json; exit 1; }
CAMPAIGN_ID2=$(jq -r '.data.id' /tmp/smoke-camp06-create2.json)

PAST_AT="2020-01-01T00:00:00Z"
code=$(curl -sS -o /tmp/smoke-camp06-400.json -w '%{http_code}' \
  -X POST "$BASE/campaigns/$CAMPAIGN_ID2/schedule" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"scheduled_at\":\"$PAST_AT\"}")
test "$code" = "400" || { echo "FAIL camp-06 past date: got $code (expected 400)"; cat /tmp/smoke-camp06-400.json; exit 1; }
jq -e '.error.code == "SCHEDULED_AT_NOT_FUTURE"' /tmp/smoke-camp06-400.json >/dev/null
echo "  [400 SCHEDULED_AT_NOT_FUTURE verified]"

echo "PASS: CAMP-06"
