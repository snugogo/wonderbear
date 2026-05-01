#!/usr/bin/env bash
# WO-3.12 verify.sh — StoryCoverScreen first-time overlay + author display + author TTS

set -u

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

PASS=0
FAIL=0
TOTAL=18

REPO_ROOT="/opt/wonderbear"
TV_DIR="${REPO_ROOT}/tv-html"
SERVER_DIR="${REPO_ROOT}/server-v7"
COVER="${TV_DIR}/src/screens/StoryCoverScreen.vue"
GEN="${TV_DIR}/src/screens/GeneratingScreen.vue"
DIALOGUE="${TV_DIR}/src/screens/DialogueScreen.vue"
ZH="${TV_DIR}/src/i18n/locales/zh.ts"
EN="${TV_DIR}/src/i18n/locales/en.ts"
PL="${TV_DIR}/src/i18n/locales/pl.ts"
RO="${TV_DIR}/src/i18n/locales/ro.ts"
STORY_ROUTE="${SERVER_DIR}/src/routes/story.js"

check_pass() { PASS=$((PASS + 1)); echo -e "${GREEN}✅ PASS${NC}"; }
check_fail() { FAIL=$((FAIL + 1)); echo -e "${RED}❌ FAIL${NC} — $1"; }

echo "============================================================"
echo "WO-3.12 verify — StoryCoverScreen overlay + author + TTS"
echo "============================================================"
echo ""

# [1/18] target files exist
echo "[1/18] all target files exist"
ALL_FILES_OK=true
for f in "${COVER}" "${GEN}" "${ZH}" "${EN}" "${PL}" "${RO}" "${STORY_ROUTE}"; do
    if [ ! -f "${f}" ]; then
        echo "  missing: ${f}"
        ALL_FILES_OK=false
    fi
done
if [ "${ALL_FILES_OK}" = "true" ]; then check_pass; else check_fail "missing files"; fi
echo ""

# [2/18] GeneratingScreen passes firstTime: true
echo "[2/18] GeneratingScreen.vue passes { firstTime: true } to story-cover"
GEN_FT=$(grep -cE "screen\.go\(.story-cover.,\s*\{.*firstTime:\s*true" "${GEN}" 2>/dev/null || true)
if [ -z "${GEN_FT}" ]; then GEN_FT=0; fi
echo "  occurrences: ${GEN_FT}"
if [ "${GEN_FT}" -ge 1 ] 2>/dev/null; then check_pass; else check_fail "GeneratingScreen does not pass firstTime: true"; fi
echo ""

# [3/18] StoryCoverScreen reads firstTime
echo "[3/18] StoryCoverScreen.vue reads firstTime from screen.payload"
COVER_READ=$(grep -cE 'firstTime' "${COVER}" 2>/dev/null || true)
if [ -z "${COVER_READ}" ]; then COVER_READ=0; fi
echo "  total firstTime refs: ${COVER_READ}"
if [ "${COVER_READ}" -ge 6 ] 2>/dev/null; then check_pass; else check_fail "StoryCoverScreen has only ${COVER_READ} firstTime refs (expected ≥6)"; fi
echo ""

# [4/18] StoryCoverScreen has v-if firstTime on .bear
echo "[4/18] StoryCoverScreen.vue gates .bear with v-if firstTime"
BEAR_GATE=$(grep -cE 'v-if="firstTime"[^>]*class="bear"|class="bear"[^>]*v-if="firstTime"' "${COVER}" 2>/dev/null || true)
if [ -z "${BEAR_GATE}" ]; then BEAR_GATE=0; fi
echo "  bear gated: ${BEAR_GATE}"
if [ "${BEAR_GATE}" -ge 1 ] 2>/dev/null; then check_pass; else check_fail "bear class img not gated"; fi
echo ""

# [5/18] StoryCoverScreen has v-if firstTime on .deco-stars
echo "[5/18] StoryCoverScreen.vue gates .deco-stars with v-if firstTime"
STARS_GATE=$(grep -cE 'v-if="firstTime"[^>]*class="deco-stars"|class="deco-stars"[^>]*v-if="firstTime"' "${COVER}" 2>/dev/null || true)
if [ -z "${STARS_GATE}" ]; then STARS_GATE=0; fi
echo "  deco-stars gated: ${STARS_GATE}"
if [ "${STARS_GATE}" -ge 1 ] 2>/dev/null; then check_pass; else check_fail "deco-stars not gated"; fi
echo ""

# [6/18] createdBy used in StoryCoverScreen
echo "[6/18] StoryCoverScreen.vue uses t('story.createdBy', ...)"
CB_USE=$(grep -cE "t\('story\.createdBy'|t\(\"story\.createdBy\"" "${COVER}" 2>/dev/null || true)
if [ -z "${CB_USE}" ]; then CB_USE=0; fi
echo "  story.createdBy refs: ${CB_USE}"
if [ "${CB_USE}" -ge 1 ] 2>/dev/null; then check_pass; else check_fail "missing t('story.createdBy')"; fi
echo ""

# [7-10/18] i18n createdBy keys
for IDX_LOC in "7:zh.ts:${ZH}" "8:en.ts:${EN}" "9:pl.ts:${PL}" "10:ro.ts:${RO}"; do
    IDX=$(echo "${IDX_LOC}" | cut -d: -f1)
    NAME=$(echo "${IDX_LOC}" | cut -d: -f2)
    F=$(echo "${IDX_LOC}" | cut -d: -f3)
    echo "[${IDX}/18] ${NAME} has story.createdBy key"
    CB=$(grep -cE 'createdBy:' "${F}" 2>/dev/null || true)
    if [ -z "${CB}" ]; then CB=0; fi
    echo "  ${NAME} createdBy: ${CB}"
    if [ "${CB}" -ge 1 ] 2>/dev/null; then check_pass; else check_fail "${NAME} missing createdBy"; fi
    echo ""
