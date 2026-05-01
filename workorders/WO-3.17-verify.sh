#!/usr/bin/env bash
# /opt/wonderbear/workorders/WO-3.17-verify.sh
#
# WO-3.17 自检 verify。
#
# 注意:WO-3.17 是治理工单,它**自身**就是引入 verify-lib.sh 的工单,
# 所以本文件第一行 source 的就是它**这一次提交进来**的 lib。
# 这是合法的"自举"行为,WO-3.18 起所有工单都直接依赖 lib。

source /opt/wonderbear/workorders/verify-lib.sh

echo "============================================================"
echo "WO-3.17 verify — Verify Governance + Coordination Hygiene"
echo "============================================================"
echo ""

# ===== Part A: verify-lib.sh / template v3 部署 =====
check_files_exist \
  "${WORKORDERS_DIR}/verify-lib.sh" \
  "${WORKORDERS_DIR}/verify-template.sh"

check_pattern_in_file 'check_no_backup_files' \
  "${WORKORDERS_DIR}/verify-lib.sh" \
  "lib 提供 check_no_backup_files (规则 1)"

check_pattern_in_file 'check_no_spillover' \
  "${WORKORDERS_DIR}/verify-lib.sh" \
  "lib 提供 check_no_spillover (规则 2/6)"

check_pattern_in_file 'check_no_luna_regression' \
  "${WORKORDERS_DIR}/verify-lib.sh" \
  "lib 提供 check_no_luna_regression (规则 3)"

check_pattern_in_file 'grep_excluding_comments' \
  "${WORKORDERS_DIR}/verify-lib.sh" \
  "lib 提供 grep_excluding_comments (规则 4 底层)"

check_pattern_in_file 'grep_count_multiline_safe' \
  "${WORKORDERS_DIR}/verify-lib.sh" \
  "lib 提供 grep_count_multiline_safe (规则 5 底层)"

check_pattern_in_file 'check_selector_exists' \
  "${WORKORDERS_DIR}/verify-lib.sh" \
  "lib 提供 check_selector_exists (规则 7)"

check_pattern_in_file 'verify_summary' \
  "${WORKORDERS_DIR}/verify-lib.sh" \
  "lib 提供 verify_summary"

# template v3 的标志:source 第一行
check_pattern_in_file '^source.*verify-lib\.sh' \
  "${WORKORDERS_DIR}/verify-template.sh" \
  "template v3 强制 source verify-lib.sh"

# ===== Part A: lib 自检(自举测试 — 用 lib 的函数检查 lib 本身)=====
TOTAL=$((TOTAL + 1))
echo "[${TOTAL}] verify-lib.sh 自身语法 OK"
if bash -n "${WORKORDERS_DIR}/verify-lib.sh" 2>/dev/null; then
  check_pass
else
  check_fail "verify-lib.sh 语法错误"
fi
echo ""

TOTAL=$((TOTAL + 1))
echo "[${TOTAL}] verify-template.sh 自身语法 OK"
if bash -n "${WORKORDERS_DIR}/verify-template.sh" 2>/dev/null; then
  check_pass
else
  check_fail "verify-template.sh 语法错误"
fi
echo ""

# ===== Part B: coordination/ 入库治理 =====
TOTAL=$((TOTAL + 1))
echo "[${TOTAL}] coordination/.gitignore 已创建"
if [ -f "${REPO_ROOT}/coordination/.gitignore" ]; then
  check_pass
else
  check_fail "缺失 coordination/.gitignore"
fi
echo ""

TOTAL=$((TOTAL + 1))
echo "[${TOTAL}] coordination/.gitignore 含 .processed 规则"
if grep -qE '\*\.processed' "${REPO_ROOT}/coordination/.gitignore" 2>/dev/null; then
  check_pass
else
  check_fail ".gitignore 未包含 *.processed 排除"
fi
echo ""

TOTAL=$((TOTAL + 1))
echo "[${TOTAL}] coordination/archive/2026-04-30-v2lite/ 归档目录创建"
if [ -d "${REPO_ROOT}/coordination/archive/2026-04-30-v2lite" ]; then
  check_pass
else
  check_fail "缺失 archive/2026-04-30-v2lite/ 目录"
fi
echo ""

TOTAL=$((TOTAL + 1))
echo "[${TOTAL}] v2lite workorder 草稿已迁入 archive/"
V2LITE_AT_TOP=$(ls "${REPO_ROOT}/coordination/" 2>/dev/null | grep -c 'v2lite' || true)
[ -z "$V2LITE_AT_TOP" ] && V2LITE_AT_TOP=0
echo "  顶层 coordination/ 残留 v2lite 文件数: ${V2LITE_AT_TOP}"
if [ "$V2LITE_AT_TOP" = "0" ]; then
  check_pass
else
  check_fail "v2lite 文件还在顶层 coordination/,应迁入 archive/"
fi
echo ""

