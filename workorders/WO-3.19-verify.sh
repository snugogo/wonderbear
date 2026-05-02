#!/usr/bin/env bash
# /opt/wonderbear/workorders/WO-3.19-verify.sh
#
# WO-3.19 verify — 主角变量传递链路修复

source /opt/wonderbear/workorders/verify-lib.sh

echo "============================================================"
echo "WO-3.19 verify — Protagonist Chain Fix (Luna→Dora real bug)"
echo "============================================================"
echo ""

MARKER_DIR="${REPO_ROOT}/coordination/markers/WO-3.19"

# ===== 取证完整性 =====
TOTAL=$((TOTAL + 1))
echo "[${TOTAL}] Step 1A: .luna-survey.txt 取证报告存在"
if [ -f "${MARKER_DIR}/.luna-survey.txt" ]; then
  check_pass
  echo "  报告大小: $(wc -l < ${MARKER_DIR}/.luna-survey.txt) 行"
else
  check_fail "Luna 取证报告缺失 — 必须先取证再改"
fi
echo ""

TOTAL=$((TOTAL + 1))
echo "[${TOTAL}] Step 1B: .protagonist-survey.txt 取证报告存在"
if [ -f "${MARKER_DIR}/.protagonist-survey.txt" ]; then
  check_pass
else
  check_fail "主角变量取证报告缺失"
fi
echo ""

TOTAL=$((TOTAL + 1))
echo "[${TOTAL}] Step 1C: .extraction-survey.txt 取证报告存在"
if [ -f "${MARKER_DIR}/.extraction-survey.txt" ]; then
  check_pass
else
  check_fail "提取链路取证报告缺失"
fi
echo ""

TOTAL=$((TOTAL + 1))
echo "[${TOTAL}] fix-applied marker 存在"
if [ -f "${MARKER_DIR}/.fix-applied" ]; then
  check_pass
else
  check_fail "修复未声明完成"
fi
echo ""

# ===== Luna 在 production 代码 = 0(verify-lib 兜底)=====
# 直接调用 lib 的 check_no_luna_regression(已含 mock/demo/test 排除)
check_no_luna_regression

# ===== Prompt 变量化检查 =====
# Server 端 prompt 应使用 {childName} 或 ${childName} 而不是硬编码
TOTAL=$((TOTAL + 1))
echo "[${TOTAL}] server-v7 prompt 含 childName 变量"
HITS=$(grep -rE '\{childName\}|\$\{childName\}|childName:' "${SERVER_DIR}/src" 2>/dev/null \
       | grep -v node_modules | wc -l | tr -d ' ')
[ -z "$HITS" ] && HITS=0
echo "  childName 变量引用: $HITS"
if [ "$HITS" -ge 3 ] 2>/dev/null; then
  check_pass
else
  check_fail "server-v7 prompt 未充分变量化(应至少 3 处引用 childName)"
fi
echo ""

# ===== Server 端实现优先级链 =====
TOTAL=$((TOTAL + 1))
echo "[${TOTAL}] server-v7 含主角优先级链路代码"
HITS=$(grep -rE 'extractedFromConversation|extractProtagonist|protagonist.*||.*Dora' "${SERVER_DIR}/src" 2>/dev/null \
       | grep -v node_modules | wc -l | tr -d ' ')
[ -z "$HITS" ] && HITS=0
echo "  优先级链路相关 hits: $HITS"
if [ "$HITS" -ge 1 ] 2>/dev/null; then
  check_pass
else
  check_fail "未发现主角优先级链路实现"
fi
echo ""

# ===== Mock seed 默认是 Dora =====
# 如 demoStory.ts / mock 等文件中默认值
TOTAL=$((TOTAL + 1))
echo "[${TOTAL}] mock seed 默认主角是 Dora"
DORA_HITS=$(grep -rE "name:\s*['\"]Dora['\"]|childName:\s*['\"]Dora['\"]" "${TV_DIR}/src" 2>/dev/null | wc -l | tr -d ' ')
[ -z "$DORA_HITS" ] && DORA_HITS=0
echo "  Dora 默认值 hits: $DORA_HITS"
if [ "$DORA_HITS" -ge 1 ] 2>/dev/null; then
  check_pass
else
  check_fail "未发现 mock seed 默认 Dora"
fi
echo ""

# ===== 构建验证 =====
check_npm_build "$TV_DIR" "tv-html npm run build 通过"

check_node_require './src/routes/story.js' "server-v7 routes/story.js 可加载"

# ===== 标准 invariant =====
check_no_backup_files

EXPECTED='tv-html/src/screens/.*\.vue|tv-html/src/components/.*\.(vue|ts)|tv-html/src/stores/.*\.ts|tv-html/src/utils/.*\.ts|tv-html/src/i18n/locales/(zh|en)\.ts|server-v7/src/routes/(story|dialogue)\.js|server-v7/src/services/.*\.js|server-v7/src/prompts/.*|coordination/markers/WO-3\.19/.*'
PREV_WO='tv-html/src/utils/demoStory\.ts|tv-html/src/screens/.*\.vue|server-v7/src/routes/story\.js|server-v7/src/routes/dialogue\.js'

check_no_spillover "$EXPECTED" "$PREV_WO"

verify_summary
