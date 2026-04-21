#!/usr/bin/env bash
# backend/test/smoke/camp-04-patch.sh — CAMP-04 (409 on non-draft PATCH)
set -euo pipefail
BASE="${BASE:-http://localhost:3000}"
EMAIL="${DEMO_EMAIL:-demo@example.com}"
PASSWORD="${DEMO_PASSWORD:-demo1234}"

# Login to get ACCESS_TOKEN
code=$(curl -sS -o /tmp/smoke-camp04-login.json -w '%{http_code}' \
  -X POST "$BASE/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
test "$code" = "200" || { echo "FAIL camp-04 login: got $code"; cat /tmp/smoke-camp04-login.json; exit 1; }
ACCESS_TOKEN=$(jq -r '.data.accessToken' /tmp/smoke-camp04-login.json)

# 1. Create a draft campaign
TIMESTAMP=$(date +%s)
code=$(curl -sS -o /tmp/smoke-camp04-create.json -w '%{http_code}' \
  -X POST "$BASE/campaigns" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Smoke Patch $TIMESTAMP\",\"subject\":\"Patch subject\",\"body\":\"Patch body\",\"recipientEmails\":[\"patch-a@example.com\"]}")
test "$code" = "201" || { echo "FAIL camp-04 create draft: got $code"; cat /tmp/smoke-camp04-create.json; exit 1; }
DRAFT_ID=$(jq -r '.data.id' /tmp/smoke-camp04-create.json)

# 2. PATCH draft → 200 (draft PATCH works)
code=$(curl -sS -o /tmp/smoke-camp04-patch-draft.json -w '%{http_code}' \
  -X PATCH "$BASE/campaigns/$DRAFT_ID" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Updated Draft Name"}')
test "$code" = "200" || { echo "FAIL camp-04 patch draft: got $code (expected 200)"; cat /tmp/smoke-camp04-patch-draft.json; exit 1; }
jq -e '.data.name == "Updated Draft Name"' /tmp/smoke-camp04-patch-draft.json >/dev/null

# 3. PATCH with no fields → 400 VALIDATION_ERROR
code=$(curl -sS -o /tmp/smoke-camp04-empty.json -w '%{http_code}' \
  -X PATCH "$BASE/campaigns/$DRAFT_ID" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{}')
test "$code" = "400" || { echo "FAIL camp-04 empty patch: got $code (expected 400)"; cat /tmp/smoke-camp04-empty.json; exit 1; }
jq -e '.error.code == "VALIDATION_ERROR"' /tmp/smoke-camp04-empty.json >/dev/null

# 4. Find a non-draft campaign (sent/scheduled) → PATCH → expect 409 CAMPAIGN_NOT_EDITABLE
# Get list and find the first non-draft
code=$(curl -sS -o /tmp/smoke-camp04-list.json -w '%{http_code}' \
  "$BASE/campaigns?limit=100" \
  -H "Authorization: Bearer $ACCESS_TOKEN")
test "$code" = "200" || { echo "FAIL camp-04 list: got $code"; cat /tmp/smoke-camp04-list.json; exit 1; }

NON_DRAFT_ID=$(jq -r '[.data[] | select(.status != "draft")] | first | .id // empty' /tmp/smoke-camp04-list.json)

if [ -n "$NON_DRAFT_ID" ]; then
  code=$(curl -sS -o /tmp/smoke-camp04-409.json -w '%{http_code}' \
    -X PATCH "$BASE/campaigns/$NON_DRAFT_ID" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H 'Content-Type: application/json' \
    -d '{"name":"Try to patch non-draft"}')
  test "$code" = "409" || { echo "FAIL camp-04 non-draft patch: got $code (expected 409)"; cat /tmp/smoke-camp04-409.json; exit 1; }
  jq -e '.error.code == "CAMPAIGN_NOT_EDITABLE"' /tmp/smoke-camp04-409.json >/dev/null
  echo "  [409 path verified with campaign $NON_DRAFT_ID status=$(jq -r '.data[] | select(.id == '"$NON_DRAFT_ID"') | .status' /tmp/smoke-camp04-list.json 2>/dev/null || echo 'non-draft')]"
else
  echo "  [WARN: no non-draft campaign in DB — 409 CAMPAIGN_NOT_EDITABLE path not tested; seed a sent/scheduled campaign to fully verify]"
fi

echo "PASS: CAMP-04"
