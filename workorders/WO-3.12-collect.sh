#!/usr/bin/env bash
set -u

REPO_ROOT="/opt/wonderbear"
TV_DIR="${REPO_ROOT}/tv-html"
COVER="${TV_DIR}/src/screens/StoryCoverScreen.vue"
GEN="${TV_DIR}/src/screens/GeneratingScreen.vue"
STORY_ROUTE="${REPO_ROOT}/server-v7/src/routes/story.js"

echo "============================================================"
echo "WO-3.12 collect"
echo "============================================================"

cd "${REPO_ROOT}" || exit 1

echo ""
echo "=== git status ==="
git status -s 2>/dev/null | head -20

echo ""
echo "=== git diff --stat HEAD ==="
git diff --stat HEAD 2>/dev/null

echo ""
echo "=== GeneratingScreen.vue: screen.go to story-cover ==="
grep -nB 1 -A 2 "screen\.go.*story-cover" "${GEN}" 2>/dev/null

echo ""
echo "=== StoryCoverScreen.vue firstTime declaration ==="
grep -nE 'firstTime' "${COVER}" 2>/dev/null | head -15

echo ""
echo "=== StoryCoverScreen.vue ceremony block ==="
grep -nB 1 -A 8 'class="ceremony"' "${COVER}" 2>/dev/null | head -20

echo ""
echo "=== StoryCoverScreen.vue createdBy ==="
grep -nE "createdBy|story\.createdBy" "${COVER}" 2>/dev/null | head -10

echo ""
echo "=== i18n createdBy keys ==="
for f in "${TV_DIR}/src/i18n/locales/zh.ts" "${TV_DIR}/src/i18n/locales/en.ts" "${TV_DIR}/src/i18n/locales/pl.ts" "${TV_DIR}/src/i18n/locales/ro.ts"; do
    if [ -f "${f}" ]; then
        echo "  ${f##*/}: $(grep -nE 'createdBy:' "${f}" 2>/dev/null | head -1)"
    fi
done

echo ""
echo "=== server-v7 story.js include ==="
grep -nB 1 -A 4 'include:' "${STORY_ROUTE}" 2>/dev/null | head -25

echo ""
echo "=== invariants ==="
DIALOGUE="${TV_DIR}/src/screens/DialogueScreen.vue"
echo "  .mic-floating defined:                $(grep -cE '^\.mic-floating\s*\{' "${DIALOGUE}" 2>/dev/null || echo 0)"
echo "  mic-floating top 80%:                 $(awk '/^\.mic-floating\s*\{/{flag=1} flag{print; if (/^\}/) flag=0}' "${DIALOGUE}" 2>/dev/null | grep -c 'top: 80%' || echo 0)"
echo "  prev-reply-bubble 32px:               $(awk '/^\.prev-reply-bubble\s*\{/{flag=1} flag{print; if (/^\}/) flag=0}' "${DIALOGUE}" 2>/dev/null | grep -c 'font-size: 32px' || echo 0)"
echo "  Luna in tv-html src (excl dev):       $(grep -rn 'Luna' "${TV_DIR}/src" --include='*.ts' --include='*.vue' --include='*.json' 2>/dev/null | grep -v '/dev/' | grep -v '\.backup' | wc -l | tr -d ' ')"

echo ""
echo "=== file sizes ==="
echo "  StoryCoverScreen.vue: $(wc -l < "${COVER}" 2>/dev/null) lines"
echo "  GeneratingScreen.vue: $(wc -l < "${GEN}" 2>/dev/null) lines"
echo "  story.js (server):    $(wc -l < "${STORY_ROUTE}" 2>/dev/null) lines"

echo ""
echo "============================================================"
echo "End of collect"
echo "============================================================"
