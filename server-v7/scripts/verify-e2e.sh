#!/usr/bin/env bash
# ============================================================================
# verify-e2e.sh — Batch 3 end-to-end smoke against a live server
#
# Exercises the full "activation → parent register → bind → list" flow
# against a running server (localhost:3000 by default). Relies on dev-mail
# mode so verification codes can be grepped out of server logs.
#
# Usage:
#   # Terminal A:
#   docker compose up -d   # pg + redis
#   npx prisma migrate deploy
#   npm run dev 2>&1 | tee /tmp/wb-server.log
#
#   # Terminal B:
#   bash scripts/verify-e2e.sh
#
# Env overrides:
#   BASE_URL        default http://localhost:3000
#   SERVER_LOG      default /tmp/wb-server.log (where we grep dev-mail codes)
#   TEST_EMAIL      default verify-e2e+<epoch>@example.com (ephemeral)
#   TEST_DEVICE_ID  default GP15-E2E-<epoch>
#   TEST_ACTIVATION default a seeded code (caller must insert ahead of time)
# ============================================================================

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
SERVER_LOG="${SERVER_LOG:-/tmp/wb-server.log}"
EPOCH="$(date +%s)"
TEST_EMAIL="${TEST_EMAIL:-verify-e2e+${EPOCH}@example.com}"
TEST_DEVICE_ID="${TEST_DEVICE_ID:-GP15-E2E-${EPOCH}}"
TEST_ACTIVATION="${TEST_ACTIVATION:-}"

RED=$'\033[31m'; YELLOW=$'\033[33m'; GREEN=$'\033[32m'; DIM=$'\033[2m'; RESET=$'\033[0m'

fail() { echo "${RED}FAIL${RESET} $1" >&2; exit 1; }
pass() { echo "${GREEN}PASS${RESET} $1"; }
step() { echo ""; echo "${DIM}─── $1 ───${RESET}"; }

# ---------------------------------------------------------------------------
# 0. Preflight
# ---------------------------------------------------------------------------
step "0. Preflight checks"

command -v curl >/dev/null 2>&1 || fail "curl not on PATH"
command -v jq   >/dev/null 2>&1 || fail "jq not on PATH (brew install jq)"

# Server alive
if ! curl -fsS "$BASE_URL/api/health" -o /tmp/wb-health.json; then
  fail "server not responding at $BASE_URL/api/health"
fi
HEALTH_STATUS=$(jq -r '.data.status' /tmp/wb-health.json)
pass "server health = $HEALTH_STATUS"

if [ -z "$TEST_ACTIVATION" ]; then
  echo "${YELLOW}WARN${RESET} TEST_ACTIVATION not set — seed one into ActivationCode:"
  echo "  psql \$DATABASE_URL -c \"INSERT INTO \\\"ActivationCode\\\"(id, code, status, \\\"createdAt\\\", \\\"updatedAt\\\") VALUES ('e2e_${EPOCH}', 'E2E${EPOCH: -5}', 'issued', NOW(), NOW());\""
  echo "  then: TEST_ACTIVATION=E2E${EPOCH: -5} bash scripts/verify-e2e.sh"
  exit 1
fi

# ---------------------------------------------------------------------------
# 1. Device register — TV first-time activation
# ---------------------------------------------------------------------------
step "1. POST /api/device/register"

REG_RESP=$(curl -fsS -X POST "$BASE_URL/api/device/register" \
  -H 'Content-Type: application/json' \
  -d "{\"deviceId\":\"$TEST_DEVICE_ID\",\"activationCode\":\"$TEST_ACTIVATION\",\"model\":\"GP15\",\"firmwareVer\":\"1.0.0\"}")
REG_CODE=$(echo "$REG_RESP" | jq -r '.code')
[ "$REG_CODE" = "0" ] || fail "register: code=$REG_CODE body=$REG_RESP"
DEVICE_TOKEN=$(echo "$REG_RESP" | jq -r '.data.deviceToken')
DEVICE_STATUS=$(echo "$REG_RESP" | jq -r '.data.device.status')
[ "$DEVICE_STATUS" = "activated_unbound" ] || fail "register: status=$DEVICE_STATUS (want activated_unbound)"
pass "register → deviceToken + status=activated_unbound"

# ---------------------------------------------------------------------------
# 2. Parent: send-code + register
# ---------------------------------------------------------------------------
step "2. POST /api/auth/send-code (register)"

curl -fsS -X POST "$BASE_URL/api/auth/send-code" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$TEST_EMAIL\",\"purpose\":\"register\",\"locale\":\"en\"}" >/dev/null
pass "send-code dispatched"

# Wait a moment for log flush, then grep dev-mail code
sleep 1
VERIFY_CODE=""
for attempt in 1 2 3 4 5; do
  # Grep the LAST DEV MAIL line for this email
  LINE=$(grep -E "DEV MAIL|dev-mode" "$SERVER_LOG" 2>/dev/null | grep "$TEST_EMAIL" | tail -n 5 || true)
  VERIFY_CODE=$(echo "$LINE" | grep -oE 'Code: *[0-9]{6}' | tail -n 1 | grep -oE '[0-9]{6}' || true)
  if [ -z "$VERIFY_CODE" ]; then
    # Alternate format: structured log with "code":"NNNNNN"
    VERIFY_CODE=$(grep -E "\"to\":\"$TEST_EMAIL\"" "$SERVER_LOG" 2>/dev/null | tail -n 5 \
                  | grep -oE '"code":"[0-9]{6}"' | tail -n 1 | grep -oE '[0-9]{6}' || true)
  fi
  [ -n "$VERIFY_CODE" ] && break
  echo "  (attempt $attempt) no code yet in $SERVER_LOG; retrying in 1s"
  sleep 1
