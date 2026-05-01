#!/usr/bin/env bash
set -u

REPO_ROOT="/opt/wonderbear"
TARGET_VUE="${REPO_ROOT}/tv-html/src/screens/DialogueScreen.vue"

echo "============================================================"
echo "WO-3.14 collect — gather evidence"
echo "============================================================"
echo ""

cd "${REPO_ROOT}" || exit 1

echo "=== git status ==="
git status -s tv-html/ 2>/dev/null
echo ""

echo "=== git diff --stat HEAD ==="
git diff --stat HEAD -- "${TARGET_VUE}" 2>/dev/null
echo ""

echo "=== stage 3B template (after change, no in-stage mic img) ==="
awk '/<main[^>]*class="stage stage-3b"/,/<\/main>/' "${TARGET_VUE}" 2>/dev/null | head -40
echo ""

echo "=== .mic-floating CSS (should show top: 80%) ==="
grep -nA 14 '^\.mic-floating' "${TARGET_VUE}" 2>/dev/null | head -20
echo ""

echo "=== .prev-reply-bubble (should still be 32px) ==="
awk '/^\.prev-reply-bubble\s*\{/{flag=1} flag{print; if (/^\}/) flag=0}' "${TARGET_VUE}" 2>/dev/null
echo ""

echo "=== absence checks ==="
echo "  mic-center-3b in stage-3b template:  $(awk '/<main[^>]*class="stage stage-3b"/,/<\/main>/' "${TARGET_VUE}" 2>/dev/null | grep -c 'mic-center-3b' || echo 0)"
echo "  .mic-center-3b CSS rule:             $(grep -cE '^\.mic-center-3b\s*\{' "${TARGET_VUE}" 2>/dev/null || echo 0)"
echo "  top: 65% in mic-floating:            $(grep -nA 8 '^\.mic-floating' "${TARGET_VUE}" 2>/dev/null | grep -cE 'top:\s*65%' || echo 0)"
echo ""

echo "=== presence checks ==="
echo "  top: 80% in mic-floating:            $(grep -nA 8 '^\.mic-floating' "${TARGET_VUE}" 2>/dev/null | grep -cE 'top:\s*80%' || echo 0)"
echo "  .mic-floating CSS rule:              $(grep -cE '^\.mic-floating\s*\{' "${TARGET_VUE}" 2>/dev/null || echo 0)"
echo "  .remote-floating CSS rule:           $(grep -cE '^\.remote-floating\s*\{' "${TARGET_VUE}" 2>/dev/null || echo 0)"
echo "  font-size: 32px in prev-reply-bubble: $(awk '/^\.prev-reply-bubble\s*\{/{flag=1} flag{print; if (/^\}/) flag=0}' "${TARGET_VUE}" 2>/dev/null | grep -c 'font-size: 32px' || echo 0)"
echo ""

echo "=== file size ==="
echo "  DialogueScreen.vue: $(wc -l < "${TARGET_VUE}" 2>/dev/null) lines"
echo ""

echo "============================================================"
echo "End of collect"
echo "============================================================"
