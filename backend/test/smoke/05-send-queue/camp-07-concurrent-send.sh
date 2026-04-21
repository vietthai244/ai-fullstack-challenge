#!/usr/bin/env bash
# backend/test/smoke/05-send-queue/camp-07-concurrent-send.sh — CAMP-07 concurrent atomicity
# Tests: two simultaneous POST /send on the same draft → exactly one 202, one 409
set -euo pipefail
BASE="${BASE:-http://localhost:3000}"
EMAIL="${DEMO_EMAIL:-demo@example.com}"
PASSWORD="${DEMO_PASSWORD:-demo1234}"

code=$(curl -sS -o /tmp/smoke-conc-login.json -w '%{http_code}' \
  -X POST "$BASE/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
test "$code" = "200" || { echo "FAIL concurrent-send login: got $code"; cat /tmp/smoke-conc-login.json; exit 1; }
ACCESS_TOKEN=$(jq -r '.data.accessToken' /tmp/smoke-conc-login.json)

# Create a fresh draft campaign
TIMESTAMP=$(date +%s)
code=$(curl -sS -o /tmp/smoke-conc-create.json -w '%{http_code}' \
  -X POST "$BASE/campaigns" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Smoke Concurrent $TIMESTAMP\",\"subject\":\"Concurrent subject\",\"body\":\"Concurrent body\",\"recipientEmails\":[\"conc-a@example.com\",\"conc-b@example.com\"]}")
test "$code" = "201" || { echo "FAIL concurrent-send create: got $code"; cat /tmp/smoke-conc-create.json; exit 1; }
CAMPAIGN_ID=$(jq -r '.data.id' /tmp/smoke-conc-create.json)

# Fire two POST /send requests in parallel (background + foreground)
curl -sS -o /tmp/smoke-conc-r1.json -w '%{http_code}' \
  -X POST "$BASE/campaigns/$CAMPAIGN_ID/send" \
  -H "Authorization: Bearer $ACCESS_TOKEN" > /tmp/smoke-conc-code1.txt 2>&1 &
PID1=$!

curl -sS -o /tmp/smoke-conc-r2.json -w '%{http_code}' \
  -X POST "$BASE/campaigns/$CAMPAIGN_ID/send" \
  -H "Authorization: Bearer $ACCESS_TOKEN" > /tmp/smoke-conc-code2.txt 2>&1 &
PID2=$!

wait $PID1
wait $PID2

CODE1=$(cat /tmp/smoke-conc-code1.txt)
CODE2=$(cat /tmp/smoke-conc-code2.txt)

# One must be 202, the other 409
if { [ "$CODE1" = "202" ] && [ "$CODE2" = "409" ]; } || { [ "$CODE1" = "409" ] && [ "$CODE2" = "202" ]; }; then
  echo "  [concurrent send atomicity verified: codes $CODE1 + $CODE2]"
else
  echo "FAIL concurrent-send: expected one 202 and one 409; got $CODE1 and $CODE2"
  echo "--- response 1 ---"; cat /tmp/smoke-conc-r1.json
  echo "--- response 2 ---"; cat /tmp/smoke-conc-r2.json
  exit 1
fi

echo "PASS: CAMP-07 concurrent atomicity"
