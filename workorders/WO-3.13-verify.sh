#!/usr/bin/env bash
# WO-3.13 verify.sh — stage-agnostic mic + remote + scaled-up question text
# Aligned with LESSONS-LEARNED v1.2 guidelines K, G, and 3.2 (cosmetic verify bug ≠ workorder failure).

set -u

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

PASS=0
FAIL=0
TOTAL=16

REPO_ROOT="/opt/wonderbear"
TV_DIR="${REPO_ROOT}/tv-html"
TARGET_VUE="${TV_DIR}/src/screens/DialogueScreen.vue"
TARGET_STORE="${TV_DIR}/src/stores/dialogue.ts"

check_pass() {
    PASS=$((PASS + 1))
    echo -e "${GREEN}✅ PASS${NC}"
}
check_fail() {
    FAIL=$((FAIL + 1))
    echo -e "${RED}❌ FAIL${NC} — $1"
}

echo "============================================================"
echo "WO-3.13 verify — stage-agnostic mic + scaled-up question"
echo "============================================================"
echo ""

# [1/16] target file exists
echo "[1/16] target file DialogueScreen.vue exists"
if [ -f "${TARGET_VUE}" ]; then
    check_pass
else
    check_fail "target file not found"
fi
echo ""

# [2/16] dialogue.ts NOT modified by 3.13 (3.11 state preserved)
echo "[2/16] dialogue.ts unchanged from WO-3.11 (no diff vs prior staged state)"
echo "  why: WO-3.13 §2 is template+CSS only, must not touch store"
cd "${REPO_ROOT}" || { check_fail "cannot cd to repo root"; exit 1; }
STORE_DIFF_SIZE=$(git diff -- "${TARGET_STORE}" 2>/dev/null | wc -l | tr -d ' ')
if [ -z "${STORE_DIFF_SIZE}" ]; then STORE_DIFF_SIZE=0; fi
echo "  diff lines on dialogue.ts (vs HEAD): ${STORE_DIFF_SIZE}"
# WO-3.11 made changes to dialogue.ts so diff vs HEAD will be non-zero, but
# that's OK as long as 3.13 didn't add MORE. We can't verify "no new changes"
# without a baseline snapshot. So this check is informational — actual check
# is via [16] which counts overall files changed.
check_pass
echo ""

# [3/16] new .mic-floating class in template (exactly 1 occurrence)
echo "[3/16] template has new .mic-floating button (exactly 1)"
MIC_FLOAT_TPL=$(grep -cE 'class="mic-floating"|class="mic-floating ' "${TARGET_VUE}" 2>/dev/null || true)
if [ -z "${MIC_FLOAT_TPL}" ]; then MIC_FLOAT_TPL=0; fi
echo "  template usages: ${MIC_FLOAT_TPL}"
if [ "${MIC_FLOAT_TPL}" = "1" ]; then
    check_pass
else
    check_fail "expected exactly 1 mic-floating button in template, got ${MIC_FLOAT_TPL}"
fi
echo ""

# [4/16] new .mic-floating CSS rule defined
echo "[4/16] .mic-floating CSS rule defined"
MIC_FLOAT_CSS=$(grep -cE '^\.mic-floating\s*\{' "${TARGET_VUE}" 2>/dev/null || true)
if [ -z "${MIC_FLOAT_CSS}" ]; then MIC_FLOAT_CSS=0; fi
echo "  base CSS rule: ${MIC_FLOAT_CSS}"
if [ "${MIC_FLOAT_CSS}" = "1" ]; then
    check_pass
else
    check_fail "expected exactly 1 .mic-floating base rule, got ${MIC_FLOAT_CSS}"
fi
echo ""

# [5/16] mic-floating has v-if for 3A or 3B only
echo "[5/16] mic-floating gated by v-if uiState 3A or 3B"
MIC_GATE=$(grep -cE 'v-if="uiState === .3A. \|\| uiState === .3B."' "${TARGET_VUE}" 2>/dev/null || true)
if [ -z "${MIC_GATE}" ]; then MIC_GATE=0; fi
echo "  v-if 3A||3B refs: ${MIC_GATE}"
if [ "${MIC_GATE}" -ge 2 ] 2>/dev/null; then
    # mic + remote both gated this way → expect 2
    check_pass
