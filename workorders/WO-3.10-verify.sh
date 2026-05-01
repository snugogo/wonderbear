#!/usr/bin/env bash
# WO-3.10 verify.sh — DialogueScreen mic interaction unification
# Aligned with LESSONS-LEARNED v1.2 guideline K (module-load testing) and
# guideline 3.3 (cosmetic verify bug ≠ workorder failure).

set -u  # do NOT use set -e — we want all 12 checks to run regardless

# ---------- color helpers ----------
GREEN='\033[0;32m'
RED='\033[0;31m'
YEL='\033[0;33m'
NC='\033[0m'

PASS=0
FAIL=0
TOTAL=12

# ---------- paths ----------
REPO_ROOT="/opt/wonderbear"
TV_DIR="${REPO_ROOT}/tv-html"
TARGET="${TV_DIR}/src/screens/DialogueScreen.vue"

check_pass() {
    PASS=$((PASS + 1))
    echo -e "${GREEN}✅ PASS${NC}"
}
check_fail() {
    FAIL=$((FAIL + 1))
    echo -e "${RED}❌ FAIL${NC} — $1"
}

echo "============================================================"
echo "WO-3.10 verify — DialogueScreen mic interaction unification"
echo "============================================================"
echo ""
echo "Target file: ${TARGET}"
echo ""

# [1/12] target file exists
echo "[1/12] target file exists"
if [ -f "${TARGET}" ]; then
    check_pass
else
    check_fail "target file not found"
fi
echo ""

# [2/12] old .mic-button CSS class definitions removed
echo "[2/12] old .mic-button CSS definitions removed"
echo "  why: old fixed-position button CSS (was at L1599-1628) must be deleted"
OLD_CSS_COUNT=$(grep -cE '^\s*\.mic-button[\s\.,:{]' "${TARGET}" 2>/dev/null || true)
if [ -z "${OLD_CSS_COUNT}" ]; then OLD_CSS_COUNT=0; fi
echo "  matches: ${OLD_CSS_COUNT}"
if [ "${OLD_CSS_COUNT}" = "0" ]; then
    check_pass
else
    check_fail ".mic-button CSS rules still present (${OLD_CSS_COUNT} match)"
fi
echo ""

# [3/12] old <button class="mic-button"> template element removed
echo "[3/12] old <button class=\"mic-button\"> template removed"
echo "  why: old floating button (was at L932-944) must be deleted"
OLD_BTN_COUNT=$(grep -cE 'class="mic-button"' "${TARGET}" 2>/dev/null || true)
if [ -z "${OLD_BTN_COUNT}" ]; then OLD_BTN_COUNT=0; fi
echo "  matches: ${OLD_BTN_COUNT}"
if [ "${OLD_BTN_COUNT}" = "0" ]; then
    check_pass
else
    check_fail "old <button class=\"mic-button\"> still in template (${OLD_BTN_COUNT} match)"
fi
echo ""

# [4/12] new .mic-clickable CSS class defined exactly once
echo "[4/12] .mic-clickable CSS class defined exactly once"
NEW_CSS_DEF_LINES=$(grep -nE '^\s*\.mic-clickable\s*\{' "${TARGET}" 2>/dev/null || true)
if [ -z "${NEW_CSS_DEF_LINES}" ]; then
    NEW_CSS_DEF_COUNT=0
else
    NEW_CSS_DEF_COUNT=$(echo "${NEW_CSS_DEF_LINES}" | wc -l | tr -d ' ')
fi
echo "  base-rule matches: ${NEW_CSS_DEF_COUNT}"
if [ "${NEW_CSS_DEF_COUNT}" = "1" ]; then
    check_pass
else
    check_fail ".mic-clickable base CSS rule expected exactly 1, got ${NEW_CSS_DEF_COUNT}"
fi
echo ""

# [5/12] new wrapper buttons reference .mic-clickable in template
echo "[5/12] template uses .mic-clickable on at least 2 wrapper buttons (3A + 3B)"
TPL_USE_COUNT=$(grep -cE 'class="[^"]*mic-clickable' "${TARGET}" 2>/dev/null || true)
if [ -z "${TPL_USE_COUNT}" ]; then TPL_USE_COUNT=0; fi
echo "  template usages: ${TPL_USE_COUNT}"
if [ "${TPL_USE_COUNT}" -ge 2 ] 2>/dev/null; then
    check_pass
else
    check_fail "expected ≥2 template usages of mic-clickable, got ${TPL_USE_COUNT}"
fi
echo ""

# [6/12] all 6 pointer/touch handlers present at least twice each
echo "[6/12] all 6 pointer/touch handlers present ≥2 times each"
ALL_OK=true
for HANDLER in '@mousedown="onMicDown"' '@mouseup="onMicUp"' '@mouseleave="onMicUp"' '@touchstart\.prevent="onMicDown"' '@touchend\.prevent="onMicUp"' '@touchcancel\.prevent="onMicUp"'; do
    H_COUNT=$(grep -cE "${HANDLER}" "${TARGET}" 2>/dev/null || true)
    if [ -z "${H_COUNT}" ]; then H_COUNT=0; fi
    echo "  ${HANDLER}: ${H_COUNT}"
    if [ "${H_COUNT}" -lt 2 ] 2>/dev/null; then
        ALL_OK=false
    fi
done
if [ "${ALL_OK}" = "true" ]; then
    check_pass
else
    check_fail "some handler appears <2 times — both 3A and 3B wrappers must bind all 6"
fi
echo ""

