#!/usr/bin/env bash
# WO-3.26 verify.sh — Dev/QA Fast-Path

set +e
cd /opt/wonderbear || exit 1

PASS=0; FAIL=0; WARN=0
G='\033[0;32m'; R='\033[0;31m'; Y='\033[0;33m'; N='\033[0m'
pass() { echo -e "${G}✅${N}: $1"; PASS=$((PASS+1)); }
fail() { echo -e "${R}❌${N}: $1"; FAIL=$((FAIL+1)); }
warn() { echo -e "${Y}⚠️${N}: $1"; WARN=$((WARN+1)); }

ACT="tv-html/src/screens/ActivationScreen.vue"
echo "═══ WO-3.26 verify ═══"
[ ! -f "$ACT" ] && { fail "$ACT 不存在"; exit 1; }

GR='grep -v ^\s*//\|^\s*\*\|^\s*<!--'

HIT=$(grep -E 'dev_skip_activation' "$ACT" 2>/dev/null \
  | grep -v '^\s*//\|^\s*\*\|^\s*<!--' | wc -l)
[ "$HIT" -ge 1 ] && pass "dev_skip_activation 入口 ($HIT)" || fail "缺 dev_skip_activation"

HIT=$(grep -E 'wb_dev_marker' "$ACT" 2>/dev/null \
  | grep -v '^\s*//\|^\s*\*\|^\s*<!--' | wc -l)
[ "$HIT" -ge 1 ] && pass "wb_dev_marker cookie 防护 ($HIT)" || fail "缺 wb_dev_marker 防护"

HIT=$(grep -E 'localStorage\.setItem' "$ACT" 2>/dev/null \
  | grep -v '^\s*//\|^\s*\*\|^\s*<!--' | wc -l)
[ "$HIT" -ge 2 ] && pass "localStorage 注入 ($HIT)" || fail "localStorage 注入不足 (期望≥2,实际$HIT)"

HIT=$(grep -E 'router\.(replace|push)' "$ACT" 2>/dev/null \
  | grep -v '^\s*//\|^\s*\*\|^\s*<!--' | wc -l)
[ "$HIT" -ge 1 ] && pass "router 跳转 ($HIT)" || fail "缺 router 跳转"

# Spillover
CHANGED=$(git diff --name-only HEAD 2>/dev/null)
[ -z "$CHANGED" ] && CHANGED=$(git diff --name-only origin/main...HEAD 2>/dev/null)
if [ -z "$CHANGED" ]; then
  warn "git diff 空"
else
  SPILL=$(echo "$CHANGED" \
    | grep -v '^tv-html/src/screens/ActivationScreen\.vue$' \
    | grep -v '^tv-html/src/composables/' \
    | grep -v '^coordination/done/WO-3.26' \
    | grep -v '^coordination/workorders/WO-3.26' \
    | grep -v '^$' | wc -l)
  [ "$SPILL" -eq 0 ] && pass "无 spillover" || { fail "$SPILL spillover"; echo "$CHANGED" | head -5; }
fi

# Build
if [ -f tv-html/package.json ]; then
  cd tv-html
  BUILD=$(npm run build 2>&1 | tail -30)
  cd ..
  ERR=$(echo "$BUILD" | grep -iE 'error|failed' | grep -vi 'no error|0 errors' | wc -l)
  [ "$ERR" -eq 0 ] && pass "build OK" || { fail "build $ERR error"; echo "$BUILD" | grep -iE 'error|failed' | head -3; }
fi

# dist
DIST=$(grep -lo 'dev_skip_activation' tv-html/dist/assets/*.js 2>/dev/null | wc -l)
[ "$DIST" -ge 1 ] && pass "dist 含 dev_skip_activation" || fail "dist 不含"

# No backup
BAK=$(find tv-html/src \( -name '*.backup*' -o -name '*.bak' \) 2>/dev/null | wc -l)
[ "$BAK" -eq 0 ] && pass "无 backup" || { fail "$BAK backup"; }

echo
echo "═══ ${PASS} PASS / ${FAIL} FAIL / ${WARN} WARN ═══"
[ "$FAIL" -gt 0 ] && exit 1 || exit 0