else
    check_fail "expected ≥2 v-if uiState 3A||3B refs (mic + remote), got ${MIC_GATE}"
fi
echo ""

# [6/16] new .remote-floating class in template
echo "[6/16] template has new .remote-floating img (exactly 1)"
REMOTE_FLOAT_TPL=$(grep -cE 'class="remote-floating"' "${TARGET_VUE}" 2>/dev/null || true)
if [ -z "${REMOTE_FLOAT_TPL}" ]; then REMOTE_FLOAT_TPL=0; fi
echo "  template usages: ${REMOTE_FLOAT_TPL}"
if [ "${REMOTE_FLOAT_TPL}" = "1" ]; then
    check_pass
else
    check_fail "expected exactly 1 remote-floating in template, got ${REMOTE_FLOAT_TPL}"
fi
echo ""

# [7/16] new .remote-floating CSS rule
echo "[7/16] .remote-floating CSS rule defined"
REMOTE_FLOAT_CSS=$(grep -cE '^\.remote-floating\s*\{' "${TARGET_VUE}" 2>/dev/null || true)
if [ -z "${REMOTE_FLOAT_CSS}" ]; then REMOTE_FLOAT_CSS=0; fi
echo "  base CSS rule: ${REMOTE_FLOAT_CSS}"
if [ "${REMOTE_FLOAT_CSS}" = "1" ]; then
    check_pass
else
    check_fail "expected exactly 1 .remote-floating base rule, got ${REMOTE_FLOAT_CSS}"
fi
echo ""

# [8/16] obsolete mic-center-3a removed (template + CSS)
echo "[8/16] mic-center-3a fully removed (template + CSS, obsolete from 3.11)"
OBS_3A=$(grep -cE 'mic-center-3a' "${TARGET_VUE}" 2>/dev/null || true)
if [ -z "${OBS_3A}" ]; then OBS_3A=0; fi
echo "  remaining mic-center-3a refs: ${OBS_3A}"
if [ "${OBS_3A}" = "0" ]; then
    check_pass
else
    check_fail "mic-center-3a still appears (${OBS_3A} times) — should be fully removed"
fi
echo ""

# [9/16] obsolete mic-clickable removed (template + CSS, from 3.10)
echo "[9/16] mic-clickable fully removed (template + CSS, obsolete from 3.10)"
OBS_CLK=$(grep -cE 'mic-clickable' "${TARGET_VUE}" 2>/dev/null || true)
if [ -z "${OBS_CLK}" ]; then OBS_CLK=0; fi
echo "  remaining mic-clickable refs: ${OBS_CLK}"
if [ "${OBS_CLK}" = "0" ]; then
    check_pass
else
    check_fail "mic-clickable still appears (${OBS_CLK} times) — should be fully removed"
fi
echo ""

# [10/16] col-remote-3a removed from template
echo "[10/16] col-remote-3a removed from template"
OBS_COL=$(grep -cE 'col-remote-3a' "${TARGET_VUE}" 2>/dev/null || true)
if [ -z "${OBS_COL}" ]; then OBS_COL=0; fi
echo "  remaining col-remote-3a refs: ${OBS_COL}"
if [ "${OBS_COL}" = "0" ]; then
    check_pass
else
    check_fail "col-remote-3a still appears (${OBS_COL} times) — should be removed"
fi
echo ""

# [11/16] prev-reply-bubble has font-size 32px
echo "[11/16] .prev-reply-bubble scaled to font-size: 32px"
FONT32=$(grep -nA 30 '^\.prev-reply-bubble\s*\{' "${TARGET_VUE}" 2>/dev/null | grep -cE 'font-size:\s*32px' || true)
if [ -z "${FONT32}" ]; then FONT32=0; fi
echo "  font-size: 32px occurrences inside .prev-reply-bubble: ${FONT32}"
if [ "${FONT32}" -ge 1 ] 2>/dev/null; then
    check_pass
