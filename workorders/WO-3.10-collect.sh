#!/usr/bin/env bash
# WO-3.10 collect.sh — 收集 Factory 改动证据,生成报告时使用

set -u

REPO_ROOT="/opt/wonderbear"
TARGET="${REPO_ROOT}/tv-html/src/screens/DialogueScreen.vue"

echo "============================================================"
echo "WO-3.10 collect — gather evidence for Factory report"
echo "============================================================"
echo ""

cd "${REPO_ROOT}" || exit 1

echo "=== git status (target file area only) ==="
git status -s tv-html/ 2>/dev/null
echo ""

echo "=== git diff --stat HEAD on target ==="
git diff --stat HEAD -- "${TARGET}" 2>/dev/null
echo ""

echo "=== template: where mic-clickable lives ==="
grep -n 'mic-clickable' "${TARGET}" 2>/dev/null | head -20
echo ""

echo "=== template: stage-3a block (first 30 lines after the <main>) ==="
awk '/<main[^>]*class="stage stage-3a"/{flag=1; n=0} flag && n<30 {print; n++}' "${TARGET}" 2>/dev/null
echo ""

echo "=== template: stage-3b mic area (search context around mic-center-3b) ==="
grep -nB 2 -A 10 'mic-center-3b' "${TARGET}" 2>/dev/null | head -40
echo ""

echo "=== CSS: new .mic-clickable rule ==="
grep -nA 15 '^\.mic-clickable' "${TARGET}" 2>/dev/null | head -25
echo ""

echo "=== absence checks ==="
echo "  .mic-button (CSS) refs:    $(grep -cE '^\s*\.mic-button[\s\.,:{]' "${TARGET}" 2>/dev/null || echo 0)"
echo "  class=\"mic-button\" refs:   $(grep -cE 'class="mic-button"' "${TARGET}" 2>/dev/null || echo 0)"
echo ""

echo "=== handler counts ==="
for HANDLER in '@mousedown' '@mouseup' '@mouseleave' '@touchstart' '@touchend' '@touchcancel'; do
    COUNT=$(grep -cE "${HANDLER}" "${TARGET}" 2>/dev/null || echo 0)
    echo "  ${HANDLER}: ${COUNT}"
done
echo ""

echo "=== file size before/after ==="
LINES=$(wc -l < "${TARGET}" 2>/dev/null)
echo "  current line count: ${LINES}"
echo ""

echo "============================================================"
echo "End of collect"
echo "============================================================"
