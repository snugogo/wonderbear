#!/usr/bin/env bash
# WO-3.11 verify.sh — fix mic position drift + show current question while recording
# Aligned with LESSONS-LEARNED v1.2 guideline K (module-load testing) and G (no $0.92 burn for UI changes).

set -u  # do NOT use set -e — we want all 14 checks to run regardless

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

PASS=0
FAIL=0
TOTAL=14

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
echo "WO-3.11 verify — mic position + current-question rendering"
echo "============================================================"
echo ""

# [1/14] both target files exist
echo "[1/14] both target files exist"
if [ -f "${TARGET_VUE}" ] && [ -f "${TARGET_STORE}" ]; then
    check_pass
else
    check_fail "one or both target files not found"
fi
echo ""

# [2/14] git status: exactly 2 modified files (DialogueScreen.vue + dialogue.ts)
echo "[2/14] git status: exactly 2 modified files (DialogueScreen.vue + dialogue.ts)"
cd "${REPO_ROOT}" || { check_fail "cannot cd to repo root"; exit 1; }
MOD=$(git status -s 2>/dev/null | grep -E '^[ MARC][MARC]?\s' | awk '{print $2}' | grep -v '^coordination/' | grep -v '^workorders/' | sort)
EXPECTED=$(printf "tv-html/src/screens/DialogueScreen.vue\ntv-html/src/stores/dialogue.ts")
echo "  modified non-coordination files:"
echo "${MOD}" | sed 's/^/    /'
if [ "${MOD}" = "${EXPECTED}" ]; then
    check_pass
else
    check_fail "expected exactly DialogueScreen.vue + dialogue.ts, got something else"
fi
echo ""

# [3/14] stage 3A has restored ui_remote.webp
echo "[3/14] stage 3A right column restored to ui_remote.webp"
STAGE3A_REMOTE=$(awk '/<main[^>]*class="stage stage-3a"/,/<\/main>/' "${TARGET_VUE}" 2>/dev/null | grep -c 'ui_remote.webp' || true)
if [ -z "${STAGE3A_REMOTE}" ]; then STAGE3A_REMOTE=0; fi
echo "  ui_remote.webp refs in stage-3a: ${STAGE3A_REMOTE}"
if [ "${STAGE3A_REMOTE}" -ge 1 ] 2>/dev/null; then
    check_pass
else
    check_fail "stage-3a missing ui_remote.webp (Patch §2.A.1 not applied)"
fi
echo ""

# [4/14] stage 3A has new centered mic button mic-center-3a
echo "[4/14] stage 3A has centered mic button class mic-center-3a"
STAGE3A_MIC=$(awk '/<main[^>]*class="stage stage-3a"/,/<\/main>/' "${TARGET_VUE}" 2>/dev/null | grep -c 'mic-center-3a' || true)
if [ -z "${STAGE3A_MIC}" ]; then STAGE3A_MIC=0; fi
echo "  mic-center-3a refs in stage-3a: ${STAGE3A_MIC}"
if [ "${STAGE3A_MIC}" -ge 1 ] 2>/dev/null; then
    check_pass
else
    check_fail "stage-3a missing mic-center-3a button (Patch §2.A.2 not applied)"
fi
echo ""

# [5/14] mic-center-3a CSS rule defined
echo "[5/14] .mic-center-3a CSS rule defined"
CSS_DEF=$(grep -cE '^\.mic-center-3a\s*\{' "${TARGET_VUE}" 2>/dev/null || true)
if [ -z "${CSS_DEF}" ]; then CSS_DEF=0; fi
echo "  base CSS rule matches: ${CSS_DEF}"
if [ "${CSS_DEF}" = "1" ]; then
    check_pass
else
    check_fail ".mic-center-3a CSS rule expected exactly 1, got ${CSS_DEF}"
fi
echo ""

# [6/14] mic-center-3a has nested override .mic-center-3b position:static
echo "[6/14] .mic-center-3a .mic-center-3b nested rule exists (position override)"
NESTED=$(grep -cE '\.mic-center-3a\s+\.mic-center-3b' "${TARGET_VUE}" 2>/dev/null || true)
if [ -z "${NESTED}" ]; then NESTED=0; fi
echo "  nested override matches: ${NESTED}"
if [ "${NESTED}" -ge 1 ] 2>/dev/null; then
    check_pass
else
    check_fail "missing .mic-center-3a .mic-center-3b override (inner img will misposition)"
fi
echo ""

# [7/14] all 6 pointer/touch handlers still appear ≥3 times each (3A + 3B + something else? actually 3A + 3B = 2)
echo "[7/14] all 6 pointer/touch handlers appear ≥2 times each (3A + 3B mic buttons)"
ALL_OK=true
for HANDLER in '@mousedown="onMicDown"' '@mouseup="onMicUp"' '@mouseleave="onMicUp"' '@touchstart\.prevent="onMicDown"' '@touchend\.prevent="onMicUp"' '@touchcancel\.prevent="onMicUp"'; do
    H_COUNT=$(grep -cE "${HANDLER}" "${TARGET_VUE}" 2>/dev/null || true)
    if [ -z "${H_COUNT}" ]; then H_COUNT=0; fi
    echo "  ${HANDLER}: ${H_COUNT}"
    if [ "${H_COUNT}" -lt 2 ] 2>/dev/null; then
        ALL_OK=false
    fi
done
if [ "${ALL_OK}" = "true" ]; then
    check_pass
else
    check_fail "some handler appears <2 times — both 3A and 3B mic buttons must bind all 6"
fi
echo ""

