#!/usr/bin/env bash
# WO-3.14 verify.sh — remove duplicate center mic + shift floating mic to top 80%
# LESSONS guideline 3.2: cosmetic verify-tool false-fails are not workorder failures.
# This time we exclude HTML/CSS comments from grep counts to reduce false positives.

set -u

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

PASS=0
FAIL=0
TOTAL=10

REPO_ROOT="/opt/wonderbear"
TV_DIR="${REPO_ROOT}/tv-html"
TARGET_VUE="${TV_DIR}/src/screens/DialogueScreen.vue"

check_pass() {
    PASS=$((PASS + 1))
    echo -e "${GREEN}✅ PASS${NC}"
}
check_fail() {
    FAIL=$((FAIL + 1))
    echo -e "${RED}❌ FAIL${NC} — $1"
}

# helper: count grep matches but exclude lines that look like comments
# args: pattern, file
grep_count_no_comments() {
    local pattern="$1"
    local file="$2"
    grep -nE "${pattern}" "${file}" 2>/dev/null \
        | grep -vE ':\s*\*' \
        | grep -vE ':\s*//' \
        | grep -vE ':\s*<!--' \
        | wc -l | tr -d ' '
}

echo "============================================================"
echo "WO-3.14 verify — remove duplicate center mic + shift to 80%"
echo "============================================================"
echo ""

# [1/10] target file exists
echo "[1/10] target file exists"
if [ -f "${TARGET_VUE}" ]; then
    check_pass
else
    check_fail "target file not found"
fi
echo ""

# [2/10] in-stage <img class="mic-center-3b mic-blink"> removed from template
echo "[2/10] in-stage animated mic <img> removed from stage-3b"
IMG_REFS=$(awk '/<main[^>]*class="stage stage-3b"/,/<\/main>/' "${TARGET_VUE}" 2>/dev/null | grep -c 'mic-center-3b mic-blink' || true)
if [ -z "${IMG_REFS}" ]; then IMG_REFS=0; fi
echo "  mic-center-3b mic-blink in stage-3b template: ${IMG_REFS}"
if [ "${IMG_REFS}" = "0" ]; then
    check_pass
else
    check_fail "in-stage mic image still present (${IMG_REFS}) — should be 0"
fi
echo ""

# [3/10] .mic-center-3b CSS rule deleted (selector at start of line)
echo "[3/10] .mic-center-3b CSS rule definition removed"
CSS_DEF=$(grep -cE '^\.mic-center-3b\s*\{' "${TARGET_VUE}" 2>/dev/null || true)
if [ -z "${CSS_DEF}" ]; then CSS_DEF=0; fi
echo "  .mic-center-3b CSS base rule: ${CSS_DEF}"
if [ "${CSS_DEF}" = "0" ]; then
    check_pass
else
    check_fail ".mic-center-3b CSS rule still defined (${CSS_DEF})"
fi
echo ""

# [4/10] .mic-floating top changed to 80%
echo "[4/10] .mic-floating CSS has top: 80%"
TOP80=$(grep -nA 8 '^\.mic-floating\s*\{' "${TARGET_VUE}" 2>/dev/null | grep -cE 'top:\s*80%' || true)
if [ -z "${TOP80}" ]; then TOP80=0; fi
echo "  top: 80% inside .mic-floating block: ${TOP80}"
if [ "${TOP80}" -ge 1 ] 2>/dev/null; then
    check_pass
else
    check_fail "mic-floating top not changed to 80% (Patch §2.C not applied)"
fi
echo ""

# [5/10] .mic-floating top:65% no longer present
echo "[5/10] .mic-floating no longer at top: 65%"
TOP65=$(grep -nA 8 '^\.mic-floating\s*\{' "${TARGET_VUE}" 2>/dev/null | grep -cE 'top:\s*65%' || true)
if [ -z "${TOP65}" ]; then TOP65=0; fi
echo "  top: 65% inside .mic-floating block: ${TOP65}"
if [ "${TOP65}" = "0" ]; then
    check_pass
else
    check_fail "mic-floating still at top: 65% (${TOP65})"
fi
echo ""

# [6/10] WO-3.13 invariant: .mic-floating still defined exactly once
echo "[6/10] WO-3.13 invariant: .mic-floating still defined"
MICFLOAT=$(grep -cE '^\.mic-floating\s*\{' "${TARGET_VUE}" 2>/dev/null || true)
if [ -z "${MICFLOAT}" ]; then MICFLOAT=0; fi
echo "  .mic-floating CSS rule: ${MICFLOAT}"
if [ "${MICFLOAT}" = "1" ]; then
    check_pass
