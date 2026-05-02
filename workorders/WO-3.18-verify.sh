#!/usr/bin/env bash
# /opt/wonderbear/workorders/WO-3.18-verify.sh
#
# WO-3.18 verify — GeneratingScreen 综合 + 草稿持久化
# 引用 WO-3.17 引入的 verify-lib.sh

source /opt/wonderbear/workorders/verify-lib.sh

echo "============================================================"
echo "WO-3.18 verify — GeneratingScreen + 草稿持久化"
echo "============================================================"
echo ""

DIALOGUE="${TV_DIR}/src/screens/DialogueScreen.vue"
GENERATING="${TV_DIR}/src/screens/GeneratingScreen.vue"
HOME_SCR="${TV_DIR}/src/screens/HomeScreen.vue"
EN_LOCALE="${TV_DIR}/src/i18n/locales/en.ts"
ZH_LOCALE="${TV_DIR}/src/i18n/locales/zh.ts"
MARKER_DIR="${REPO_ROOT}/coordination/markers/WO-3.18"

# ===== Phase markers(4 个 phase)=====
TOTAL=$((TOTAL + 1))
echo "[${TOTAL}] Phase 1 marker 存在 (.phase-1-done)"
if [ -f "${MARKER_DIR}/.phase-1-done" ]; then
  check_pass
else
  check_fail "Phase 1 (文案 + hint) 未完成"
fi
echo ""

TOTAL=$((TOTAL + 1))
echo "[${TOTAL}] Phase 2 marker 存在 (.phase-2-done)"
if [ -f "${MARKER_DIR}/.phase-2-done" ]; then
  check_pass
else
  check_fail "Phase 2 (进度条同源) 未完成"
fi
echo ""

TOTAL=$((TOTAL + 1))
echo "[${TOTAL}] Phase 3 marker 存在 (.phase-3-done)"
if [ -f "${MARKER_DIR}/.phase-3-done" ]; then
  check_pass
else
  check_fail "Phase 3 (状态机) 未完成"
fi
echo ""

TOTAL=$((TOTAL + 1))
echo "[${TOTAL}] Phase 4 marker 存在 (.phase-4-done)"
if [ -f "${MARKER_DIR}/.phase-4-done" ]; then
  check_pass
else
  check_fail "Phase 4 (草稿持久化) 未完成 — 这是高风险 phase,部分完成可接受"
fi
echo ""

# ===== Phase 1 验证: 文案 =====
check_pattern_in_file 'Bear is painting your story' \
  "$EN_LOCALE" \
  "Phase 1A: en.ts 含 'Bear is painting your story'"

check_pattern_absent_in_file 'Bear is recording' \
  "$EN_LOCALE" \
  "Phase 1A: en.ts 不再含 'Bear is recording'"

check_pattern_in_file '小熊正在画你的故事' \
  "$ZH_LOCALE" \
  "Phase 1A: zh.ts 含 '小熊正在画你的故事'"

# Phase 1B: hint CSS 不遮挡(grep margin/padding/bottom 关键字)
TOTAL=$((TOTAL + 1))
echo "[${TOTAL}] Phase 1B: GeneratingScreen 含 hint 文字间距修复"
if [ -f "$GENERATING" ]; then
  HITS=$(grep -cE 'margin-bottom|padding-bottom|bottom:\s*[0-9]' "$GENERATING" 2>/dev/null || true)
  [ -z "$HITS" ] && HITS=0
  if [ "$HITS" -ge 1 ] 2>/dev/null; then
    check_pass
  else
    check_fail "GeneratingScreen 未发现 hint 间距 CSS"
  fi
else
  check_fail "GeneratingScreen.vue 不存在"
fi
echo ""

# ===== Phase 2 验证: 进度条同源 =====
TOTAL=$((TOTAL + 1))
echo "[${TOTAL}] Phase 2: 进度条与小熊用同一 progress 变量"
# 期望:同一 .vue 文件里既有 progress-fill width 又有 bear left,共享 progress
if [ -f "$GENERATING" ]; then
  HAS_PROGRESS_FILL=$(grep -cE 'progress.*width|width.*progress' "$GENERATING" 2>/dev/null || true)
  HAS_BEAR_LEFT=$(grep -cE 'bear.*left|left.*progress' "$GENERATING" 2>/dev/null || true)
  [ -z "$HAS_PROGRESS_FILL" ] && HAS_PROGRESS_FILL=0
  [ -z "$HAS_BEAR_LEFT" ] && HAS_BEAR_LEFT=0
  echo "  progress-fill 引用: $HAS_PROGRESS_FILL, bear-left 引用: $HAS_BEAR_LEFT"
  if [ "$HAS_PROGRESS_FILL" -ge 1 ] 2>/dev/null && [ "$HAS_BEAR_LEFT" -ge 1 ] 2>/dev/null; then
    check_pass
  else
    check_fail "未发现进度条与小熊位置共享 progress 变量"
  fi
else
  check_fail "GeneratingScreen.vue 不存在"
fi
echo ""

# ===== Phase 3 验证: 状态机 =====
TOTAL=$((TOTAL + 1))
echo "[${TOTAL}] Phase 3: DialogueScreen 含 dialogueState/waiting_confirm 状态"
if [ -f "$DIALOGUE" ]; then
  HITS=$(grep -cE 'dialogueState|waiting_confirm|asking|WAITING_CONFIRM' "$DIALOGUE" 2>/dev/null || true)
  [ -z "$HITS" ] && HITS=0
  echo "  状态相关 hits: $HITS"
  if [ "$HITS" -ge 2 ] 2>/dev/null; then
    check_pass
  else
    check_fail "DialogueScreen 未发现 dialogueState 状态机相关代码"
  fi