# [7/12] animated mic-center-3b img is preserved (still has both src branches)
echo "[7/12] animated mic-center-3b img preserved with both webp variants"
ANIM_OK=$(grep -cE "ui_mic_active\.webp" "${TARGET}" 2>/dev/null || true)
ANIM_BLINK=$(grep -cE 'class="mic-center-3b mic-blink"' "${TARGET}" 2>/dev/null || true)
if [ -z "${ANIM_OK}" ]; then ANIM_OK=0; fi
if [ -z "${ANIM_BLINK}" ]; then ANIM_BLINK=0; fi
echo "  ui_mic_active.webp refs: ${ANIM_OK}; mic-center-3b.mic-blink class refs: ${ANIM_BLINK}"
if [ "${ANIM_OK}" -ge 1 ] 2>/dev/null && [ "${ANIM_BLINK}" -ge 1 ] 2>/dev/null; then
    check_pass
else
    check_fail "animation classes/srcs missing — animation will break"
fi
echo ""

# [8/12] stage 3A has gained a mic interaction (was passive remote)
echo "[8/12] stage 3A has gained mic-clickable button"
# Find the stage-3a <main> block and check it contains mic-clickable
STAGE3A_HAS_MIC=$(awk '/<main[^>]*class="stage stage-3a"/,/<\/main>/' "${TARGET}" 2>/dev/null | grep -c 'mic-clickable' || true)
if [ -z "${STAGE3A_HAS_MIC}" ]; then STAGE3A_HAS_MIC=0; fi
echo "  mic-clickable inside stage-3a block: ${STAGE3A_HAS_MIC}"
if [ "${STAGE3A_HAS_MIC}" -ge 1 ] 2>/dev/null; then
    check_pass
else
    check_fail "stage 3A still has no mic-clickable interaction (was the whole point of this WO)"
fi
echo ""

# [9/12] aria-label preserved (uses dialogue.micButton.aria i18n key)
echo "[9/12] aria-label preserved on new buttons"
ARIA_COUNT=$(grep -cE ":aria-label=\"t\('dialogue.micButton.aria'\)\"" "${TARGET}" 2>/dev/null || true)
if [ -z "${ARIA_COUNT}" ]; then ARIA_COUNT=0; fi
echo "  aria-label refs: ${ARIA_COUNT}"
if [ "${ARIA_COUNT}" -ge 2 ] 2>/dev/null; then
    check_pass
else
    check_fail "expected ≥2 aria-label refs (one per stage), got ${ARIA_COUNT}"
fi
echo ""

# [10/12] :class with pressed binding present on new buttons
echo "[10/12] :class=\"{ pressed: micPressed }\" binding present"
CLASS_BIND_COUNT=$(grep -cE ':class="\{ pressed: micPressed \}"' "${TARGET}" 2>/dev/null || true)
if [ -z "${CLASS_BIND_COUNT}" ]; then CLASS_BIND_COUNT=0; fi
echo "  pressed-binding refs: ${CLASS_BIND_COUNT}"
if [ "${CLASS_BIND_COUNT}" -ge 2 ] 2>/dev/null; then
    check_pass
else
    check_fail "expected ≥2 pressed-binding refs, got ${CLASS_BIND_COUNT}"
fi
echo ""

# [11/12] tv-html npm run build passes
echo "[11/12] tv-html npm run build passes"
echo "  why: catches Vue compile errors that grep can't see (per LESSONS guideline K applied to Vue)"
cd "${TV_DIR}" || { check_fail "cannot cd into ${TV_DIR}"; exit 1; }
BUILD_OUT=$(npm run build 2>&1)
BUILD_RC=$?
if [ ${BUILD_RC} -eq 0 ]; then
    if echo "${BUILD_OUT}" | grep -qE 'error|ERROR' 2>/dev/null; then
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

# [12/12] only DialogueScreen.vue was modified (no spillover)
echo "[12/12] only tv-html/src/screens/DialogueScreen.vue is modified (no spillover)"
cd "${REPO_ROOT}" || { check_fail "cannot cd to repo root"; exit 1; }
MOD_FILES=$(git status -s 2>/dev/null | grep -E '^[ MARC][MARC]?\s' | awk '{print $2}' | grep -v '^coordination/' | grep -v '^workorders/' || true)
MOD_COUNT=$(echo -n "${MOD_FILES}" | grep -c '^' 2>/dev/null || true)
if [ -z "${MOD_COUNT}" ]; then MOD_COUNT=0; fi
echo "  modified non-coordination files: ${MOD_COUNT}"
echo "${MOD_FILES}" | sed 's/^/    /'
EXPECTED='tv-html/src/screens/DialogueScreen.vue'
if [ "${MOD_FILES}" = "${EXPECTED}" ]; then
    check_pass
else
    check_fail "expected exactly 'tv-html/src/screens/DialogueScreen.vue', got: ${MOD_FILES}"
fi
echo ""

# ---------- summary ----------
echo "============================================================"
echo "Summary: ${PASS}/${TOTAL} PASS, ${FAIL} FAIL"
echo "============================================================"
echo ""
if [ ${FAIL} -eq 0 ]; then
    echo -e "${GREEN}✅ All ${TOTAL} checks PASS${NC}"
    echo ""
    echo "Next steps for Kristy (manual):"
    echo "  1. ssh wonderbear-vps 'rsync -av --delete /opt/wonderbear/tv-html/dist/ /var/www/wonderbear-tv/'"
    echo "  2. Chrome Ctrl+Shift+R tv.bvtuber.com → DialogueScreen → tap mic image to test"
    echo "  3. Confirm: stage 3A clickable mic, stage 3B clickable animated mic, no right-bottom button anymore"
    echo "  4. If all good → git add + commit (use template in WO-3.10.md §8)"
    exit 0
else
    echo -e "${RED}❌ ${FAIL}/${TOTAL} checks FAIL — review above${NC}"
    exit 1
fi
