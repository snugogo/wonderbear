#!/usr/bin/env bash
# WO-3.20-verify.sh
# CreateScreen 故事数全量 + bot dispatch hang 修复 + TV 部署
# 基于 verify-template.sh,使用 verify-lib.sh v3 函数库

source /opt/wonderbear/workorders/verify-lib.sh

echo "============================================================"
echo "WO-3.20 verify — CreateScreen PAGE_SIZE + bot dispatch timeout + TV deploy"
echo "============================================================"
echo ""

# 工单允许改的文件 regex(check_no_spillover 用)
EXPECTED_FILES='tv-html/src/screens/CreateScreen\.vue|dingtalk-bot/src/factory-dispatch\.js|workorders/WO-3\.20-verify\.sh'
PREVIOUS_WO_FILES=''

# ============================================================
# Phase 1: CreateScreen PAGE_SIZE
# ============================================================
check_pattern_in_file 'PAGE_SIZE = 50' \
  "${TV_DIR}/src/screens/CreateScreen.vue" \
  "Phase 1.1: CreateScreen PAGE_SIZE 已改为 50"

check_pattern_absent_in_file 'PAGE_SIZE = 3\b' \
  "${TV_DIR}/src/screens/CreateScreen.vue" \
  "Phase 1.2: CreateScreen 不再有旧 PAGE_SIZE = 3"

# ============================================================
# Phase 2: bot dispatch hang 修复
# ============================================================
check_pattern_in_file 'timeout:' \
  "${REPO_ROOT}/dingtalk-bot/src/factory-dispatch.js" \
  "Phase 2.1: factory-dispatch.js execSync 已加 timeout 选项"

check_pattern_in_file '\bcatch\b' \
  "${REPO_ROOT}/dingtalk-bot/src/factory-dispatch.js" \
  "Phase 2.2: factory-dispatch.js execSync 包在 try/catch 里(防 timeout 抛出未捕获异常)"

# bot 进程健康
TOTAL=$((TOTAL + 1))
echo "[${TOTAL}] Phase 2.3: pm2 wonderbear-dingtalk online"
if pm2 jlist 2>/dev/null | grep -q '"name":"wonderbear-dingtalk".*"status":"online"'; then
  check_pass
else
  check_fail "wonderbear-dingtalk 不在 online 状态"
fi
echo ""

# ============================================================
# Phase 3: TV build 部署
# ============================================================
TOTAL=$((TOTAL + 1))
echo "[${TOTAL}] Phase 3.1: TV dist 已部署到 /var/www/wonderbear-tv/(近 30 分钟内)"
if [ -d "/var/www/wonderbear-tv" ] && [ -f "/var/www/wonderbear-tv/index.html" ]; then
  if find /var/www/wonderbear-tv/index.html -mmin -30 2>/dev/null | grep -q .; then
    check_pass
  else
    check_fail "TV dist 部署超过 30 分钟,可能未在本工单期间 build"
  fi
else
  check_fail "/var/www/wonderbear-tv/index.html 不存在"
fi
echo ""

# ============================================================
# 治理基础(verify-lib v3 标准)
# ============================================================
check_no_backup_files
check_no_spillover "${EXPECTED_FILES}" "${PREVIOUS_WO_FILES}"
check_no_luna_regression

verify_summary
