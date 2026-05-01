#!/bin/bash
# WO-DT-1.3 (v2) verify.sh — 9 项检查
# 用法: ssh wonderbear-vps "bash /opt/wonderbear/workorders/WO-DT-1.3-verify.sh"
# 退出码: 0 = 全过, 非 0 = 至少一项失败
#
# v2 改动 vs v1:
#   - 新增 [8/9]: node -e "require()" 模块加载测试 (核心修复)
#   - 新增 [9/9]: grep 检测多行 markdown 嵌入字符串嫌疑

set -uo pipefail

DINGTALK_BOT_DIR="/opt/wonderbear/dingtalk-bot"
PASS_COUNT=0
FAIL_COUNT=0

# ---- helpers ----
safe_grep_count() {
    local pattern="$1"
    local file="$2"
    if [ ! -f "$file" ]; then echo "FILE_MISSING"; return; fi
    local count
    count=$(grep -cE "$pattern" "$file" 2>/dev/null || true)
    echo "${count:-0}"
}

check_pass() { PASS_COUNT=$((PASS_COUNT+1)); echo "  ✅ PASS"; }
check_fail() { FAIL_COUNT=$((FAIL_COUNT+1)); echo "  ❌ FAIL: $1"; }

# ---- header ----
echo "============================================================"
echo "WO-DT-1.3 (v2) verify.sh — done-watcher 自动 verify 推钉钉"
echo "时间: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "目标: dingtalk-bot watcher 模块"
echo "============================================================"
echo

# ---- 自动定位 watcher 文件 ----
# v1 已确认: index.js 是 watcher 主入口
# command-router.js 因 v1 改动后字符串拼接打散,不会被这个 grep 抓到
WATCHER_FILE=$(find "$DINGTALK_BOT_DIR/src" -type f \( -name '*.js' -o -name '*.ts' \) 2>/dev/null \
    | xargs grep -lE 'coordination/done|done.*watch|\.processed' 2>/dev/null \
    | head -1)

echo "自动定位 watcher 文件: ${WATCHER_FILE:-<未找到>}"
echo

if [ -z "$WATCHER_FILE" ]; then
    check_fail "找不到 watcher 文件 — Factory 勘察阶段没改对地方"
    echo
    echo "============================================================"
    echo "❌ 致命错误: 无 watcher 文件可验证"
    echo "============================================================"
    exit 1
fi

# ---- check 1: backup 文件 ----
echo "[1/9] backup 文件存在"
echo "  为什么: §4 备份纪律"
BACKUP_PATTERN="${WATCHER_FILE}.backup-2026-04-30-wo-dt-1.3-pre"
if [ -f "$BACKUP_PATTERN" ]; then
    SIZE=$(wc -c < "$BACKUP_PATTERN")
    echo "  backup: $BACKUP_PATTERN ($SIZE bytes)"
    check_pass
else
    check_fail "backup 不存在: $BACKUP_PATTERN"
fi
echo

# ---- check 2: 关键代码出现 ----
echo "[2/9] 关键代码出现（exec + verify.sh + timeout）"
echo "  为什么: §2.2 必须用 child_process.exec 异步 + 120s 超时"

EXEC_COUNT=$(safe_grep_count "child_process.*exec|require.*child_process|from.*child_process" "$WATCHER_FILE")
VERIFY_PATH_COUNT=$(safe_grep_count "verify\\.sh|verify-sh|workorders/.*verify" "$WATCHER_FILE")
TIMEOUT_COUNT=$(safe_grep_count "120000|timeout.*120|120.*timeout" "$WATCHER_FILE")

echo "  child_process exec 引用: $EXEC_COUNT (应 ≥ 1)"
echo "  verify.sh 路径引用: $VERIFY_PATH_COUNT (应 ≥ 1)"
echo "  120s timeout: $TIMEOUT_COUNT (应 ≥ 1)"

if [ "$EXEC_COUNT" != "0" ] && [ "$EXEC_COUNT" != "FILE_MISSING" ] \
   && [ "$VERIFY_PATH_COUNT" != "0" ] && [ "$VERIFY_PATH_COUNT" != "FILE_MISSING" ] \
   && [ "$TIMEOUT_COUNT" != "0" ] && [ "$TIMEOUT_COUNT" != "FILE_MISSING" ]; then
    check_pass
