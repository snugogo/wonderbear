#!/usr/bin/env bash
# verify-template.sh — Standard verify.sh template (post WO-3.15)
#
# DO NOT run this directly. COPY and customize for each new workorder.
# Replace <workorder-files> with the regex pattern of expected modified files.
#
# Pattern fixes since WO-3.12:
# - Luna grep excludes utils/demoStory.ts, *demo*, *test*, *mock*, *fixture*, __tests__
#   (WO-3.12 false-positive FAIL 17: utils/demoStory.ts is mock data, not product code)
# - Spillover whitelist allows services/api.ts (TS type extensions for backend changes)
#   and stores/*.ts (state-store type adjustments) — WO-3.12 false-positive FAIL 18
# - All integer comparisons use `tr -d ' '` to strip whitespace
# - All `grep -c` calls have `|| true` (avoid the return-code-1 trap on no-match)
# - No `&&` chaining inside verify subprocess (教训 12)
# - Build verification cd's into target dir before `npm run build`
# - Always test: `if [ "${VAR}" -ge N ] 2>/dev/null` (silent error on non-numeric)

set -u

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

PASS=0
FAIL=0
TOTAL=0   # set this to the number of checks for your workorder

REPO_ROOT="/opt/wonderbear"
TV_DIR="${REPO_ROOT}/tv-html"
SERVER_DIR="${REPO_ROOT}/server-v7"

# ---- File targets — customize per workorder ----
# Example:
# COVER="${TV_DIR}/src/screens/StoryCoverScreen.vue"
# STORY_ROUTE="${SERVER_DIR}/src/routes/story.js"
# ZH="${TV_DIR}/src/i18n/locales/zh.ts"

check_pass() { PASS=$((PASS + 1)); echo -e "${GREEN}✅ PASS${NC}"; }
check_fail() { FAIL=$((FAIL + 1)); echo -e "${RED}❌ FAIL${NC} — $1"; }

echo "============================================================"
echo "WO-X verify — <one-line title>"
echo "============================================================"
echo ""

# ---------------------------------------------------------------
# [N/TOTAL] target files exist (always check 1)
# ---------------------------------------------------------------
# echo "[1/${TOTAL}] all target files exist"
# ALL_FILES_OK=true
# for f in "${COVER}" "${STORY_ROUTE}"; do
#     if [ ! -f "${f}" ]; then
#         echo "  missing: ${f}"
#         ALL_FILES_OK=false
#     fi
# done
# if [ "${ALL_FILES_OK}" = "true" ]; then check_pass; else check_fail "missing files"; fi
# echo ""

# ---------------------------------------------------------------
# Generic content check pattern (use grep -c with `|| true`,
# default empty to 0, then numeric-compare with `2>/dev/null`)
# ---------------------------------------------------------------
# echo "[N/${TOTAL}] FOO contains pattern X"
# HITS=$(grep -cE 'pattern' "${SOME_FILE}" 2>/dev/null || true)
# if [ -z "${HITS}" ]; then HITS=0; fi
# echo "  occurrences: ${HITS}"
# if [ "${HITS}" -ge 1 ] 2>/dev/null; then check_pass; else check_fail "..."; fi
# echo ""

# ---------------------------------------------------------------
# tv-html build (cd FIRST, then run)
# ---------------------------------------------------------------
# echo "[N/${TOTAL}] tv-html npm run build passes"
# cd "${TV_DIR}" || { check_fail "cannot cd"; exit 1; }
# BUILD_OUT=$(npm run build 2>&1)
# BUILD_RC=$?
# if [ ${BUILD_RC} -eq 0 ]; then
#     if echo "${BUILD_OUT}" | grep -qE '\berror\b|\bERROR\b' 2>/dev/null; then
#         check_fail "build returned 0 but output contains error"
#         echo "${BUILD_OUT}" | tail -20 | sed 's/^/    /'
#     else
#         check_pass
#     fi
# else
#     check_fail "build exited ${BUILD_RC}"
#     echo "${BUILD_OUT}" | tail -30 | sed 's/^/    /'
# fi
# echo ""

# ---------------------------------------------------------------
# server-v7 node require (smoke test)
# ---------------------------------------------------------------
# echo "[N/${TOTAL}] server-v7 routes loadable via node -e require"
# cd "${SERVER_DIR}" || { check_fail "cannot cd"; exit 1; }
# NODE_OUT=$(node -e "require('./src/routes/story.js')" 2>&1)
# NODE_RC=$?
# if [ ${NODE_RC} -eq 0 ]; then check_pass; else check_fail "node require failed"; echo "${NODE_OUT}" | sed 's/^/    /'; fi
# echo ""

# ---------------------------------------------------------------
# WO-3.9 Luna invariant — POST WO-3.15 PATTERN
# Excludes mock/demo/fixture/test paths so utils/demoStory.ts etc.
# don't trigger a false-positive product-code regression alarm.
# ---------------------------------------------------------------
echo "[N/${TOTAL}] WO-3.9 invariant: Luna doesn't reappear in production code"
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
if [ "${LUNA_REAPPEAR}" = "0" ]; then check_pass; else check_fail "Luna regression in production code"; fi
echo ""

# ---------------------------------------------------------------
# Spillover check — POST WO-3.15 WHITELIST
# services/api.ts is allowed because backend route field changes
# typically require a corresponding TS type extension on the frontend
# (else `npm run build` fails). Same for stores/*.ts state types.
# Replace <workorder-files> with your specific allowed regex.
# ---------------------------------------------------------------
echo "[N/${TOTAL}] no spillover into unrelated files"
cd "${REPO_ROOT}" || exit 1
EXPECTED='^(<workorder-files>|tv-html/src/services/api\.ts|tv-html/src/stores/.*\.ts)$'
SPILLOVER=$(git status -s 2>/dev/null \
    | grep -E '^[ MARC][MARC]?\s' \
    | awk '{print $2}' \
    | grep -v '^coordination/' \
    | grep -v '^workorders/' \
    | grep -vE "${EXPECTED}" || true)
if [ -z "${SPILLOVER}" ]; then check_pass; else check_fail "spillover:"; echo "${SPILLOVER}" | sed 's/^/    /'; fi
echo ""

# ---------------------------------------------------------------
# Summary
# ---------------------------------------------------------------
echo "============================================================"
echo "Summary: ${PASS}/${TOTAL} PASS, ${FAIL} FAIL"
echo "============================================================"
echo ""
if [ ${FAIL} -eq 0 ]; then
    echo -e "${GREEN}✅ All ${TOTAL} checks PASS${NC}"
    exit 0
else
    echo -e "${RED}❌ ${FAIL}/${TOTAL} FAIL${NC}"
    exit 1
fi
