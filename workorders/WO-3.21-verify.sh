#!/usr/bin/env bash
# WO-3.21-verify.sh
# TV CreateScreen scrollbar 隐藏 + 协调器 errcode 450103 真根因 + cachedWebhook 启动初始化 + bot 启动自检
# 严格使用 verify-lib.sh 真实 API(check_pattern_in_file <pattern> <file> <description>)
#
# 修订记录(WO-3.21 期间):初版调用顺序写反(file 在 pattern 前),
# 全部 check 必 FAIL。WO-3.21 verify 脚本本身在 spillover 白名单内,
# 故重写为符合 verify-lib.sh v3 调用约定的版本。

source /opt/wonderbear/workorders/verify-lib.sh

echo "============================================================"
echo "WO-3.21 verify — TV scrollbar + 协调器 at 字段 + cachedWebhook 启动 + bot 健康自检"
echo "============================================================"
echo ""

# 工单允许改的文件 regex(check_no_spillover 用)
EXPECTED_FILES='tv-html/src/screens/CreateScreen\.vue|dingtalk-bot/src/index\.js|coordination/dingtalk-router\.sh|workorders/WO-3\.21-verify\.sh'
PREVIOUS_WO_FILES=''

# ============================================================
# Phase 1: CreateScreen scrollbar 隐藏
# ============================================================
check_pattern_in_file 'scrollbar-width: none' \
  "${TV_DIR}/src/screens/CreateScreen.vue" \
  "Phase 1.1: CreateScreen.vue 含 scrollbar-width: none (Firefox)"

check_pattern_in_file '::-webkit-scrollbar' \
  "${TV_DIR}/src/screens/CreateScreen.vue" \
  "Phase 1.2: CreateScreen.vue 含 ::-webkit-scrollbar (Chrome/Safari)"

check_pattern_in_file '\-ms-overflow-style: none' \
  "${TV_DIR}/src/screens/CreateScreen.vue" \
  "Phase 1.3: CreateScreen.vue 含 -ms-overflow-style: none (legacy Edge/IE)"

# ============================================================
# Phase 2: 协调器 errcode 450103 真根因 — 移除 at 字段
# ============================================================
check_pattern_absent_in_file 'isAtAll' \
  "${REPO_ROOT}/coordination/dingtalk-router.sh" \
  "Phase 2.1: dingtalk-router.sh 不再含 isAtAll(at 字段已移除)"

check_pattern_in_file 'msgtype:"text"' \
  "${REPO_ROOT}/coordination/dingtalk-router.sh" \
  "Phase 2.2: dingtalk-router.sh 仍发送正常 msgtype:\"text\" payload"

# ============================================================
# Phase 3: cachedWebhook 启动从 .env 读
# ============================================================
check_pattern_in_file 'process\.env\.DINGTALK_WEBHOOK_URL' \
  "${REPO_ROOT}/dingtalk-bot/src/index.js" \
  "Phase 3.1: index.js cachedWebhook 引用 process.env.DINGTALK_WEBHOOK_URL"

check_pattern_in_file '\[BOOT\] cachedWebhook' \
  "${REPO_ROOT}/dingtalk-bot/src/index.js" \
  "Phase 3.2: index.js 含 [BOOT] cachedWebhook 启动日志"

# ============================================================
# Phase 4: bot 启动健康自检
# ============================================================
check_pattern_in_file 'BOT-ALIVE' \
  "${REPO_ROOT}/dingtalk-bot/src/index.js" \
  "Phase 4.1: index.js 含 [BOT-ALIVE] 启动自检标记"

check_pattern_in_file 'setTimeout' \
  "${REPO_ROOT}/dingtalk-bot/src/index.js" \
  "Phase 4.2: index.js 含 setTimeout (30 秒延迟自检)"

# ============================================================
# bot 进程健康(运行时)
# ============================================================
TOTAL=$((TOTAL + 1))
echo "[${TOTAL}] H.1: node -c dingtalk-bot/src/index.js 语法通过"
if node -c "${REPO_ROOT}/dingtalk-bot/src/index.js" 2>/dev/null; then
  check_pass
else
  check_fail "node -c index.js 失败,有语法错误"
fi
echo ""

TOTAL=$((TOTAL + 1))
echo "[${TOTAL}] H.2: pm2 wonderbear-dingtalk online"
if pm2 jlist 2>/dev/null | grep -q '"name":"wonderbear-dingtalk".*"status":"online"'; then
  check_pass
else
  check_fail "wonderbear-dingtalk 不在 online 状态"
fi
echo ""

# ============================================================
# 治理基础(verify-lib v3 标准)
# ============================================================
check_no_backup_files
check_no_spillover "${EXPECTED_FILES}" "${PREVIOUS_WO_FILES}"
check_no_luna_regression

verify_summary
