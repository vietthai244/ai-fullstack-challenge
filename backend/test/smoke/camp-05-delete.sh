#!/usr/bin/env bash
# backend/test/smoke/camp-05-delete.sh — CAMP-05 (409 on non-draft DELETE + cascade on draft)
set -euo pipefail
BASE="${BASE:-http://localhost:3000}"
EMAIL="${DEMO_EMAIL:-demo@example.com}"
PASSWORD="${DEMO_PASSWORD:-demo1234}"

# Login to get ACCESS_TOKEN
code=$(curl -sS -o /tmp/smoke-camp05-login.json -w '%{http_code}' \
  -X POST "$BASE/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
test "$code" = "200" || { echo "FAIL camp-05 login: got $code"; cat /tmp/smoke-camp05-login.json; exit 1; }
ACCESS_TOKEN=$(jq -r '.data.accessToken' /tmp/smoke-camp05-login.json)

# 1. Find a non-draft campaign → DELETE → expect 409 CAMPAIGN_NOT_EDITABLE
code=$(curl -sS -o /tmp/smoke-camp05-list.json -w '%{http_code}' \
  "$BASE/campaigns?limit=100" \
  -H "Authorization: Bearer $ACCESS_TOKEN")
test "$code" = "200" || { echo "FAIL camp-05 list: got $code"; cat /tmp/smoke-camp05-list.json; exit 1; }

NON_DRAFT_ID=$(jq -r '[.data[] | select(.status != "draft")] | first | .id // empty' /tmp/smoke-camp05-list.json)

if [ -n "$NON_DRAFT_ID" ]; then
  code=$(curl -sS -o /tmp/smoke-camp05-409.json -w '%{http_code}' \
    -X DELETE "$BASE/campaigns/$NON_DRAFT_ID" \
    -H "Authorization: Bearer $ACCESS_TOKEN")
  test "$code" = "409" || { echo "FAIL camp-05 non-draft delete: got $code (expected 409)"; cat /tmp/smoke-camp05-409.json; exit 1; }
  jq -e '.error.code == "CAMPAIGN_NOT_EDITABLE"' /tmp/smoke-camp05-409.json >/dev/null
  echo "  [409 path verified with non-draft campaign $NON_DRAFT_ID]"
else
  echo "  [WARN: no non-draft campaign in DB — 409 CAMPAIGN_NOT_EDITABLE delete path not tested; seed a sent/scheduled campaign to fully verify]"
fi

# 2. Create a fresh draft → DELETE → expect 200 { data: { ok: true } }
TIMESTAMP=$(date +%s)
code=$(curl -sS -o /tmp/smoke-camp05-create.json -w '%{http_code}' \
  -X POST "$BASE/campaigns" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Smoke Delete $TIMESTAMP\",\"subject\":\"Delete subject\",\"body\":\"Delete body\",\"recipientEmails\":[\"delete-a@example.com\"]}")
test "$code" = "201" || { echo "FAIL camp-05 create draft: got $code"; cat /tmp/smoke-camp05-create.json; exit 1; }
DRAFT_ID=$(jq -r '.data.id' /tmp/smoke-camp05-create.json)

code=$(curl -sS -o /tmp/smoke-camp05-delete.json -w '%{http_code}' \
  -X DELETE "$BASE/campaigns/$DRAFT_ID" \
  -H "Authorization: Bearer $ACCESS_TOKEN")
test "$code" = "200" || { echo "FAIL camp-05 delete draft: got $code (expected 200)"; cat /tmp/smoke-camp05-delete.json; exit 1; }
jq -e '.data.ok == true' /tmp/smoke-camp05-delete.json >/dev/null

# 3. GET deleted campaign → 404 (verify cascade)
code=$(curl -sS -o /tmp/smoke-camp05-gone.json -w '%{http_code}' \
  "$BASE/campaigns/$DRAFT_ID" \
  -H "Authorization: Bearer $ACCESS_TOKEN")
test "$code" = "404" || { echo "FAIL camp-05 verify gone: got $code (expected 404)"; cat /tmp/smoke-camp05-gone.json; exit 1; }

echo "PASS: CAMP-05"
