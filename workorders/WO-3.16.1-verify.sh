#!/bin/bash
# WO-3.16.1 verify script
# 基于 /opt/wonderbear/workorders/verify-template.sh
# 继承 3 条假 FAIL 排除规则

set -uo pipefail

REPO=/opt/wonderbear
TV=$REPO/tv-html

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

PASS=0
FAIL=0
TOTAL=7

check() {
  local idx=$1
  local desc=$2
  local result=$3
  echo
  echo "[$idx/$TOTAL] $desc"
  if [ "$result" = "PASS" ]; then
    echo -e "${GREEN}✅ PASS${NC}"
    PASS=$((PASS + 1))
  else
    echo -e "${RED}❌ FAIL${NC} — $4"
    FAIL=$((FAIL + 1))
  fi
}

cd "$TV" || { echo "❌ tv-html 目录不存在"; exit 2; }

GBB=src/components/GlobalBackButton.vue

if [ ! -f "$GBB" ]; then
  echo "❌ FATAL: $GBB 不存在 — WO-3.16 主体改动可能丢失"
  exit 2
fi

echo "========================================="
echo "WO-3.16.1 verify (7 checks)"
echo "========================================="

# [1/7] position: absolute (非 fixed)
HAS_ABS=$(grep -c "position:\s*absolute" "$GBB" || true)
HAS_FIXED=$(grep -c "position:\s*fixed" "$GBB" || true)
if [ "$HAS_ABS" -ge 1 ] && [ "$HAS_FIXED" = "0" ]; then
  check 1 "GlobalBackButton: position 改为 absolute" PASS
else
  check 1 "GlobalBackButton: position 改为 absolute" FAIL "abs=$HAS_ABS / fixed=$HAS_FIXED"
fi

# [2/7] 透明度 50% 左右(允许 0.5 / 0.50 / 0.55)
HAS_50=$(grep -cE "rgba\(0,\s*0,\s*0,\s*0\.5[05]?\)" "$GBB" || true)
if [ "$HAS_50" -ge 1 ]; then
  check 2 "GlobalBackButton: 透明度提升到 ~50%" PASS
else
  check 2 "GlobalBackButton: 透明度提升到 ~50%" FAIL "未找到 rgba(0,0,0,0.50) 类透明度"
fi

# [3/7] 尺寸仍是 36px(不允许被改大)
WIDTH_36=$(grep -cE "width:\s*36px" "$GBB" || true)
HEIGHT_36=$(grep -cE "height:\s*36px" "$GBB" || true)
if [ "$WIDTH_36" -ge 1 ] && [ "$HEIGHT_36" -ge 1 ]; then
  check 3 "GlobalBackButton: 尺寸仍是 36×36" PASS
else
  check 3 "GlobalBackButton: 尺寸仍是 36×36" FAIL "width=$WIDTH_36 / height=$HEIGHT_36 — 不允许改尺寸"
fi

# [4/7] SVG viewBox 不变
HAS_VIEWBOX=$(grep -cE 'viewBox="0 0 24 24"' "$GBB" || true)
if [ "$HAS_VIEWBOX" -ge 1 ]; then
  check 4 "GlobalBackButton: SVG viewBox 不变" PASS
else
  check 4 "GlobalBackButton: SVG viewBox 不变" FAIL "viewBox 被改了或丢失"
fi

# [5/7] App.vue .tv-stage 块有 position 属性
TVSTAGE_BLOCK=$(awk '/\.tv-stage\s*\{/,/^}/' src/App.vue 2>/dev/null)
HAS_POS=$(echo "$TVSTAGE_BLOCK" | grep -cE "position:\s*(relative|absolute|fixed|sticky)" || true)
if [ "$HAS_POS" -ge 1 ]; then
  check 5 "App.vue .tv-stage 有 position 属性(absolute 锚点生效)" PASS
else
  check 5 "App.vue .tv-stage 有 position 属性" FAIL "未找到 position: relative/absolute/fixed/sticky"
fi

# [6/7] spillover 检查 — DialogueScreen / api.ts / 其他屏幕不应被改
SPILLOVER=0
for f in src/screens/DialogueScreen.vue src/services/api.ts; do
  if [ -f "$f" ]; then
    # 检查 git diff 是否有 WO-3.16.1 的痕迹
    if git diff "$f" 2>/dev/null | grep -qE "WO-3\.16\.1"; then
      SPILLOVER=$((SPILLOVER + 1))
    fi
  fi
done
# 检查是否有其他屏幕被改(WO-3.16.1 不该动屏幕)
SCREEN_DIFF=$(git diff --name-only -- "src/screens/" 2>/dev/null | grep -v "DialogueScreen" | grep -v "^$" | wc -l || echo 0)
if [ "$SPILLOVER" = "0" ] && [ "$SCREEN_DIFF" = "0" ]; then
  check 6 "Spillover: 不动 DialogueScreen / api.ts / 其他屏幕" PASS
else
  check 6 "Spillover: 不动 DialogueScreen / api.ts / 其他屏幕" FAIL "WO-3.16.1 spill=$SPILLOVER / 其他屏幕改动=$SCREEN_DIFF"
fi

# [7/7] 必须保留 WO-3.16 主体改动(不能误删)
HAS_DIALOGUE_DIFF=0
if git diff --quiet HEAD -- src/screens/DialogueScreen.vue 2>/dev/null; then
  HAS_DIALOGUE_DIFF=0
else
  HAS_DIALOGUE_DIFF=1
fi
if [ -f "$GBB" ] && [ "$HAS_DIALOGUE_DIFF" = "1" ]; then
  check 7 "WO-3.16 主体改动保留(GlobalBackButton 存在 + DialogueScreen 仍有改动)" PASS
else
  check 7 "WO-3.16 主体改动保留" FAIL "GlobalBackButton 或 DialogueScreen 改动丢失!"
fi

echo
echo "========================================="
echo "Summary: $PASS/$TOTAL PASS, $FAIL FAIL"
echo "========================================="

if [ "$FAIL" = "0" ]; then
  echo -e "${GREEN}✅ ALL PASS${NC}"
  exit 0
else
  echo -e "${RED}❌ $FAIL/$TOTAL FAIL${NC}"
  exit 1
fi