done
[ -n "$VERIFY_CODE" ] || fail "could not extract dev-mail code for $TEST_EMAIL from $SERVER_LOG"
pass "grepped dev-mail code: $VERIFY_CODE"

step "3. POST /api/auth/register"

REG2_RESP=$(curl -fsS -X POST "$BASE_URL/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{
    \"email\":\"$TEST_EMAIL\",
    \"code\":\"$VERIFY_CODE\",
    \"password\":\"E2ETest1234\",
    \"deviceId\":\"$TEST_DEVICE_ID\",
    \"activationCode\":\"$TEST_ACTIVATION\",
    \"locale\":\"en\"
  }")
REG2_CODE=$(echo "$REG2_RESP" | jq -r '.code')
[ "$REG2_CODE" = "0" ] || fail "register: code=$REG2_CODE body=$REG2_RESP"
PARENT_TOKEN=$(echo "$REG2_RESP" | jq -r '.data.parentToken')
PARENT_ACTIVATED=$(echo "$REG2_RESP" | jq -r '.data.parent.activated')
DEVICE_FIELD=$(echo "$REG2_RESP" | jq -r '.data.device')
[ "$PARENT_ACTIVATED" = "false" ] || fail "register: parent.activated should be false here (got $PARENT_ACTIVATED)"
[ "$DEVICE_FIELD" = "null" ] || fail "register: device field should be null per batch 2 contract (got $DEVICE_FIELD)"
pass "parent register → parentToken, activated=false, device=null"

# ---------------------------------------------------------------------------
# 4. Bind device — this is where quota gets provisioned
# ---------------------------------------------------------------------------
step "4. POST /api/device/bind"

BIND_RESP=$(curl -fsS -X POST "$BASE_URL/api/device/bind" \
  -H "Authorization: Bearer $PARENT_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"deviceId\":\"$TEST_DEVICE_ID\",\"activationCode\":\"$TEST_ACTIVATION\"}")
BIND_CODE=$(echo "$BIND_RESP" | jq -r '.code')
[ "$BIND_CODE" = "0" ] || fail "bind: code=$BIND_CODE body=$BIND_RESP"
STORIES_LEFT=$(echo "$BIND_RESP" | jq -r '.data.device.storiesLeft')
BIND_STATUS=$(echo "$BIND_RESP" | jq -r '.data.device.status')
ACTIVATED_QUOTA=$(echo "$BIND_RESP" | jq -r '.data.activatedQuota')
[ "$BIND_STATUS" = "bound" ] || fail "bind: status=$BIND_STATUS (want bound)"
[ "$STORIES_LEFT" = "6" ] || fail "bind: storiesLeft=$STORIES_LEFT (want 6 on first bind)"
[ "$ACTIVATED_QUOTA" = "true" ] || fail "bind: activatedQuota=$ACTIVATED_QUOTA (want true)"
pass "bind → status=bound, storiesLeft=6, activatedQuota=true"

# ---------------------------------------------------------------------------
# 5. List devices
# ---------------------------------------------------------------------------
step "5. GET /api/device/list"

LIST_RESP=$(curl -fsS "$BASE_URL/api/device/list" -H "Authorization: Bearer $PARENT_TOKEN")
LIST_CODE=$(echo "$LIST_RESP" | jq -r '.code')
[ "$LIST_CODE" = "0" ] || fail "list: code=$LIST_CODE body=$LIST_RESP"
ITEM_COUNT=$(echo "$LIST_RESP" | jq -r '.data.items | length')
FIRST_DEVICE_ID=$(echo "$LIST_RESP" | jq -r '.data.items[0].deviceId')
[ "$ITEM_COUNT" -ge 1 ] || fail "list: items count=$ITEM_COUNT"
[ "$FIRST_DEVICE_ID" = "$TEST_DEVICE_ID" ] || fail "list: first deviceId=$FIRST_DEVICE_ID (want $TEST_DEVICE_ID)"
pass "list shows bound device"

# ---------------------------------------------------------------------------
# 6. Heartbeat from device
# ---------------------------------------------------------------------------
step "6. POST /api/device/heartbeat"

HB_RESP=$(curl -fsS -X POST "$BASE_URL/api/device/heartbeat" \
  -H "Authorization: Bearer $DEVICE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"currentScreen":"home","memoryUsageMb":128}')
HB_CODE=$(echo "$HB_RESP" | jq -r '.code')
[ "$HB_CODE" = "0" ] || fail "heartbeat: code=$HB_CODE body=$HB_RESP"
pass "heartbeat ok"

# ---------------------------------------------------------------------------
# 7. parent/me reflects activated=true now
# ---------------------------------------------------------------------------
step "7. GET /api/parent/me"

ME_RESP=$(curl -fsS "$BASE_URL/api/parent/me" -H "Authorization: Bearer $PARENT_TOKEN")
ME_ACTIVATED=$(echo "$ME_RESP" | jq -r '.data.parent.activated')
ME_DEVICES=$(echo "$ME_RESP" | jq -r '.data.parent.devicesCount')
[ "$ME_ACTIVATED" = "true" ] || fail "parent/me: activated=$ME_ACTIVATED (want true after bind)"
[ "$ME_DEVICES" -ge 1 ] || fail "parent/me: devicesCount=$ME_DEVICES"
pass "parent/me → activated=true, devicesCount=$ME_DEVICES"

echo ""
echo "${GREEN}✓ end-to-end flow complete${RESET}"
echo "  parentEmail=$TEST_EMAIL"
echo "  deviceId=$TEST_DEVICE_ID"
echo "  activationCode=$TEST_ACTIVATION"