done

# [11/18] backend include child
echo "[11/18] server-v7 story.js has Prisma include for child name"
INCLUDE_REFS=$(grep -cE 'include:\s*\{[^}]*child' "${STORY_ROUTE}" 2>/dev/null || true)
if [ -z "${INCLUDE_REFS}" ]; then INCLUDE_REFS=0; fi
echo "  include child refs: ${INCLUDE_REFS}"
if [ "${INCLUDE_REFS}" -ge 1 ] 2>/dev/null; then check_pass; else check_fail "story.js missing include child"; fi
echo ""

# [12/18] tv-html build
echo "[12/18] tv-html npm run build passes"
cd "${TV_DIR}" || { check_fail "cannot cd"; exit 1; }
BUILD_OUT=$(npm run build 2>&1)
BUILD_RC=$?
if [ ${BUILD_RC} -eq 0 ]; then
    if echo "${BUILD_OUT}" | grep -qE '\berror\b|\bERROR\b' 2>/dev/null; then
        check_fail "build returned 0 but output contains error"
        echo "${BUILD_OUT}" | tail -20 | sed 's/^/    /'
    else
        check_pass
    fi
else
    check_fail "build exited ${BUILD_RC}"
    echo "${BUILD_OUT}" | tail -30 | sed 's/^/    /'
fi
echo ""

# [13/18] server-v7 story.js node require
echo "[13/18] server-v7 story.js loadable via node -e require"
cd "${SERVER_DIR}" || { check_fail "cannot cd"; exit 1; }
NODE_OUT=$(node -e "require('./src/routes/story.js')" 2>&1)
NODE_RC=$?
if [ ${NODE_RC} -eq 0 ]; then check_pass; else check_fail "node require failed"; echo "${NODE_OUT}" | sed 's/^/    /'; fi
echo ""

# [14/18] mic-floating invariant
echo "[14/18] mic series invariant: .mic-floating still defined"
MICFLOAT=$(grep -cE '^\.mic-floating\s*\{' "${DIALOGUE}" 2>/dev/null || true)
if [ -z "${MICFLOAT}" ]; then MICFLOAT=0; fi
if [ "${MICFLOAT}" = "1" ]; then check_pass; else check_fail "mic-floating regressed"; fi
echo ""

# [15/18] mic-floating top 80%
echo "[15/18] mic series invariant: .mic-floating top: 80%"
TOP80=$(awk '/^\.mic-floating\s*\{/{flag=1} flag{print; if (/^\}/) flag=0}' "${DIALOGUE}" 2>/dev/null | grep -cE 'top:\s*80%' || true)
if [ -z "${TOP80}" ]; then TOP80=0; fi
if [ "${TOP80}" -ge 1 ] 2>/dev/null; then check_pass; else check_fail "mic-floating not at 80%"; fi
echo ""

# [16/18] prev-reply-bubble 32px
echo "[16/18] mic series invariant: prev-reply-bubble 32px"
FONT32=$(awk '/^\.prev-reply-bubble\s*\{/{flag=1} flag{print; if (/^\}/) flag=0}' "${DIALOGUE}" 2>/dev/null | grep -cE 'font-size:\s*32px' || true)
if [ -z "${FONT32}" ]; then FONT32=0; fi
if [ "${FONT32}" -ge 1 ] 2>/dev/null; then check_pass; else check_fail "prev-reply-bubble lost 32px"; fi
echo ""

# [17/18] WO-3.9 Luna invariant
echo "[17/18] WO-3.9 invariant: Luna doesn't reappear in tv-html src (except dev/)"
LUNA_REAPPEAR=$(grep -rn 'Luna' "${TV_DIR}/src" --include='*.ts' --include='*.vue' --include='*.json' 2>/dev/null | grep -v '/dev/' | grep -v '\.backup' | wc -l | tr -d ' ')
if [ -z "${LUNA_REAPPEAR}" ]; then LUNA_REAPPEAR=0; fi
echo "  Luna refs: ${LUNA_REAPPEAR}"
if [ "${LUNA_REAPPEAR}" = "0" ]; then check_pass; else check_fail "Luna regression"; fi
echo ""

# [18/18] no spillover
echo "[18/18] no spillover"
cd "${REPO_ROOT}" || exit 1
EXPECTED='^(tv-html/src/screens/StoryCoverScreen\.vue|tv-html/src/screens/GeneratingScreen\.vue|tv-html/src/i18n/locales/(zh|en|pl|ro)\.ts|tv-html/src/stores/story\.ts|server-v7/src/routes/story\.js)$'
SPILLOVER=$(git status -s 2>/dev/null | grep -E '^[ MARC][MARC]?\s' | awk '{print $2}' | grep -v '^coordination/' | grep -v '^workorders/' | grep -vE "${EXPECTED}" || true)
if [ -z "${SPILLOVER}" ]; then check_pass; else check_fail "spillover:"; echo "${SPILLOVER}" | sed 's/^/    /'; fi
echo ""

echo "============================================================"
echo "Summary: ${PASS}/${TOTAL} PASS, ${FAIL} FAIL"
echo "============================================================"
echo ""
if [ ${FAIL} -eq 0 ]; then
    echo -e "${GREEN}✅ All ${TOTAL} checks PASS${NC}"
    echo "Next: pm2 restart wonderbear-server + rsync + Chrome 2-path test"
    exit 0
else
    echo -e "${RED}❌ ${FAIL}/${TOTAL} FAIL${NC}"
    exit 1
fi
