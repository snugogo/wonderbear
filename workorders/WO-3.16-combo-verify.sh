#!/bin/bash
# WO-3.16-combo verify script
# 基于 /opt/wonderbear/workorders/verify-template.sh 的标准模板
# 继承 3 条假 FAIL 排除规则:
#   - --exclude='*.backup*' --exclude='*.bak' (backup 文件)
#   - spillover whitelist (本工单禁用 spillover)
#   - cross-WO invariant 显式 scope

set -uo pipefail

REPO=/opt/wonderbear
TV=$REPO/tv-html

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0
TOTAL=15

# 标准 grep 排除规则(基于 WO-3.15 verify-template.sh)
GREP_EXCLUDES="--exclude=*.backup* --exclude=*.bak --exclude-dir=node_modules --exclude-dir=dist"

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

echo "========================================="
echo "WO-3.16-combo verify (15 checks)"
echo "========================================="

# ========== Part A: 录音键全状态响应 ==========

# [1/15] DialogueScreen.vue 中 onVoiceKeyDown 不再直接 phase 守卫 return
# (旧代码:if (dialogue.phase !== 'waiting-for-child') return;)
RESULT=$(grep -E "phase\s*!==\s*['\"]waiting-for-child['\"]" src/screens/DialogueScreen.vue 2>/dev/null | grep -v "//" || true)
if [ -z "$RESULT" ] || [ "$(echo "$RESULT" | wc -l)" -le 1 ]; then
  check 1 "Part A: onVoiceKeyDown 移除单 phase 守卫" PASS
else
  echo "Found refs:"
  echo "$RESULT"
  check 1 "Part A: onVoiceKeyDown 移除单 phase 守卫" FAIL "可能仍有旧的 phase !== 'waiting-for-child' 早期 return"
fi

# [2/15] DialogueScreen.vue 中存在 switch (dialogue.phase) 状态机分支
RESULT=$(grep -cE "switch\s*\(.*dialogue\.phase|switch\s*\(.*phase\)" src/screens/DialogueScreen.vue 2>/dev/null || true)
if [ "$RESULT" -ge 1 ]; then
  check 2 "Part A: 引入 phase switch 多分支" PASS
else
  check 2 "Part A: 引入 phase switch 多分支" FAIL "未发现 switch (dialogue.phase) / switch (phase),Part A 可能未实现"
fi

# [3/15] DialogueScreen.vue 中 bear-speaking 路径调用 stopTts
RESULT=$(grep -B2 -A6 "bear-speaking" src/screens/DialogueScreen.vue 2>/dev/null | grep -c "stopTts" || true)
if [ "$RESULT" -ge 1 ]; then
  check 3 "Part A: bear-speaking 时停 TTS" PASS
else
  check 3 "Part A: bear-speaking 时停 TTS" FAIL "bear-speaking 分支未调用 bridge.stopTts()"
fi

# [4/15] AbortController 引入(用于 cancel uploading/bear-thinking)
RESULT=$(grep -c "AbortController" src/screens/DialogueScreen.vue 2>/dev/null || true)
if [ "$RESULT" -ge 2 ]; then
  check 4 "Part A: AbortController 引入" PASS
else
  check 4 "Part A: AbortController 引入" FAIL "未发现 AbortController 用法 (期望 ≥2 次出现:声明 + 实例化)"
fi

# ========== Part B: 200ms 长按去抖 ==========

# [5/15] 200ms 去抖常量定义
RESULT=$(grep -cE "200|PRESS_DOWN_DEBOUNCE" src/screens/DialogueScreen.vue 2>/dev/null || true)
if [ "$RESULT" -ge 1 ]; then
  check 5 "Part B: 200ms 去抖常量存在" PASS
else
  check 5 "Part B: 200ms 去抖常量存在" FAIL "未发现 200(ms) 去抖时长定义"
fi

# [6/15] pressDownTimer 状态变量
RESULT=$(grep -c "pressDownTimer" src/screens/DialogueScreen.vue 2>/dev/null || true)
if [ "$RESULT" -ge 3 ]; then
  check 6 "Part B: pressDownTimer 状态变量(声明 + 启动 + 清理)" PASS
else
  check 6 "Part B: pressDownTimer 状态变量" FAIL "pressDownTimer 引用次数不足($RESULT,期望 ≥3)"
fi

# [7/15] onVoiceKeyUp 中清掉计时器
RESULT=$(grep -A 15 "function onVoiceKeyUp\|onVoiceKeyUp\s*=" src/screens/DialogueScreen.vue 2>/dev/null | grep -cE "clearTimeout.*pressDown|pressDown.*clearTimeout" || true)
if [ "$RESULT" -ge 1 ]; then
  check 7 "Part B: onVoiceKeyUp 清理计时器(短按检测)" PASS
else
  check 7 "Part B: onVoiceKeyUp 清理计时器" FAIL "onVoiceKeyUp 未发现 clearTimeout(pressDownTimer)"
fi

# [8/15] onBeforeUnmount 中清理计时器(防内存泄漏)
RESULT=$(grep -A 30 "onBeforeUnmount" src/screens/DialogueScreen.vue 2>/dev/null | grep -cE "pressDownTimer" || true)
if [ "$RESULT" -ge 1 ]; then
  check 8 "Part B: onBeforeUnmount 清理计时器" PASS
else
  check 8 "Part B: onBeforeUnmount 清理计时器" FAIL "组件销毁时未清理 pressDownTimer,有内存泄漏风险"
fi

# ========== Part C: GlobalBackButton 组件 ==========