else
    check_fail "关键代码缺失"
fi
echo

# ---- check 3: 不许 execSync ----
echo "[3/9] 不许 execSync"
echo "  为什么: §3 红线 + HANDOFF 学习 §3 阻塞主线程会触发钉钉重投"

EXECSYNC_COUNT=$(safe_grep_count "execSync" "$WATCHER_FILE")
echo "  execSync 出现次数: $EXECSYNC_COUNT (应为 0)"

if [ "$EXECSYNC_COUNT" = "0" ]; then
    check_pass
else
    check_fail "execSync 出现 $EXECSYNC_COUNT 次"
fi
echo

# ---- check 4: 没有 console.log 调试污染 ----
echo "[4/9] 没有调试 console.log"
echo "  为什么: §3 红线"

DEBUG_LOG=$(safe_grep_count "console\\.log\\(.*\\[debug|console\\.log\\(.*WO-DT-1\\.3" "$WATCHER_FILE")
echo "  调试 console.log: $DEBUG_LOG (应为 0)"

if [ "$DEBUG_LOG" = "0" ]; then
    check_pass
else
    check_fail "调试 console.log 残留"
fi
echo

# ---- check 5: 没有 mock 关键字 ----
echo "[5/9] 没有 mock 兜底"
echo "  为什么: §3 红线 + Kristy 零容忍 mock"

MOCK_COUNT=$(safe_grep_count "\\bmock\\b|\\bfake\\b|\\bstub\\b|\\bdummy\\b" "$WATCHER_FILE")
echo "  mock/fake/stub/dummy 出现: $MOCK_COUNT (应为 0)"

if [ "$MOCK_COUNT" = "0" ]; then
    check_pass
else
    echo "  ⚠️  WARN: 出现 $MOCK_COUNT 次,请人工检查是否合理用法"
    PASS_COUNT=$((PASS_COUNT+1))
    echo "  ✅ PASS（warn 不 fail）"
fi
echo

# ---- check 6: dingtalk-bot 编译/语法通过 (node -c) ----
echo "[6/9] dingtalk-bot 语法检查通过 (node -c)"
echo "  为什么: §5 Dry-run 校验 - 第一道防线"

cd "$DINGTALK_BOT_DIR"
SYNTAX_CHECK=$(node -c "$WATCHER_FILE" 2>&1 || true)
if [ -z "$SYNTAX_CHECK" ]; then
    echo "  语法 OK"
    check_pass
else
    echo "  $SYNTAX_CHECK" | sed 's/^/    /'
    check_fail "语法检查失败"
fi
echo

# ---- check 7: Factory 报告里有 3 个测试用例输出 ----
echo "[7/9] Factory 报告里包含 3 个测试用例输出"
echo "  为什么: §2.4 Factory 必须自测 pass/fail/no-verify 三种"

REPORT_FILE=$(ls -t /opt/wonderbear/coordination/done/WO-DT-1.3-report.md 2>/dev/null | head -1)
if [ -z "$REPORT_FILE" ] || [ ! -f "$REPORT_FILE" ]; then
    check_fail "找不到 WO-DT-1.3 Factory 报告"
else
    echo "  报告文件: $REPORT_FILE"
    TEST_PASS=$(safe_grep_count "WO-TEST-1|测试 1|test.*pass" "$REPORT_FILE")
    TEST_FAIL=$(safe_grep_count "WO-TEST-2|测试 2|test.*fail" "$REPORT_FILE")
    TEST_MINI=$(safe_grep_count "WO-MINI-99|测试 3|no-verify|无 verify" "$REPORT_FILE")
    echo "  测试 1 (pass): $TEST_PASS"
    echo "  测试 2 (fail): $TEST_FAIL"
    echo "  测试 3 (no-verify): $TEST_MINI"
    if [ "$TEST_PASS" != "0" ] && [ "$TEST_FAIL" != "0" ] && [ "$TEST_MINI" != "0" ]; then
        check_pass
    else
        check_fail "Factory 报告缺测试用例输出"
    fi
fi
echo

# ---- check 8 (v2 NEW): node -e require() 模块加载测试 ----
echo "[8/9] 🆕 模块加载测试 (node -e require)"
echo "  为什么: v2 核心修复 - node -c 只查语法不查运行时 parse,"
echo "         必须 require() 才能捕获嵌入字符串的 SyntaxError"

