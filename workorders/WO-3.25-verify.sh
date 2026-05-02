#!/usr/bin/env bash
# WO-3.25 verify.sh — Scrollbar 全局兜底验证
# memory #20 假 FAIL 模式 v2 全 7 条

set +e
cd /opt/wonderbear || { echo "FAIL: 不在 /opt/wonderbear"; exit 1; }

PASS=0; FAIL=0; WARN=0
G='\033[0;32m'; R='\033[0;31m'; Y='\033[0;33m'; N='\033[0m'
pass() { echo -e "${G}✅ PASS${N}: $1"; PASS=$((PASS+1)); }
fail() { echo -e "${R}❌ FAIL${N}: $1"; FAIL=$((FAIL+1)); }
warn() { echo -e "${Y}⚠️  WARN${N}: $1"; WARN=$((WARN+1)); }

GLOBAL_CSS="tv-html/src/styles/global.css"
echo "═══ WO-3.25 verify ═══"

if [ ! -f "$GLOBAL_CSS" ]; then
  fail "global.css 不存在"; exit 1
fi

# 1. scrollbar-width !important
HIT=$(grep -E 'scrollbar-width\s*:\s*none\s*!important' "$GLOBAL_CSS" 2>/dev/null \
  | grep -v '^\s*/\*\|^\s*\*\|^\s*//\|^\s*<!--' | wc -l)
[ "$HIT" -ge 1 ] && pass "scrollbar-width: none !important ($HIT 处)" \
  || fail "缺 scrollbar-width: none !important"

# 2. ::-webkit-scrollbar
HIT=$(grep -E '::-webkit-scrollbar' "$GLOBAL_CSS" 2>/dev/null \
  | grep -v '^\s*/\*\|^\s*\*\|^\s*//\|^\s*<!--' | wc -l)
[ "$HIT" -ge 1 ] && pass "::-webkit-scrollbar 选择器 ($HIT 处)" \
  || fail "缺 ::-webkit-scrollbar"

# 3. -ms-overflow-style !important
HIT=$(grep -E '\-ms-overflow-style\s*:\s*none\s*!important' "$GLOBAL_CSS" 2>/dev/null \
  | grep -v '^\s*/\*\|^\s*\*\|^\s*//\|^\s*<!--' | wc -l)
[ "$HIT" -ge 1 ] && pass "-ms-overflow-style: none !important ($HIT 处)" \
  || fail "缺 -ms-overflow-style: none !important"

# 4. 不能 * { overflow: hidden }
BAD=$(awk '/^\s*\*\s*\{/,/^\s*\}/' "$GLOBAL_CSS" 2>/dev/null \
  | grep -E 'overflow\s*:\s*hidden' | wc -l)
[ "$BAD" -eq 0 ] && pass "未在 * 上加 overflow: hidden" \
  || fail "* selector 含 overflow: hidden 会破坏滚动"

# 5. Spillover
CHANGED=$(git diff --name-only HEAD 2>/dev/null)
[ -z "$CHANGED" ] && CHANGED=$(git diff --name-only origin/main...HEAD 2>/dev/null)
if [ -z "$CHANGED" ]; then
  warn "git diff 空,跳过 spillover"
else
  SPILL=$(echo "$CHANGED" \
    | grep -v '^tv-html/src/styles/global.css$' \
    | grep -v '^tv-html/src/screens/.*\.vue$' \
    | grep -v '^coordination/done/WO-3.25' \
    | grep -v '^coordination/workorders/WO-3.25' \
    | grep -v '^$' | wc -l)
  [ "$SPILL" -eq 0 ] && pass "无 spillover" \
    || { fail "$SPILL spillover"; echo "$CHANGED" | head -10; }
fi

# 6. Build
if [ -f tv-html/package.json ]; then
  cd tv-html
  BUILD=$(npm run build 2>&1 | tail -30)
  cd ..
  ERR=$(echo "$BUILD" | grep -iE 'error|failed' | grep -vi 'no error|0 errors' | wc -l)
  [ "$ERR" -eq 0 ] && pass "tv-html build OK" \
    || { fail "build 报 $ERR error"; echo "$BUILD" | grep -iE 'error|failed' | head -3; }
fi

# 7. dist 包含
DIST=$(grep -ho 'scrollbar-width:none.*!important\|scrollbar-width: none\s*!important' \
  tv-html/dist/assets/*.css 2>/dev/null | wc -l)
[ "$DIST" -ge 1 ] && pass "dist css 含 scrollbar-width:none !important ($DIST)" \
  || fail "dist css 不含 — global.css 没编译进去"

# 8. No backup
BAK=$(find tv-html/src \( -name '*.backup*' -o -name '*.bak' -o -name '*.bak.*' \) 2>/dev/null | wc -l)
[ "$BAK" -eq 0 ] && pass "无 backup 残留" \
  || { fail "$BAK backup"; find tv-html/src \( -name '*.backup*' -o -name '*.bak' \) 2>/dev/null | head -3; }

echo
echo "═══ 总计: ${PASS} PASS, ${FAIL} FAIL, ${WARN} WARN ═══"
[ "$FAIL" -gt 0 ] && exit 1 || exit 0
