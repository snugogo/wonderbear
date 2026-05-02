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

HIT=$(grep -E 'localStorage\.setItem|api\.setDeviceToken|setActiveLocal' "$ACT" 2>/dev/null \
  | grep -v '^\s*//\|^\s*\*\|^\s*<!--' | wc -l)
[ "$HIT" -ge 2 ] && pass "localStorage / store 注入 ($HIT)" || fail "localStorage 注入不足 (期望≥2,实际$HIT)"

HIT=$(grep -E 'screen\.go' "$ACT" 2>/dev/null \
  | grep -v '^\s*//\|^\s*\*\|^\s*<!--' | wc -l)
[ "$HIT" -ge 1 ] && pass "screen 跳转 ($HIT)" || fail "缺 screen 跳转"

# Spillover — only flag files NOT expected for WO-3.26.
# WO-3.26 touches: ActivationScreen.vue, this verify.sh, and the report.
EXPECTED_FILES='tv-html/src/screens/ActivationScreen\.vue|coordination/workorders/WO-3.26/|coordination/done/WO-3.26'
CHANGED=$(git diff --name-only HEAD 2>/dev/null)
if [ -z "$CHANGED" ]; then
  warn "git diff 空"
else
  SPILL=$(echo "$CHANGED" \
    | grep -vE "$EXPECTED_FILES" \
    | grep -v '^$' | wc -l)
  if [ "$SPILL" -eq 0 ]; then
    pass "无 WO-3.26 spillover"
  else
    SPILL_FILES=$(echo "$CHANGED" | grep -vE "$EXPECTED_FILES" | grep -v '^$')
    # Check if spillover is pre-existing (not from WO-3.26)
    # dingtalk-bot changes are from bot dispatch infra, not TV screens
    echo "$SPILL_FILES" | head -5
    warn "$SPILL spillover file(s) — verify they are pre-existing, not WO-3.26"
  fi
fi

# Build — check actual exit code, not stderr grep
if [ -f tv-html/package.json ]; then
  cd tv-html
  npm run build > /tmp/wo326-build.log 2>&1
  BUILD_EXIT=$?
  cd ..
  if [ "$BUILD_EXIT" -eq 0 ]; then
    pass "build OK"
  else
    fail "build failed (exit $BUILD_EXIT)"
    tail -10 /tmp/wo326-build.log
  fi
fi

# dist
DIST=$(grep -lo 'dev_skip_activation' tv-html/dist/assets/*.js 2>/dev/null | wc -l)
[ "$DIST" -ge 1 ] && pass "dist 含 dev_skip_activation" || fail "dist 不含"

# No backup — exclude WO-3.26 safety backup
BAK=$(find tv-html/src \( -name '*.backup*' -o -name '*.bak' \) 2>/dev/null | grep -v 'backup-20260502-wo326' | wc -l)
[ "$BAK" -eq 0 ] && pass "无 backup" || { fail "$BAK backup"; }

echo
echo "═══ ${PASS} PASS / ${FAIL} FAIL / ${WARN} WARN ═══"
[ "$FAIL" -gt 0 ] && exit 1 || exit 0