# [8/14] template uses currentQuestion?.text in v-if and interpolation
echo "[8/14] template renders dialogue.currentQuestion?.text (replaces lastBearReply)"
CURRQ_VIF=$(grep -cE 'v-if="dialogue\.currentQuestion\?\.text"' "${TARGET_VUE}" 2>/dev/null || true)
if [ -z "${CURRQ_VIF}" ]; then CURRQ_VIF=0; fi
CURRQ_INTERP=$(grep -cE '\{\{\s*dialogue\.currentQuestion\.text\s*\}\}' "${TARGET_VUE}" 2>/dev/null || true)
if [ -z "${CURRQ_INTERP}" ]; then CURRQ_INTERP=0; fi
echo "  v-if currentQuestion?.text matches: ${CURRQ_VIF}"
echo "  interpolation matches: ${CURRQ_INTERP}"
if [ "${CURRQ_VIF}" -ge 1 ] 2>/dev/null && [ "${CURRQ_INTERP}" -ge 1 ] 2>/dev/null; then
    check_pass
else
    check_fail "template missing currentQuestion?.text binding (Patch §2.B.1 not applied)"
fi
echo ""

# [9/14] lastBearReply removed from DialogueScreen.vue (should be 0)
echo "[9/14] lastBearReply removed from DialogueScreen.vue"
LBR_VUE=$(grep -c 'lastBearReply' "${TARGET_VUE}" 2>/dev/null || true)
if [ -z "${LBR_VUE}" ]; then LBR_VUE=0; fi
echo "  lastBearReply refs in DialogueScreen.vue: ${LBR_VUE}"
if [ "${LBR_VUE}" = "0" ]; then
    check_pass
else
    check_fail "lastBearReply still in DialogueScreen.vue (${LBR_VUE} refs)"
fi
echo ""

# [10/14] lastBearReply removed from stores/dialogue.ts (should be 0)
echo "[10/14] lastBearReply removed from stores/dialogue.ts"
LBR_STORE=$(grep -c 'lastBearReply' "${TARGET_STORE}" 2>/dev/null || true)
if [ -z "${LBR_STORE}" ]; then LBR_STORE=0; fi
echo "  lastBearReply refs in dialogue.ts: ${LBR_STORE}"
if [ "${LBR_STORE}" = "0" ]; then
    check_pass
else
    check_fail "lastBearReply still in stores/dialogue.ts (${LBR_STORE} refs)"
fi
echo ""

# [11/14] WO-3.10 invariants preserved: old .mic-button still gone (regression check)
echo "[11/14] WO-3.10 invariant: old .mic-button still removed (regression)"
OLD_CSS=$(grep -cE '^\s*\.mic-button[\s\.,:{]' "${TARGET_VUE}" 2>/dev/null || true)
OLD_BTN=$(grep -cE 'class="mic-button"' "${TARGET_VUE}" 2>/dev/null || true)
if [ -z "${OLD_CSS}" ]; then OLD_CSS=0; fi
if [ -z "${OLD_BTN}" ]; then OLD_BTN=0; fi
echo "  .mic-button CSS rules: ${OLD_CSS}; class='mic-button' template refs: ${OLD_BTN}"
if [ "${OLD_CSS}" = "0" ] && [ "${OLD_BTN}" = "0" ]; then
    check_pass
else
    check_fail "WO-3.10 invariant broken — old mic-button reappeared somehow"
fi
echo ""

# [12/14] WO-3.10 invariant: stage 3B animated mic preserved
echo "[12/14] WO-3.10 invariant: stage 3B animated mic preserved"
STAGE3B_BLINK=$(awk '/<main[^>]*class="stage stage-3b"/,/<\/main>/' "${TARGET_VUE}" 2>/dev/null | grep -cE 'mic-center-3b mic-blink' || true)
if [ -z "${STAGE3B_BLINK}" ]; then STAGE3B_BLINK=0; fi
echo "  mic-center-3b mic-blink class refs in stage-3b: ${STAGE3B_BLINK}"
if [ "${STAGE3B_BLINK}" -ge 1 ] 2>/dev/null; then
    check_pass
else
    check_fail "stage 3B animated mic class lost — animation will break"
fi
echo ""

# [13/14] tv-html npm run build passes
echo "[13/14] tv-html npm run build passes"
echo "  why: catches Vue compile errors that grep can't see (LESSONS guideline K)"
cd "${TV_DIR}" || { check_fail "cannot cd into ${TV_DIR}"; exit 1; }
BUILD_OUT=$(npm run build 2>&1)
BUILD_RC=$?
if [ ${BUILD_RC} -eq 0 ]; then
    if echo "${BUILD_OUT}" | grep -qE '\berror\b|\bERROR\b' 2>/dev/null; then
        check_fail "npm run build returned 0 but output contains error keyword"
        echo "  last 20 lines:"
        echo "${BUILD_OUT}" | tail -20 | sed 's/^/    /'
    else
        check_pass
    fi
else
    check_fail "npm run build exited with code ${BUILD_RC}"
    echo "  last 30 lines:"
    echo "${BUILD_OUT}" | tail -30 | sed 's/^/    /'
fi
echo ""

# [14/14] no spillover to other screens / backend / etc
echo "[14/14] no spillover — only DialogueScreen.vue + dialogue.ts touched"
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
    echo "  3. Confirm: 3A has both ui_remote icon (right) AND centered mic; 3B mic stays at SAME position as 3A; recording shows current bear question text near top"
    echo "  4. If all good → git add + commit (use template in WO-3.11.md §8 — it covers WO-3.10 + 3.11 in one commit)"
    exit 0
else
    echo -e "${RED}❌ ${FAIL}/${TOTAL} checks FAIL — review above${NC}"
    exit 1
fi