# [9/15] GlobalBackButton.vue 文件存在
if [ -f src/components/GlobalBackButton.vue ]; then
  check 9 "Part C: GlobalBackButton.vue 文件已创建" PASS
else
  check 9 "Part C: GlobalBackButton.vue 文件已创建" FAIL "src/components/GlobalBackButton.vue 不存在"
fi

# [10/15] GlobalBackButton 含 SVG path(不是 emoji)
if [ -f src/components/GlobalBackButton.vue ]; then
  HAS_SVG=$(grep -c "<svg\|<path" src/components/GlobalBackButton.vue 2>/dev/null || true)
  HAS_EMOJI=$(grep -cE "←|⬅|◀|🔙|⏎" src/components/GlobalBackButton.vue 2>/dev/null || true)
  if [ "$HAS_SVG" -ge 2 ] && [ "$HAS_EMOJI" = "0" ]; then
    check 10 "Part C: SVG 矢量箭头(无 emoji)" PASS
  else
    check 10 "Part C: SVG 矢量箭头(无 emoji)" FAIL "svg=$HAS_SVG / emoji=$HAS_EMOJI"
  fi
else
  check 10 "Part C: SVG 矢量箭头(无 emoji)" FAIL "组件文件不存在,无法检查"
fi

# [11/15] GlobalBackButton 不引入 useFocusable(显式不集成焦点系统)
if [ -f src/components/GlobalBackButton.vue ]; then
  RESULT=$(grep -cE "useFocusable|setFocus" src/components/GlobalBackButton.vue 2>/dev/null || true)
  if [ "$RESULT" = "0" ]; then
    check 11 "Part C: 不集成 useFocusable(遥控器不可达)" PASS
  else
    check 11 "Part C: 不集成 useFocusable" FAIL "意外引入了焦点系统"
  fi
else
  check 11 "Part C: 不集成 useFocusable" FAIL "组件文件不存在"
fi

# [12/15] GlobalBackButton 同时支持 click + touchstart
if [ -f src/components/GlobalBackButton.vue ]; then
  HAS_CLICK=$(grep -c "@click" src/components/GlobalBackButton.vue 2>/dev/null || true)
  HAS_TOUCH=$(grep -c "@touchstart" src/components/GlobalBackButton.vue 2>/dev/null || true)
  if [ "$HAS_CLICK" -ge 1 ] && [ "$HAS_TOUCH" -ge 1 ]; then
    check 12 "Part C: 同时支持 click + touchstart" PASS
  else
    check 12 "Part C: 同时支持 click + touchstart" FAIL "click=$HAS_CLICK / touchstart=$HAS_TOUCH"
  fi
else
  check 12 "Part C: click + touchstart 双绑" FAIL "组件文件不存在"
fi

# [13/15] App.vue 引入 GlobalBackButton
RESULT=$(grep -c "GlobalBackButton" src/App.vue 2>/dev/null || true)
if [ "$RESULT" -ge 2 ]; then
  check 13 "Part C: App.vue 引入并使用 GlobalBackButton" PASS
else
  check 13 "Part C: App.vue 引入并使用 GlobalBackButton" FAIL "App.vue 中 GlobalBackButton 引用次数不足($RESULT,期望 ≥2: import + template)"
fi

# [14/15] App.vue 排除根屏(home / activation / boot / offline / error)
RESULT=$(grep -A 5 "showGlobalBackButton\|excluded" src/App.vue 2>/dev/null | grep -cE "'(activation|boot|home|offline|error)'" || true)
if [ "$RESULT" -ge 3 ]; then
  check 14 "Part C: App.vue 屏幕白名单(排除 5 个根屏)" PASS
else
  check 14 "Part C: App.vue 屏幕白名单" FAIL "未在 showGlobalBackButton computed 中找到足够的排除项($RESULT/5)"
fi

# ========== 全局红线 ==========

# [15/15] 没有 spillover 到禁区文件
SPILLOVER=0
SPILLOVER_FILES=""
for f in src/stores/dialogue.ts src/stores/screen.ts src/services/bridge/index.ts src/services/bridge/mock.ts src/services/bridge/types.ts; do
  if [ -f "$f" ]; then
    # 用 git diff 检查这些文件是否被改过(基于上次 commit)
    if git diff --quiet HEAD -- "$f" 2>/dev/null; then
      :  # 没改,正常
    else
      SPILLOVER=$((SPILLOVER + 1))
      SPILLOVER_FILES="$SPILLOVER_FILES $f"
    fi
  fi
done

if [ "$SPILLOVER" = "0" ]; then
  check 15 "Spillover 红线: 不动 stores/dialogue, stores/screen, services/bridge/*" PASS
else
  check 15 "Spillover 红线" FAIL "发现 $SPILLOVER 个禁区文件被改:$SPILLOVER_FILES"
fi

# ========== 汇总 ==========

echo
echo "========================================="
echo "Summary: $PASS/$TOTAL PASS, $FAIL FAIL"
echo "========================================="

if [ "$FAIL" = "0" ]; then
  echo -e "${GREEN}✅ ALL PASS${NC}"
  exit 0
else
  echo -e "${RED}❌ $FAIL/$TOTAL FAIL${NC}"
  echo
  echo "提醒:某些 FAIL 可能是误报,请按 verify-template.sh 假 FAIL 排除规则手动取证:"
  echo "  - 如 grep 命中 .backup-* 文件 → 假 FAIL,允许判 PASS"
  echo "  - 如 V4 Pro 主动同步类型 spillover → 假 FAIL,在 commit message 注明"
  echo "  - 如跨 WO 历史遗留 → 假 FAIL,本工单不修"
  exit 1
fi
