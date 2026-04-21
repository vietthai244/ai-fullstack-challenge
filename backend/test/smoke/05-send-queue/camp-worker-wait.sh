#!/usr/bin/env bash
# backend/test/smoke/05-send-queue/camp-worker-wait.sh — QUEUE-02/03/04
# Tests: After POST /send, wait for worker to process and verify campaign reaches 'sent'
# Worker processes jobs asynchronously; poll GET /campaigns/:id until status=sent (max 10s)
set -euo pipefail
BASE="${BASE:-http://localhost:3000}"
EMAIL="${DEMO_EMAIL:-demo@example.com}"
PASSWORD="${DEMO_PASSWORD:-demo1234}"
MAX_WAIT="${WORKER_MAX_WAIT:-10}"  # seconds to wait for worker

code=$(curl -sS -o /tmp/smoke-ww-login.json -w '%{http_code}' \
  -X POST "$BASE/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
test "$code" = "200" || { echo "FAIL worker-wait login: got $code"; cat /tmp/smoke-ww-login.json; exit 1; }
ACCESS_TOKEN=$(jq -r '.data.accessToken' /tmp/smoke-ww-login.json)

# Create a fresh draft campaign
TIMESTAMP=$(date +%s)
code=$(curl -sS -o /tmp/smoke-ww-create.json -w '%{http_code}' \
  -X POST "$BASE/campaigns" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Smoke Worker Wait $TIMESTAMP\",\"subject\":\"Worker subject\",\"body\":\"Worker body\",\"recipientEmails\":[\"ww-a@example.com\",\"ww-b@example.com\",\"ww-c@example.com\"]}")
test "$code" = "201" || { echo "FAIL worker-wait create: got $code"; cat /tmp/smoke-ww-create.json; exit 1; }
CAMPAIGN_ID=$(jq -r '.data.id' /tmp/smoke-ww-create.json)

# Send it
code=$(curl -sS -o /tmp/smoke-ww-send.json -w '%{http_code}' \
  -X POST "$BASE/campaigns/$CAMPAIGN_ID/send" \
  -H "Authorization: Bearer $ACCESS_TOKEN")
test "$code" = "202" || { echo "FAIL worker-wait send: got $code (expected 202)"; cat /tmp/smoke-ww-send.json; exit 1; }
echo "  [campaign $CAMPAIGN_ID sent; waiting up to ${MAX_WAIT}s for worker...]"

# Poll until status=sent or timeout
elapsed=0
STATUS="sending"
while [ "$STATUS" != "sent" ] && [ "$elapsed" -lt "$MAX_WAIT" ]; do
  sleep 1
  elapsed=$((elapsed + 1))
  STATUS=$(curl -sS "$BASE/campaigns/$CAMPAIGN_ID" \
    -H "Authorization: Bearer $ACCESS_TOKEN" | jq -r '.data.status')
done

if [ "$STATUS" != "sent" ]; then
  echo "FAIL worker-wait: campaign $CAMPAIGN_ID still in status='$STATUS' after ${MAX_WAIT}s (expected 'sent')"
  echo "  Is the worker running? Check app logs for BullMQ worker errors."
  exit 1
fi
echo "  [campaign $CAMPAIGN_ID reached 'sent' in ${elapsed}s]"

# Verify stats show recipients processed (total > 0, sent+failed = total)
code=$(curl -sS -o /tmp/smoke-ww-stats.json -w '%{http_code}' \
  "$BASE/campaigns/$CAMPAIGN_ID/stats" \
  -H "Authorization: Bearer $ACCESS_TOKEN")
test "$code" = "200" || { echo "FAIL worker-wait stats: got $code"; cat /tmp/smoke-ww-stats.json; exit 1; }
jq -e '.data.total > 0' /tmp/smoke-ww-stats.json >/dev/null
jq -e '(.data.sent + .data.failed) == .data.total' /tmp/smoke-ww-stats.json >/dev/null
echo "  [stats verified: sent+failed=total]"

echo "PASS: QUEUE-02/03 worker end-to-end"