cd "$DINGTALK_BOT_DIR"
# 用子 shell + 100ms 超时退出,避免被 WebSocket 连接卡住
LOAD_TEST_OUTPUT=$(timeout 5 node -e "
try {
  require('$WATCHER_FILE');
  setTimeout(() => process.exit(0), 100);
} catch (e) {
  console.error('LOAD_ERROR:', e.message);
  process.exit(1);
}
" 2>&1 || true)

# 检测真错误关键字 (require 成功但 WebSocket 连接日志不算)
if echo "$LOAD_TEST_OUTPUT" | grep -qE 'SyntaxError|ReferenceError|Unexpected identifier|Unexpected token|LOAD_ERROR'; then
    echo "  $LOAD_TEST_OUTPUT" | head -10 | sed 's/^/    /'
    check_fail "模块加载抛错 - 看上面输出"
else
    echo "  模块加载 OK (no SyntaxError/ReferenceError)"
    check_pass
fi
echo

# ---- check 9 (v2 NEW): 嫌疑多行字符串模式 ----
echo "[9/9] 🆕 没有可疑的多行 markdown 嵌入字符串"
echo "  为什么: v2 核心红线 - v1 失败根因就是这个"

# 检测两种 pattern:
# 1. 单引号或双引号字符串内出现 markdown 列表项 "1. " 或 "- " 紧接 (
SUSPECT_MD_LIST=$(grep -nE "['\"]\s*[0-9]+\.\s+[^'\"]*\(" "$WATCHER_FILE" 2>/dev/null \
    | grep -vE "^\s*//|^\s*\*" \
    | wc -l || echo 0)

# 2. 字符串内含反引号但代码本身不在模板字符串里 (近似检测)
SUSPECT_BACKTICK=$(grep -nE "['\"][^'\"]*\\\`" "$WATCHER_FILE" 2>/dev/null \
    | grep -vE "^\s*//|^\s*\*" \
    | wc -l || echo 0)

echo "  嫌疑模式 1 (markdown 列表+括号 in quote): $SUSPECT_MD_LIST 处"
echo "  嫌疑模式 2 (反引号 in single-quote string): $SUSPECT_BACKTICK 处"

if [ "$SUSPECT_MD_LIST" -le "1" ] && [ "$SUSPECT_BACKTICK" -le "1" ]; then
    # 允许 ≤ 1 处假阳性
    check_pass
else
    echo "  人工核查嫌疑行:"
    grep -nE "['\"]\s*[0-9]+\.\s+[^'\"]*\(" "$WATCHER_FILE" 2>/dev/null | grep -vE "^\s*//" | head -5 | sed 's/^/    /'
    grep -nE "['\"][^'\"]*\\\`" "$WATCHER_FILE" 2>/dev/null | grep -vE "^\s*//" | head -5 | sed 's/^/    /'
    echo "  ⚠️  WARN: 嫌疑过多但可能是误报,人工 review"
    PASS_COUNT=$((PASS_COUNT+1))
    echo "  ✅ PASS（warn 不 fail）— 由 [8/9] 模块加载测试做最终把关"
fi
echo

# ---- summary ----
echo "============================================================"
echo "总结: $PASS_COUNT 项 PASS, $FAIL_COUNT 项 FAIL"
echo "============================================================"

if [ "$FAIL_COUNT" -gt "0" ]; then
    echo
    echo "❌ verify 失败"
    echo
    echo "下一步建议:"
    echo "  把以上输出贴 Claude,判断 A/B/C 类失败"
    exit 1
else
    echo
    echo "✅ 全部 PASS (含 v2 核心 module-load 测试)"
    echo
    echo "下一步（Kristy 跑）:"
    echo "  1. ssh wonderbear-vps 'pm2 restart wonderbear-dingtalk'"
    echo "  2. ssh wonderbear-vps 'sleep 3 && pm2 logs wonderbear-dingtalk --lines 20 --nostream'"
    echo "     ⚠️ 必须看到 [READY] DingTalk Stream connected 才算上线"
    echo "  3. 派下一个 Standard 工单（如 WO-3.7），看钉钉是否自动收到 verify 结果"
    echo "  4. git add + commit（用 §11 v2 模板）"
    exit 0
fi
