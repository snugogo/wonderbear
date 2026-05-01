#!/usr/bin/env bash
# WO-3.15 verify.sh — GROUND-TRUTH + verify template + .env cleanup

set -u

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

PASS=0
FAIL=0
TOTAL=15

REPO_ROOT="/opt/wonderbear"
COORD_DIR="${REPO_ROOT}/coordination"
WO_DIR="${REPO_ROOT}/workorders"
SERVER_DIR="${REPO_ROOT}/server-v7"
TV_DIR="${REPO_ROOT}/tv-html"

GROUND_TRUTH="${COORD_DIR}/GROUND-TRUTH.md"
VERIFY_TEMPLATE="${WO_DIR}/verify-template.sh"
ENV_FILE="${SERVER_DIR}/.env"

check_pass() { PASS=$((PASS + 1)); echo -e "${GREEN}✅ PASS${NC}"; }
check_fail() { FAIL=$((FAIL + 1)); echo -e "${RED}❌ FAIL${NC} — $1"; }

echo "============================================================"
echo "WO-3.15 verify — Tooling Hygiene"
echo "============================================================"
echo ""

# [1/15] GROUND-TRUTH.md exists
echo "[1/15] coordination/GROUND-TRUTH.md exists"
if [ -f "${GROUND_TRUTH}" ]; then
    LINES=$(wc -l < "${GROUND_TRUTH}" 2>/dev/null | tr -d ' ')
    echo "  lines: ${LINES}"
    if [ "${LINES}" -ge 100 ] 2>/dev/null; then check_pass; else check_fail "GROUND-TRUTH too short (${LINES} lines, need ≥100)"; fi
else
    check_fail "GROUND-TRUTH.md not created"
fi
echo ""

# [2/15] GROUND-TRUTH has all required sections
echo "[2/15] GROUND-TRUTH has §1-§10 sections"
SECTION_COUNT=0
for SEC in "## §1." "## §2." "## §3." "## §4." "## §5." "## §6." "## §7." "## §8." "## §9." "## §10."; do
    if grep -qF "${SEC}" "${GROUND_TRUTH}" 2>/dev/null; then
        SECTION_COUNT=$((SECTION_COUNT + 1))
    fi
done
echo "  sections found: ${SECTION_COUNT}/10"
if [ "${SECTION_COUNT}" -eq 10 ] 2>/dev/null; then check_pass; else check_fail "missing sections (${SECTION_COUNT}/10)"; fi
echo ""

# [3/15] GROUND-TRUTH mentions key facts
echo "[3/15] GROUND-TRUTH mentions wonderbear_db, deepseek-v4-pro, longhuhu_v3"
KEY_FACTS=0
for KW in "wonderbear_db" "deepseek-v4-pro" "longhuhu_v3" "spawn-droid"; do
    if grep -q "${KW}" "${GROUND_TRUTH}" 2>/dev/null; then
        KEY_FACTS=$((KEY_FACTS + 1))
    fi
done
echo "  key facts: ${KEY_FACTS}/4"
if [ "${KEY_FACTS}" -eq 4 ] 2>/dev/null; then check_pass; else check_fail "missing key facts"; fi
echo ""

# [4/15] verify-template.sh exists and executable
echo "[4/15] workorders/verify-template.sh exists and executable"
if [ -x "${VERIFY_TEMPLATE}" ]; then check_pass; else check_fail "verify-template.sh missing or not executable"; fi
echo ""

# [5/15] verify-template.sh syntax OK
echo "[5/15] verify-template.sh bash -n syntax check"
if bash -n "${VERIFY_TEMPLATE}" 2>/dev/null; then check_pass; else check_fail "syntax error"; fi
echo ""

# [6/15] verify-template Luna grep excludes demoStory
echo "[6/15] verify-template Luna grep excludes utils/demoStory and mock paths"
EXCLUDE_COUNT=0
for EXCLUDE in "demoStory" "demo" "test" "mock" "fixture"; do
    if grep -q "grep -v.*${EXCLUDE}" "${VERIFY_TEMPLATE}" 2>/dev/null; then
        EXCLUDE_COUNT=$((EXCLUDE_COUNT + 1))
    fi
done
echo "  exclusions found: ${EXCLUDE_COUNT}/5"
if [ "${EXCLUDE_COUNT}" -ge 4 ] 2>/dev/null; then check_pass; else check_fail "Luna grep exclusions insufficient"; fi
echo ""

# [7/15] verify-template spillover whitelist allows api.ts
echo "[7/15] verify-template spillover whitelist allows services/api.ts and stores/*.ts"
if grep -qE 'services/api|stores' "${VERIFY_TEMPLATE}" 2>/dev/null; then check_pass; else check_fail "spillover whitelist missing api.ts or stores"; fi
echo ""

# [8/15] .env: GEMINI_IMAGE_MODEL removed
echo "[8/15] .env: GEMINI_IMAGE_MODEL removed"
ENV_HIT=$(grep -cE '^GEMINI_IMAGE_MODEL=' "${ENV_FILE}" 2>/dev/null || true)
if [ -z "${ENV_HIT}" ]; then ENV_HIT=0; fi
echo "  GEMINI_IMAGE_MODEL refs: ${ENV_HIT}"
if [ "${ENV_HIT}" = "0" ]; then check_pass; else check_fail "GEMINI_IMAGE_MODEL still in .env"; fi
echo ""