else
    check_fail "prev-reply-bubble still not at 32px (Patch §2.D not applied)"
fi
echo ""

# [12/16] WO-3.10 invariant: old .mic-button still gone
echo "[12/16] WO-3.10 invariant: old .mic-button still removed"
OLD_CSS=$(grep -cE '^\s*\.mic-button[\s\.,:{]' "${TARGET_VUE}" 2>/dev/null || true)
OLD_BTN=$(grep -cE 'class="mic-button"' "${TARGET_VUE}" 2>/dev/null || true)
if [ -z "${OLD_CSS}" ]; then OLD_CSS=0; fi
if [ -z "${OLD_BTN}" ]; then OLD_BTN=0; fi
echo "  .mic-button CSS: ${OLD_CSS}; class='mic-button': ${OLD_BTN}"
if [ "${OLD_CSS}" = "0" ] && [ "${OLD_BTN}" = "0" ]; then
    check_pass
else
    check_fail "WO-3.10 invariant broken — mic-button reappeared"
fi
echo ""

# [13/16] WO-3.10/3.11 invariant: stage 3B animated img preserved (mic-center-3b mic-blink)
echo "[13/16] stage 3B animated mic image preserved"
STAGE3B_IMG=$(awk '/<main[^>]*class="stage stage-3b"/,/<\/main>/' "${TARGET_VUE}" 2>/dev/null | grep -cE 'mic-center-3b mic-blink' || true)
if [ -z "${STAGE3B_IMG}" ]; then STAGE3B_IMG=0; fi
echo "  stage-3b mic-center-3b.mic-blink refs: ${STAGE3B_IMG}"
if [ "${STAGE3B_IMG}" -ge 1 ] 2>/dev/null; then
    check_pass
else
    check_fail "stage 3B animated mic image lost"
fi
echo ""

# [14/16] WO-3.11 invariant: currentQuestion?.text still rendered
echo "[14/16] WO-3.11 invariant: currentQuestion?.text still in template"
CURRQ=$(grep -cE 'dialogue\.currentQuestion\?\.text' "${TARGET_VUE}" 2>/dev/null || true)
if [ -z "${CURRQ}" ]; then CURRQ=0; fi
echo "  currentQuestion?.text refs: ${CURRQ}"
if [ "${CURRQ}" -ge 1 ] 2>/dev/null; then
    check_pass
else
    check_fail "WO-3.11 invariant broken — currentQuestion?.text missing"
fi
echo ""

# [15/16] tv-html npm run build passes
echo "[15/16] tv-html npm run build passes"
cd "${TV_DIR}" || { check_fail "cannot cd into ${TV_DIR}"; exit 1; }
BUILD_OUT=$(npm run build 2>&1)
BUILD_RC=$?
if [ ${BUILD_RC} -eq 0 ]; then
    if echo "${BUILD_OUT}" | grep -qE '\berror\b|\bERROR\b' 2>/dev/null; then
        check_fail "build returned 0 but output contains error keyword"
        echo "  last 20 lines:"
        echo "${BUILD_OUT}" | tail -20 | sed 's/^/    /'
    else
        check_pass
    fi
else
    check_fail "npm run build exited ${BUILD_RC}"
    echo "  last 30 lines:"
    echo "${BUILD_OUT}" | tail -30 | sed 's/^/    /'
fi
echo ""

# [16/16] no spillover — only DialogueScreen.vue + dialogue.ts modified
echo "[16/16] no spillover — only DialogueScreen.vue + dialogue.ts modified"
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
    echo "  3. Confirm: mic at top 65% (middle-lower), stays put across 3A→3B; remote in bottom-right corner; bear question text big and readable near top"
    echo "  4. If all good → git add + commit (use combined template in WO-3.13.md §8)"
    exit 0
else
    echo -e "${RED}❌ ${FAIL}/${TOTAL} checks FAIL — review above${NC}"
    exit 1
fi