else
  check_fail "DialogueScreen.vue 不存在"
fi
echo ""

# Phase 3: should_summarize 字段已加到对话 prompt
TOTAL=$((TOTAL + 1))
echo "[${TOTAL}] Phase 3: server-v7 dialogue prompt 含 should_summarize 字段"
HITS=$(grep -rE 'should_summarize' "${SERVER_DIR}/src" 2>/dev/null | grep -v node_modules | wc -l | tr -d ' ')
[ -z "$HITS" ] && HITS=0
echo "  should_summarize 引用: $HITS"
if [ "$HITS" -ge 1 ] 2>/dev/null; then
  check_pass
else
  check_fail "server-v7 未发现 should_summarize 实现"
fi
echo ""

# Phase 3: ConfirmCreateButton 组件或 pulse 动效
TOTAL=$((TOTAL + 1))
echo "[${TOTAL}] Phase 3: 按钮含 pulse 动效"
HITS=$(grep -rE '@keyframes pulse|animation:.*pulse|ConfirmCreateButton' "${TV_DIR}/src" 2>/dev/null | wc -l | tr -d ' ')
[ -z "$HITS" ] && HITS=0
echo "  pulse 动效或 ConfirmCreateButton 组件 hits: $HITS"
if [ "$HITS" -ge 1 ] 2>/dev/null; then
  check_pass
else
  check_fail "未发现按钮动效"
fi
echo ""

# ===== Phase 4 验证: 草稿持久化 =====
TOTAL=$((TOTAL + 1))
echo "[${TOTAL}] Phase 4 取证报告存在 (.phase-4-survey.txt)"
if [ -f "${MARKER_DIR}/.phase-4-survey.txt" ]; then
  check_pass
  echo "  取证摘要(前 5 行):"
  head -5 "${MARKER_DIR}/.phase-4-survey.txt" | sed 's/^/    /'
else
  check_fail "未发现 deviceId 取证报告 — 必须先取证再实施"
fi
echo ""

# Phase 4: 前端必有 saveDraft/loadDraft/clearDraft(无论方案 a 还是 b)
TOTAL=$((TOTAL + 1))
echo "[${TOTAL}] Phase 4: 前端含 draft 函数(saveDraft/loadDraft/clearDraft)"
HITS=$(grep -rE 'saveDraft|loadDraft|clearDraft' "${TV_DIR}/src" 2>/dev/null | wc -l | tr -d ' ')
[ -z "$HITS" ] && HITS=0
echo "  draft 函数引用: $HITS"
if [ "$HITS" -ge 3 ] 2>/dev/null; then
  check_pass
else
  check_fail "前端 draft 函数未实现(应至少有 save/load/clear)"
fi
echo ""

# Phase 4: 后端 OR localStorage 二选一
TOTAL=$((TOTAL + 1))
echo "[${TOTAL}] Phase 4: 后端 StoryDraft model 或 localStorage 二选一已实现"
BACKEND_HAS=$(grep -cE 'StoryDraft|story_draft' "${SERVER_DIR}/prisma/schema.prisma" 2>/dev/null || true)
LOCAL_HAS=$(grep -rE "localStorage.*draft|wonderbear:draft" "${TV_DIR}/src" 2>/dev/null | wc -l | tr -d ' ')
[ -z "$BACKEND_HAS" ] && BACKEND_HAS=0
[ -z "$LOCAL_HAS" ] && LOCAL_HAS=0
echo "  backend StoryDraft: $BACKEND_HAS, localStorage draft: $LOCAL_HAS"
if [ "$BACKEND_HAS" -ge 1 ] 2>/dev/null || [ "$LOCAL_HAS" -ge 1 ] 2>/dev/null; then
  check_pass
else
  check_fail "草稿持久化未实现(后端 schema 或 localStorage 都没有)"
fi
echo ""

# Phase 4: HomeScreen 或 CREATE 入口含草稿恢复对话框
TOTAL=$((TOTAL + 1))
echo "[${TOTAL}] Phase 4: 草稿恢复 / 返回键确认对话框"
HITS=$(grep -rE 'draft.*continue|继续|recover.*draft|确认.*保留|要保留' "${TV_DIR}/src" 2>/dev/null | wc -l | tr -d ' ')
[ -z "$HITS" ] && HITS=0
echo "  草稿对话框相关 hits: $HITS"
if [ "$HITS" -ge 2 ] 2>/dev/null; then
  check_pass
else
  check_fail "未发现草稿恢复或返回键确认对话框"
fi
echo ""

# ===== 构建验证(治本:任何 vue/ts 改动都要保证 build 过)=====
check_npm_build "$TV_DIR" "tv-html npm run build 通过(无 TS 错误)"

# ===== 标准 invariant =====
check_no_backup_files

EXPECTED='tv-html/src/screens/(DialogueScreen|GeneratingScreen|HomeScreen)\.vue|tv-html/src/components/.*\.(vue|ts)|tv-html/src/stores/.*\.ts|tv-html/src/i18n/locales/(zh|en)\.ts|tv-html/src/services/api\.ts|tv-html/src/router\.ts|server-v7/src/routes/draft\.js|server-v7/src/routes/index\.js|server-v7/prisma/schema\.prisma|server-v7/prisma/migrations/.*|coordination/markers/WO-3\.18/.*'
PREV_WO='tv-html/src/screens/DialogueScreen\.vue|tv-html/src/screens/GeneratingScreen\.vue'

check_no_spillover "$EXPECTED" "$PREV_WO"
check_no_luna_regression

verify_summary