else
    check_fail ".mic-floating expected exactly 1 rule, got ${MICFLOAT}"
fi
echo ""

# [7/10] WO-3.13 invariant: .remote-floating still defined exactly once
echo "[7/10] WO-3.13 invariant: .remote-floating still defined"
REMOTEFLOAT=$(grep -cE '^\.remote-floating\s*\{' "${TARGET_VUE}" 2>/dev/null || true)
if [ -z "${REMOTEFLOAT}" ]; then REMOTEFLOAT=0; fi
echo "  .remote-floating CSS rule: ${REMOTEFLOAT}"
if [ "${REMOTEFLOAT}" = "1" ]; then
    check_pass
else
    check_fail ".remote-floating expected exactly 1 rule, got ${REMOTEFLOAT}"
fi
echo ""

# [8/10] WO-3.13 invariant: prev-reply-bubble still 32px
echo "[8/10] WO-3.13 invariant: prev-reply-bubble still at font-size 32px"
# Use awk to extract block content, not nested grep
FONT32=$(awk '/^\.prev-reply-bubble\s*\{/{flag=1} flag{print; if (/^\}/) flag=0}' "${TARGET_VUE}" 2>/dev/null | grep -cE 'font-size:\s*32px' || true)
if [ -z "${FONT32}" ]; then FONT32=0; fi
echo "  font-size: 32px inside .prev-reply-bubble (awk-block extracted): ${FONT32}"
if [ "${FONT32}" -ge 1 ] 2>/dev/null; then
    check_pass
else
    check_fail "prev-reply-bubble lost 32px (regression)"
fi
echo ""

# [9/10] tv-html npm run build passes
echo "[9/10] tv-html npm run build passes"
cd "${TV_DIR}" || { check_fail "cannot cd"; exit 1; }
BUILD_OUT=$(npm run build 2>&1)
BUILD_RC=$?
if [ ${BUILD_RC} -eq 0 ]; then
    if echo "${BUILD_OUT}" | grep -qE '\berror\b|\bERROR\b' 2>/dev/null; then
        check_fail "build returned 0 but output contains error keyword"
        echo "${BUILD_OUT}" | tail -20 | sed 's/^/    /'
    else
        check_pass
    fi
else
    check_fail "build exited ${BUILD_RC}"
    echo "${BUILD_OUT}" | tail -30 | sed 's/^/    /'
fi
echo ""

# [10/10] no spillover — only DialogueScreen.vue + dialogue.ts modified
echo "[10/10] no spillover — only DialogueScreen.vue + dialogue.ts modified"
cd "${REPO_ROOT}" || exit 1
SPILLOVER=$(git status -s 2>/dev/null | grep -E '^[ MARC][MARC]?\s' | awk '{print $2}' | grep -v '^coordination/' | grep -v '^workorders/' | grep -vE '^tv-html/src/(screens/DialogueScreen\.vue|stores/dialogue\.ts)$' || true)
if [ -z "${SPILLOVER}" ]; then
    check_pass
else
    check_fail "unexpected files modified:"
    echo "${SPILLOVER}" | sed 's/^/    /'
fi
echo ""

echo "============================================================"
echo "Summary: ${PASS}/${TOTAL} PASS, ${FAIL} FAIL"
echo "============================================================"
echo ""
if [ ${FAIL} -eq 0 ]; then
    echo -e "${GREEN}✅ All ${TOTAL} checks PASS${NC}"
    echo ""
    echo "Next steps for Kristy (manual):"
    echo "  1. ssh wonderbear-vps 'rsync -av --delete /opt/wonderbear/tv-html/dist/ /var/www/wonderbear-tv/'"
    echo "  2. Chrome Ctrl+Shift+R tv.bvtuber.com → DialogueScreen → walk 3A → 3B"
    echo "  3. Confirm: ONLY ONE mic on screen (not two), positioned at lower part of screen (top 80%); 3A/3B mic stays put; remote in bottom-right; bear question text big at top"
    echo "  4. If all good → git add + commit (combined message for WO-3.10/3.11/3.13/3.14)"
    exit 0
else
    echo -e "${RED}❌ ${FAIL}/${TOTAL} checks FAIL — review above${NC}"
    exit 1
fi
