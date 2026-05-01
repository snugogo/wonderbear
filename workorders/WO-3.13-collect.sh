#!/usr/bin/env bash
# WO-3.13 collect.sh

set -u

REPO_ROOT="/opt/wonderbear"
TARGET_VUE="${REPO_ROOT}/tv-html/src/screens/DialogueScreen.vue"

echo "============================================================"
echo "WO-3.13 collect — gather Factory change evidence"
echo "============================================================"
echo ""

cd "${REPO_ROOT}" || exit 1

echo "=== git status (working tree, tv-html area) ==="
git status -s tv-html/ 2>/dev/null
echo ""

echo "=== git diff --stat HEAD on DialogueScreen.vue ==="
git diff --stat HEAD -- "${TARGET_VUE}" 2>/dev/null
echo ""

echo "=== new mic-floating template + CSS ==="
grep -nB 1 -A 12 'class="mic-floating"' "${TARGET_VUE}" 2>/dev/null | head -20
echo "  ---CSS---"
grep -nA 18 '^\.mic-floating\s*\{' "${TARGET_VUE}" 2>/dev/null | head -25
echo ""

echo "=== new remote-floating ==="
grep -nB 1 -A 5 'class="remote-floating"' "${TARGET_VUE}" 2>/dev/null | head -10
echo "  ---CSS---"
grep -nA 8 '^\.remote-floating\s*\{' "${TARGET_VUE}" 2>/dev/null | head -12
echo ""

echo "=== prev-reply-bubble new CSS ==="
grep -nA 22 '^\.prev-reply-bubble\s*\{' "${TARGET_VUE}" 2>/dev/null | head -28
echo ""

echo "=== absence checks (should all be 0) ==="
echo "  mic-center-3a refs:    $(grep -c 'mic-center-3a' "${TARGET_VUE}" 2>/dev/null || echo 0)"
echo "  mic-clickable refs:    $(grep -c 'mic-clickable' "${TARGET_VUE}" 2>/dev/null || echo 0)"
echo "  col-remote-3a refs:    $(grep -c 'col-remote-3a' "${TARGET_VUE}" 2>/dev/null || echo 0)"
echo "  remote-3a CSS rule:    $(grep -cE '^\.remote-3a\s*\{' "${TARGET_VUE}" 2>/dev/null || echo 0)"
echo "  .mic-button CSS:       $(grep -cE '^\s*\.mic-button[\s\.,:{]' "${TARGET_VUE}" 2>/dev/null || echo 0)"
echo ""

echo "=== presence checks (should each be ≥1) ==="
echo "  mic-floating refs:           $(grep -c 'mic-floating' "${TARGET_VUE}" 2>/dev/null || echo 0)"
echo "  remote-floating refs:        $(grep -c 'remote-floating' "${TARGET_VUE}" 2>/dev/null || echo 0)"
echo "  font-size: 32px refs:        $(grep -c 'font-size: 32px' "${TARGET_VUE}" 2>/dev/null || echo 0)"
echo "  v-if uiState 3A or 3B refs:  $(grep -cE 'v-if=\"uiState === .3A. \|\|' "${TARGET_VUE}" 2>/dev/null || echo 0)"
echo "  currentQuestion?.text refs:  $(grep -cE 'currentQuestion\?\.text' "${TARGET_VUE}" 2>/dev/null || echo 0)"
echo ""

echo "=== file sizes ==="
echo "  DialogueScreen.vue: $(wc -l < "${TARGET_VUE}" 2>/dev/null) lines"
echo ""

echo "============================================================"
echo "End of collect"
echo "============================================================"