TOTAL=$((TOTAL + 1))
echo "[${TOTAL}] coordination/ untracked 数 ≤ 5(从 55 显著下降)"
cd "${REPO_ROOT}" || exit 1
UNTRACKED=$(git status --short coordination/ 2>/dev/null | grep -c '^??' || true)
[ -z "$UNTRACKED" ] && UNTRACKED=0
echo "  当前 untracked: ${UNTRACKED}"
if [ "$UNTRACKED" -le 5 ] 2>/dev/null; then
  check_pass
else
  check_fail "coordination/ 仍有 ${UNTRACKED} 个 untracked,治理未完成"
fi
echo ""

# ===== Part C: 自动化协调器部署 =====
check_files_exist \
  "${REPO_ROOT}/coordination/auto-coordinator.sh" \
  "${REPO_ROOT}/coordination/false-fail-judge.sh"

TOTAL=$((TOTAL + 1))
echo "[${TOTAL}] auto-coordinator.sh 可执行"
if [ -x "${REPO_ROOT}/coordination/auto-coordinator.sh" ]; then
  check_pass
else
  check_fail "auto-coordinator.sh 不可执行(chmod +x)"
fi
echo ""

TOTAL=$((TOTAL + 1))
echo "[${TOTAL}] false-fail-judge.sh 可执行"
if [ -x "${REPO_ROOT}/coordination/false-fail-judge.sh" ]; then
  check_pass
else
  check_fail "false-fail-judge.sh 不可执行"
fi
echo ""

TOTAL=$((TOTAL + 1))
echo "[${TOTAL}] auto-coordinator.sh 语法 OK"
if bash -n "${REPO_ROOT}/coordination/auto-coordinator.sh" 2>/dev/null; then
  check_pass
else
  check_fail "auto-coordinator.sh 语法错误"
fi
echo ""

TOTAL=$((TOTAL + 1))
echo "[${TOTAL}] false-fail-judge.sh 语法 OK"
if bash -n "${REPO_ROOT}/coordination/false-fail-judge.sh" 2>/dev/null; then
  check_pass
else
  check_fail "false-fail-judge.sh 语法错误"
fi
echo ""

# Part C 钉钉 bot 集成 — done-watcher / command-router 改动检查
# (此项依赖取证 16/17/18 后再补具体 grep,先占位)
TOTAL=$((TOTAL + 1))
echo "[${TOTAL}] dingtalk-bot done-watcher 已加 auto-coordinator hook"
if grep -qE 'auto-coordinator' "${REPO_ROOT}/dingtalk-bot/src/done-watcher.js" 2>/dev/null; then
  check_pass
else
  check_fail "done-watcher.js 未集成 auto-coordinator post-droid 调用"
fi
echo ""

TOTAL=$((TOTAL + 1))
echo "[${TOTAL}] dingtalk-bot command-router 已加 confirmed 分支"
if grep -qE 'confirmed' "${REPO_ROOT}/dingtalk-bot/src/command-router.js" 2>/dev/null; then
  check_pass
else
  check_fail "command-router.js 未加 'WO-X confirmed' 分支"
fi
echo ""

# ===== Part D: backup 文件清理 =====
# 直接调用 lib 的规则 1
check_no_backup_files

# ===== Part E: GROUND-TRUTH.md 更新 =====
TOTAL=$((TOTAL + 1))
echo "[${TOTAL}] GROUND-TRUTH.md 含 WO-3.16 闭环条目"
if grep -qE 'WO-3\.16' "${REPO_ROOT}/coordination/GROUND-TRUTH.md" 2>/dev/null; then
  check_pass
else
  check_fail "GROUND-TRUTH.md 未更新 WO-3.16"
fi
echo ""

TOTAL=$((TOTAL + 1))
echo "[${TOTAL}] GROUND-TRUTH.md 含 WO-3.17 闭环条目"
if grep -qE 'WO-3\.17' "${REPO_ROOT}/coordination/GROUND-TRUTH.md" 2>/dev/null; then
  check_pass
else
  check_fail "GROUND-TRUTH.md 未更新 WO-3.17"
fi
echo ""

TOTAL=$((TOTAL + 1))
echo "[${TOTAL}] GROUND-TRUTH.md verify v3 章节存在"
if grep -qE 'verify-lib\.sh|v3' "${REPO_ROOT}/coordination/GROUND-TRUTH.md" 2>/dev/null; then
  check_pass
else
  check_fail "GROUND-TRUTH.md verify v3 文档章节缺失"
fi
echo ""

# ===== 标准 invariant 检查(本工单允许的 spillover)=====
# WO-3.17 改动文件清单(用 regex)— 与 README §spillover-allowed 对齐:
EXPECTED_FILES='workorders/verify-(lib|template)\.sh|workorders/WO-3\.17-verify\.sh|coordination/(\.gitignore|auto-coordinator\.sh|false-fail-judge\.sh|dingtalk-router\.sh|GROUND-TRUTH\.md|archive/.*|workorders/.*|done/.*|2026-.*\.md)|dingtalk-bot/src/(done-watcher|command-router|index)\.js|(tv-html|server-v7|h5)/\.gitignore'

check_no_spillover "${EXPECTED_FILES}"

# Luna 不能因为本治理工单而重现(虽然本工单不动业务代码)
check_no_luna_regression

# ===== 终结 =====
verify_summary
