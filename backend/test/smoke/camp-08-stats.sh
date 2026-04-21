#!/usr/bin/env bash
# backend/test/smoke/camp-08-stats.sh — CAMP-08 (aggregate stats)
set -euo pipefail
BASE="${BASE:-http://localhost:3000}"
EMAIL="${DEMO_EMAIL:-demo@example.com}"
PASSWORD="${DEMO_PASSWORD:-demo1234}"

# Login to get ACCESS_TOKEN
code=$(curl -sS -o /tmp/smoke-camp08-login.json -w '%{http_code}' \
  -X POST "$BASE/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
test "$code" = "200" || { echo "FAIL camp-08 login: got $code"; cat /tmp/smoke-camp08-login.json; exit 1; }
ACCESS_TOKEN=$(jq -r '.data.accessToken' /tmp/smoke-camp08-login.json)

# Create a fresh campaign (recipientEmails min 1 by Zod)
TIMESTAMP=$(date +%s)
code=$(curl -sS -o /tmp/smoke-camp08-create.json -w '%{http_code}' \
  -X POST "$BASE/campaigns" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Smoke Stats $TIMESTAMP\",\"subject\":\"Stats subject\",\"body\":\"Stats body\",\"recipientEmails\":[\"stats-a@example.com\"]}")
test "$code" = "201" || { echo "FAIL camp-08 create: got $code"; cat /tmp/smoke-camp08-create.json; exit 1; }
CAMPAIGN_ID=$(jq -r '.data.id' /tmp/smoke-camp08-create.json)

# 1. GET /campaigns/:id/stats → 200
code=$(curl -sS -o /tmp/smoke-camp08.json -w '%{http_code}' \
  "$BASE/campaigns/$CAMPAIGN_ID/stats" \
  -H "Authorization: Bearer $ACCESS_TOKEN")
test "$code" = "200" || { echo "FAIL camp-08 stats: got $code"; cat /tmp/smoke-camp08.json; exit 1; }

# Assert all required fields present (total, sent, failed, opened, open_rate, send_rate)
# Stats are aggregate SQL — COUNT(*) FILTER (WHERE status = 'sent') etc., never JS-computed
jq -e '.data | has("total")' /tmp/smoke-camp08.json >/dev/null
jq -e '.data | has("sent")' /tmp/smoke-camp08.json >/dev/null
jq -e '.data | has("failed")' /tmp/smoke-camp08.json >/dev/null
jq -e '.data | has("opened")' /tmp/smoke-camp08.json >/dev/null
jq -e '.data | has("open_rate")' /tmp/smoke-camp08.json >/dev/null
jq -e '.data | has("send_rate")' /tmp/smoke-camp08.json >/dev/null

# Assert total is a number
jq -e '.data.total | type == "number"' /tmp/smoke-camp08.json >/dev/null

# Fresh campaign with 1 recipient email → total >= 1 (CampaignRecipient rows created)
jq -e '.data.total >= 1' /tmp/smoke-camp08.json >/dev/null

# open_rate and send_rate: fresh campaign has no sends, so NULLIF guard → null (not NaN)
# Assert open_rate is either null or a number (NULLIF(sent,0) division guard)
jq -e '.data.open_rate == null or (.data.open_rate | type == "number")' /tmp/smoke-camp08.json >/dev/null
# Assert send_rate is either null or a number
jq -e '.data.send_rate == null or (.data.send_rate | type == "number")' /tmp/smoke-camp08.json >/dev/null

# 2. GET /campaigns/:id/stats for unknown id → 404
code=$(curl -sS -o /tmp/smoke-camp08-notfound.json -w '%{http_code}' \
  "$BASE/campaigns/999999999/stats" \
  -H "Authorization: Bearer $ACCESS_TOKEN")
test "$code" = "404" || { echo "FAIL camp-08 stats notfound: got $code (expected 404)"; cat /tmp/smoke-camp08-notfound.json; exit 1; }

echo "PASS: CAMP-08"
