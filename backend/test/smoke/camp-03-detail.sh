#!/usr/bin/env bash
# backend/test/smoke/camp-03-detail.sh — CAMP-03 (eager-load + inline stats)
set -euo pipefail
BASE="${BASE:-http://localhost:3000}"
EMAIL="${DEMO_EMAIL:-demo@example.com}"
PASSWORD="${DEMO_PASSWORD:-demo1234}"

# Login to get ACCESS_TOKEN
code=$(curl -sS -o /tmp/smoke-camp03-login.json -w '%{http_code}' \
  -X POST "$BASE/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
test "$code" = "200" || { echo "FAIL camp-03 login: got $code"; cat /tmp/smoke-camp03-login.json; exit 1; }
ACCESS_TOKEN=$(jq -r '.data.accessToken' /tmp/smoke-camp03-login.json)

# Create a campaign to get a known ID
TIMESTAMP=$(date +%s)
code=$(curl -sS -o /tmp/smoke-camp03-create.json -w '%{http_code}' \
  -X POST "$BASE/campaigns" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Smoke Detail $TIMESTAMP\",\"subject\":\"Detail subject\",\"body\":\"Detail body\",\"recipientEmails\":[\"detail-a@example.com\",\"detail-b@example.com\"]}")
test "$code" = "201" || { echo "FAIL camp-03 create: got $code"; cat /tmp/smoke-camp03-create.json; exit 1; }
CAMPAIGN_ID=$(jq -r '.data.id' /tmp/smoke-camp03-create.json)

# 1. GET /campaigns/:id → 200
code=$(curl -sS -o /tmp/smoke-camp03.json -w '%{http_code}' \
  "$BASE/campaigns/$CAMPAIGN_ID" \
  -H "Authorization: Bearer $ACCESS_TOKEN")
test "$code" = "200" || { echo "FAIL camp-03 detail: got $code"; cat /tmp/smoke-camp03.json; exit 1; }

# Assert campaignRecipients is array (eager-load present)
jq -e '.data.campaignRecipients | type == "array"' /tmp/smoke-camp03.json >/dev/null

# Assert stats shape: total, sent, failed, opened, open_rate, send_rate
jq -e '.data.stats.total | type == "number"' /tmp/smoke-camp03.json >/dev/null
jq -e '.data.stats | has("sent")' /tmp/smoke-camp03.json >/dev/null
jq -e '.data.stats | has("failed")' /tmp/smoke-camp03.json >/dev/null
jq -e '.data.stats | has("opened")' /tmp/smoke-camp03.json >/dev/null
jq -e '.data.stats | has("open_rate")' /tmp/smoke-camp03.json >/dev/null
jq -e '.data.stats | has("send_rate")' /tmp/smoke-camp03.json >/dev/null

# 2. GET /campaigns/:id with unknown id → 404
code=$(curl -sS -o /tmp/smoke-camp03-notfound.json -w '%{http_code}' \
  "$BASE/campaigns/999999999" \
  -H "Authorization: Bearer $ACCESS_TOKEN")
test "$code" = "404" || { echo "FAIL camp-03 notfound: got $code (expected 404)"; cat /tmp/smoke-camp03-notfound.json; exit 1; }

echo "PASS: CAMP-03"
