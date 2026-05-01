#!/usr/bin/env bash
# WO-3.11 collect.sh — collect Factory change evidence

set -u

REPO_ROOT="/opt/wonderbear"
TARGET_VUE="${REPO_ROOT}/tv-html/src/screens/DialogueScreen.vue"
TARGET_STORE="${REPO_ROOT}/tv-html/src/stores/dialogue.ts"

echo "============================================================"
echo "WO-3.11 collect — gather evidence for Factory report"
echo "============================================================"
echo ""

cd "${REPO_ROOT}" || exit 1

echo "=== git status (working tree) ==="
git status -s tv-html/ 2>/dev/null
echo ""

echo "=== git diff --stat HEAD on both targets ==="
git diff --stat HEAD -- "${TARGET_VUE}" "${TARGET_STORE}" 2>/dev/null
echo ""

echo "=== stage 3A new structure ==="
awk '/<main[^>]*class="stage stage-3a"/,/<\/main>/' "${TARGET_VUE}" 2>/dev/null | head -50
echo ""

echo "=== prev-reply-bubble new template (around currentQuestion) ==="
grep -nB 2 -A 8 'currentQuestion' "${TARGET_VUE}" 2>/dev/null | head -30
echo ""

echo "=== mic-center-3a CSS rule ==="
grep -nA 10 '^\.mic-center-3a' "${TARGET_VUE}" 2>/dev/null | head -25
echo ""

echo "=== absence checks ==="
echo "  lastBearReply in DialogueScreen.vue: $(grep -c 'lastBearReply' "${TARGET_VUE}" 2>/dev/null || echo 0)"
echo "  lastBearReply in stores/dialogue.ts:  $(grep -c 'lastBearReply' "${TARGET_STORE}" 2>/dev/null || echo 0)"
echo "  old .mic-button CSS rules:             $(grep -cE '^\s*\.mic-button[\s\.,:{]' "${TARGET_VUE}" 2>/dev/null || echo 0)"
echo "  old class='mic-button' template:        $(grep -cE 'class=\"mic-button\"' "${TARGET_VUE}" 2>/dev/null || echo 0)"
echo ""

echo "=== presence checks ==="
echo "  mic-center-3a refs (template + CSS):   $(grep -c 'mic-center-3a' "${TARGET_VUE}" 2>/dev/null || echo 0)"
echo "  ui_remote.webp refs (3A right col):    $(grep -c 'ui_remote.webp' "${TARGET_VUE}" 2>/dev/null || echo 0)"
echo "  currentQuestion?.text refs:            $(grep -cE 'currentQuestion\?\.text' "${TARGET_VUE}" 2>/dev/null || echo 0)"
echo ""

echo "=== handler counts (should each be ≥2: 3A + 3B mic buttons) ==="
for HANDLER in '@mousedown' '@mouseup' '@mouseleave' '@touchstart' '@touchend' '@touchcancel'; do
    COUNT=$(grep -cE "${HANDLER}" "${TARGET_VUE}" 2>/dev/null || echo 0)
    echo "  ${HANDLER}: ${COUNT}"
done
echo ""

echo "=== file sizes ==="
echo "  DialogueScreen.vue: $(wc -l < "${TARGET_VUE}" 2>/dev/null) lines"
echo "  dialogue.ts:        $(wc -l < "${TARGET_STORE}" 2>/dev/null) lines"
echo ""

echo "============================================================"
echo "End of collect"
echo "============================================================"
