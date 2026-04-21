#!/usr/bin/env bash
# backend/test/smoke/track-06-idempotent.sh — TRACK-01 criterion 4
# Validates: first open sets opened_at; second open does NOT overwrite it.
#
# Prereqs: same as track-06.sh
set -euo pipefail
BASE="${BASE:-http://localhost:3000}"
DATABASE_URL="${DATABASE_URL:-postgres://postgres:postgres@localhost:5432/campaigns}"

# Fetch a token that has NOT been opened yet (opened_at IS NULL)
FRESH_TOKEN=$(psql "$DATABASE_URL" -t -c \
  "SELECT tracking_token FROM campaign_recipients WHERE opened_at IS NULL LIMIT 1;" \
  2>/dev/null | xargs)
if [ -z "$FRESH_TOKEN" ]; then
  echo "SKIP track-06-idempotent: no unopened campaign_recipients rows — run db:seed first"
  exit 0
fi

# First open
curl -sS -o /dev/null "$BASE/track/open/$FRESH_TOKEN"

# Capture opened_at after first open
FIRST_TS=$(psql "$DATABASE_URL" -t -c \
  "SELECT opened_at FROM campaign_recipients WHERE tracking_token='$FRESH_TOKEN';" \
  2>/dev/null | xargs)
if [ -z "$FIRST_TS" ] || [ "$FIRST_TS" = "" ]; then
  echo "FAIL track-06-idempotent: opened_at not set after first open"
  exit 1
fi

# Second open
curl -sS -o /dev/null "$BASE/track/open/$FRESH_TOKEN"

# opened_at must not have changed
SECOND_TS=$(psql "$DATABASE_URL" -t -c \
  "SELECT opened_at FROM campaign_recipients WHERE tracking_token='$FRESH_TOKEN';" \
  2>/dev/null | xargs)

if [ "$FIRST_TS" != "$SECOND_TS" ]; then
  echo "FAIL track-06-idempotent: opened_at changed from '$FIRST_TS' to '$SECOND_TS' (should be immutable)"
  exit 1
fi

echo "PASS: TRACK-01 criterion 4 (idempotent opened_at)"