# [9/15] .env: STORAGE_TYPE removed
echo "[9/15] .env: STORAGE_TYPE removed"
ENV_HIT=$(grep -cE '^STORAGE_TYPE=' "${ENV_FILE}" 2>/dev/null || true)
if [ -z "${ENV_HIT}" ]; then ENV_HIT=0; fi
echo "  STORAGE_TYPE refs: ${ENV_HIT}"
if [ "${ENV_HIT}" = "0" ]; then check_pass; else check_fail "STORAGE_TYPE still in .env"; fi
echo ""

# [10/15] .env: LOCAL_STORAGE_PATH removed
echo "[10/15] .env: LOCAL_STORAGE_PATH removed"
ENV_HIT=$(grep -cE '^LOCAL_STORAGE_PATH=' "${ENV_FILE}" 2>/dev/null || true)
if [ -z "${ENV_HIT}" ]; then ENV_HIT=0; fi
echo "  LOCAL_STORAGE_PATH refs: ${ENV_HIT}"
if [ "${ENV_HIT}" = "0" ]; then check_pass; else check_fail "LOCAL_STORAGE_PATH still in .env"; fi
echo ""

# [11/15] .env: GOOGLE_APPLICATION_CREDENTIALS deduplicated
echo "[11/15] .env: GOOGLE_APPLICATION_CREDENTIALS appears exactly once"
ENV_HIT=$(grep -cE '^GOOGLE_APPLICATION_CREDENTIALS=' "${ENV_FILE}" 2>/dev/null || true)
if [ -z "${ENV_HIT}" ]; then ENV_HIT=0; fi
echo "  count: ${ENV_HIT}"
if [ "${ENV_HIT}" = "1" ]; then check_pass; else check_fail "GOOGLE_APPLICATION_CREDENTIALS count is ${ENV_HIT}, expected 1"; fi
echo ""

# [12/15] No live source-code references to removed fields
echo "[12/15] No live src/ references to removed .env fields"
LIVE_REFS=0
for FIELD in GEMINI_IMAGE_MODEL STORAGE_TYPE LOCAL_STORAGE_PATH; do
    HITS=$(grep -rln "process\.env\.${FIELD}\b\|process\.env\[.${FIELD}.\]" "${SERVER_DIR}/src" 2>/dev/null | wc -l | tr -d ' ')
    if [ -z "${HITS}" ]; then HITS=0; fi
    LIVE_REFS=$((LIVE_REFS + HITS))
done
echo "  live refs to removed fields: ${LIVE_REFS}"
if [ "${LIVE_REFS}" = "0" ]; then check_pass; else check_fail "still has live refs (${LIVE_REFS}) — would break server"; fi
echo ""

# [13/15] WO-3.9 invariant: Luna doesn't reappear (excluding mock paths)
echo "[13/15] WO-3.9 invariant: Luna doesn't reappear in production code"
LUNA_REAPPEAR=$(grep -rn 'Luna' "${TV_DIR}/src" \
    --include='*.ts' --include='*.vue' --include='*.json' 2>/dev/null \
    | grep -v '/dev/' \
    | grep -v '\.backup' \
    | grep -v '/utils/demoStory' \
    | grep -v '/utils/.*demo' \
    | grep -v 'test\.' \
    | grep -v '__tests__' \
    | grep -v 'mock' \
    | grep -v 'fixture' \
    | wc -l | tr -d ' ')
if [ -z "${LUNA_REAPPEAR}" ]; then LUNA_REAPPEAR=0; fi
echo "  Luna refs (filtered): ${LUNA_REAPPEAR}"
if [ "${LUNA_REAPPEAR}" = "0" ]; then check_pass; else check_fail "Luna in production code"; fi
echo ""

# [14/15] WO-3.12 invariants: spawn-droid.sh and orchestrator-loop.sh unchanged
echo "[14/15] V4 Pro migration invariants: scripts use deepseek-v4-pro"
SCRIPT_OK=0
if grep -q 'deepseek-v4-pro' /opt/wonderbear-tools/spawn-droid.sh 2>/dev/null; then SCRIPT_OK=$((SCRIPT_OK + 1)); fi
if grep -q 'deepseek-v4-pro' /opt/wonderbear-tools/orchestrator-loop.sh 2>/dev/null; then SCRIPT_OK=$((SCRIPT_OK + 1)); fi
echo "  scripts using V4 Pro: ${SCRIPT_OK}/2"
if [ "${SCRIPT_OK}" = "2" ]; then check_pass; else check_fail "scripts not using V4 Pro"; fi
echo ""

# [15/15] no spillover into product code
echo "[15/15] no spillover into product code (server-v7/src, tv-html/src)"
cd "${REPO_ROOT}" || exit 1
EXPECTED='^(server-v7/\.env|server-v7/\.env\.example|coordination/GROUND-TRUTH\.md|workorders/verify-template\.sh)$'
SPILLOVER=$(git status -s 2>/dev/null \
    | grep -E '^[ MARC][MARC]?\s' \
    | awk '{print $2}' \
    | grep -v '^coordination/done/' \
    | grep -v '^coordination/workorders/' \
    | grep -v '^workorders/WO-' \
    | grep -vE "${EXPECTED}" || true)
if [ -z "${SPILLOVER}" ]; then check_pass; else check_fail "spillover:"; echo "${SPILLOVER}" | sed 's/^/    /'; fi
echo ""

echo "============================================================"
echo "Summary: ${PASS}/${TOTAL} PASS, ${FAIL} FAIL"
echo "============================================================"
echo ""
if [ ${FAIL} -eq 0 ]; then
    echo -e "${GREEN}✅ All ${TOTAL} checks PASS${NC}"
    echo "Next: Kristy reviews GROUND-TRUTH.md content quality, then commit"
    exit 0
else
    echo -e "${RED}❌ ${FAIL}/${TOTAL} FAIL${NC}"
    exit 1
fi
