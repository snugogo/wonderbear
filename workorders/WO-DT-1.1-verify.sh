#!/bin/bash
# ============================================================
# WO-DT-1.1 §9.1 自动验证脚本 (B 范围: 4 条慢命令都加 ack)
# 用途: 验证 dingtalk-bot ack 改造是否到位
# 用法: ssh wonderbear-vps "bash /opt/wonderbear/workorders/WO-DT-1.1-verify.sh"
# 退出码: 0 = 全过, 非 0 = 至少一项失败
# ============================================================

set -u

BOT_DIR="/opt/wonderbear/dingtalk-bot"
ROUTER="$BOT_DIR/src/command-router.js"
INDEX="$BOT_DIR/src/index.js"
PASS=0
FAIL=0
RESULTS=()

G='\033[0;32m'
R='\033[0;31m'
Y='\033[0;33m'
N='\033[0m'

# 安全 grep -c
safe_grep_count() {
    local pattern="$1"
    local file="$2"
    if [ ! -f "$file" ]; then
        echo "FILE_MISSING"
        return
    fi
    local count
    count=$(grep -c "$pattern" "$file" 2>/dev/null)
    echo "${count:-0}"
}

check() {
    local name="$1"
    local expected="$2"
    local actual="$3"
    local detail="$4"

    if [ "$expected" = "$actual" ]; then
        echo -e "  ${G}✅ $name${N}"
        echo "     预期: $expected | 实际: $actual"
        [ -n "$detail" ] && echo "     $detail"
        PASS=$((PASS+1))
        RESULTS+=("PASS: $name")
    else
        echo -e "  ${R}❌ $name${N}"
        echo "     预期: $expected | 实际: $actual"
        [ -n "$detail" ] && echo "     $detail"
        FAIL=$((FAIL+1))
        RESULTS+=("FAIL: $name (expect=$expected got=$actual)")
    fi
}

echo "════════════════════════════════════════════════════════"
echo " WO-DT-1.1 §9.1 自动验证 ($(date '+%Y-%m-%d %H:%M:%S'))"
echo " 改造范围: 派/sync/learn/status-refresh 4 条慢命令加 ack"
echo "════════════════════════════════════════════════════════"

# ─────────────────────────────────────────────────────────
# [1/8] handleDispatch 函数升级到 4 参数
# 为什么: 改动 1 要求 handleDispatch(content, sessionWebhook, atUserId, replyFn)
# ─────────────────────────────────────────────────────────
echo ""
echo "── [1/8] handleDispatch 4 参数签名 ──────────────────────"
HAS_4_PARAMS=$(grep -c "function handleDispatch(content, sessionWebhook" "$ROUTER" 2>/dev/null || echo "0")
check "handleDispatch 4 参数签名" "1" "$HAS_4_PARAMS" "应有: function handleDispatch(content, sessionWebhook, atUserId, replyFn)"

echo "  实际函数签名:"
grep -n "function handleDispatch" "$ROUTER" 2>/dev/null | head -3 | sed 's/^/    /' || echo "    (未找到)"

# ─────────────────────────────────────────────────────────
# [2/8] [ACK-DISPATCH] 错误日志标记
# 为什么: 改动 1 要求 ack 失败时打 console.error('[ACK-DISPATCH] failed:', ...)
# ─────────────────────────────────────────────────────────
echo ""
echo "── [2/8] 派单 ack 日志标记 ──────────────────────────────"
ACK_DISPATCH=$(safe_grep_count 'ACK-DISPATCH' "$ROUTER")
check "[ACK-DISPATCH] 标记存在" "1" "$ACK_DISPATCH" "用于派单 ack 失败时调试"

# ─────────────────────────────────────────────────────────
# [3/8] route 函数升级到 4 参数
# 为什么: 改动 2 要求 route 透传 ack 参数到 handleDispatch
# ─────────────────────────────────────────────────────────
echo ""
echo "── [3/8] route 函数 4 参数签名 ──────────────────────────"
ROUTE_4_PARAMS=$(grep -c "function route(content, sessionWebhook" "$ROUTER" 2>/dev/null || echo "0")
check "route 4 参数签名" "1" "$ROUTE_4_PARAMS" "应有: function route(content, sessionWebhook, atUserId, replyFn)"

echo "  实际函数签名:"
grep -n "function route" "$ROUTER" 2>/dev/null | head -3 | sed 's/^/    /' || echo "    (未找到)"

# ─────────────────────────────────────────────────────────
# [4/8] index.js route 调用处传 4 参数
# 为什么: 改动 3 要求 sessionWebhook / senderStaffId / reply 传过去
# ─────────────────────────────────────────────────────────
echo ""
echo "── [4/8] index.js route 调用 4 参数 ─────────────────────"
INDEX_4_ARGS=$(grep -c "commandRouter.route(effectiveContent, sessionWebhook" "$INDEX" 2>/dev/null || echo "0")
check "index.js route 4 参数调用" "1" "$INDEX_4_ARGS" "应有: commandRouter.route(effectiveContent, sessionWebhook, senderStaffId, reply)"

echo "  实际调用行:"
grep -n "commandRouter.route" "$INDEX" 2>/dev/null | head -3 | sed 's/^/    /' || echo "    (未找到)"

# ─────────────────────────────────────────────────────────
# [5/8] /sync 提前 ack
# 为什么: 改动 4 要求 runClaude 之前发 [ACK-SYNC]
# ─────────────────────────────────────────────────────────
echo ""
echo "── [5/8] /sync 命令 ack ────────────────────────────────"
ACK_SYNC=$(safe_grep_count 'ACK-SYNC' "$INDEX")
check "[ACK-SYNC] 标记存在" "1" "$ACK_SYNC" "用于 /sync ack 失败时调试"
if [ "$ACK_SYNC" -gt 0 ]; then
    echo "  ack 行预览:"
    grep -n 'ACK-SYNC\|正在整理进度' "$INDEX" 2>/dev/null | head -3 | sed 's/^/    /'
fi

# ─────────────────────────────────────────────────────────
# [6/8] /learn 提前 ack
# 为什么: 改动 5 要求 runClaude 之前发 [ACK-LEARN]
# ─────────────────────────────────────────────────────────
echo ""
echo "── [6/8] /learn 命令 ack ───────────────────────────────"
ACK_LEARN=$(safe_grep_count 'ACK-LEARN' "$INDEX")
check "[ACK-LEARN] 标记存在" "1" "$ACK_LEARN" "用于 /learn ack 失败时调试"
if [ "$ACK_LEARN" -gt 0 ]; then
    echo "  ack 行预览:"
    grep -n 'ACK-LEARN\|正在整理教训' "$INDEX" 2>/dev/null | head -3 | sed 's/^/    /'
fi

# ─────────────────────────────────────────────────────────
# [7/8] /status-refresh 提前 ack
# 为什么: 改动 6 要求 scanFactoryReports 之前发 [ACK-REFRESH]
# ─────────────────────────────────────────────────────────
echo ""
echo "── [7/8] /status-refresh 命令 ack ──────────────────────"
ACK_REFRESH=$(safe_grep_count 'ACK-REFRESH' "$INDEX")
check "[ACK-REFRESH] 标记存在" "1" "$ACK_REFRESH" "用于 /status-refresh ack 失败时调试"
if [ "$ACK_REFRESH" -gt 0 ]; then
    echo "  ack 行预览:"
    grep -n 'ACK-REFRESH\|正在扫描' "$INDEX" 2>/dev/null | head -3 | sed 's/^/    /'
fi

# ─────────────────────────────────────────────────────────
# [8/8] 备份文件就位
# 为什么: §4 备份纪律要求改动前 cp 锚点
# ─────────────────────────────────────────────────────────
echo ""
echo "── [8/8] wodt11-pre 备份锚点 ────────────────────────────"
ROUTER_BAK="$ROUTER.backup-2026-04-30-wodt11-pre"
INDEX_BAK="$INDEX.backup-2026-04-30-wodt11-pre"

ROUTER_BAK_OK=0
INDEX_BAK_OK=0
[ -f "$ROUTER_BAK" ] && ROUTER_BAK_OK=1
[ -f "$INDEX_BAK" ] && INDEX_BAK_OK=1
TOTAL_BAK=$((ROUTER_BAK_OK + INDEX_BAK_OK))

check "wodt11-pre 备份文件数" "2" "$TOTAL_BAK" "应有 router + index 各一个"
if [ "$ROUTER_BAK_OK" -eq 1 ]; then
    echo -e "    ${G}✓ router 备份: $ROUTER_BAK${N}"
else
    echo -e "    ${R}✗ router 备份缺失${N}"
fi
if [ "$INDEX_BAK_OK" -eq 1 ]; then
    echo -e "    ${G}✓ index 备份:  $INDEX_BAK${N}"
else
    echo -e "    ${R}✗ index 备份缺失${N}"
fi

# ─────────────────────────────────────────────────────────
# 附加: node --check 双语法校验
# 为什么: §5 dry-run 必须通过才能 pm2 reload
# ─────────────────────────────────────────────────────────
echo ""
echo "── [附加] node --check 语法校验 ──────────────────────────"

cd "$BOT_DIR" || { echo -e "${R}❌ cannot cd to $BOT_DIR${N}"; exit 99; }

ROUTER_CHECK=$(node --check src/command-router.js 2>&1)
ROUTER_CHECK_RC=$?
INDEX_CHECK=$(node --check src/index.js 2>&1)
INDEX_CHECK_RC=$?

if [ "$ROUTER_CHECK_RC" -eq 0 ]; then
    echo -e "  ${G}✓ command-router.js 语法 OK${N}"
else
    echo -e "  ${R}✗ command-router.js 语法错误:${N}"
    echo "$ROUTER_CHECK" | sed 's/^/    /'
    FAIL=$((FAIL+1))
    RESULTS+=("FAIL: command-router.js 语法错误")
fi

if [ "$INDEX_CHECK_RC" -eq 0 ]; then
    echo -e "  ${G}✓ index.js 语法 OK${N}"
else
    echo -e "  ${R}✗ index.js 语法错误:${N}"
    echo "$INDEX_CHECK" | sed 's/^/    /'
    FAIL=$((FAIL+1))
    RESULTS+=("FAIL: index.js 语法错误")
fi

# ─────────────────────────────────────────────────────────
# 附加: pm2 当前状态参考
# ─────────────────────────────────────────────────────────
echo ""
echo "── [附加] dingtalk-bot pm2 状态参考 (不计入验证) ─────────"
pm2 jlist 2>/dev/null | python3 -c "
import json, sys, time
try:
    procs = json.load(sys.stdin)
    for p in procs:
        if p['name'] == 'wonderbear-dingtalk':
            env = p.get('pm2_env', {})
            print(f'    name: {p[\"name\"]}')
            print(f'    status: {env.get(\"status\", \"?\")}')
            print(f'    restart_time: {env.get(\"restart_time\", \"?\")}')
            uptime_ms = env.get('pm_uptime', 0)
            if uptime_ms:
                age_min = int((time.time() * 1000 - uptime_ms) / 60000)
                print(f'    age: {age_min} min')
except Exception as e:
    print(f'    (无法解析: {e})')
" 2>/dev/null || echo "    (pm2 jlist 失败)"

echo ""
echo -e "  ${Y}注: pm2 reload 由 Kristy 手动执行，本脚本不重启进程${N}"

# ─────────────────────────────────────────────────────────
# 汇总
# ─────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════"
echo " 验证汇总"
echo "════════════════════════════════════════════════════════"
echo "  通过: $PASS"
echo "  失败: $FAIL"
echo ""
for r in "${RESULTS[@]}"; do
    echo "  $r"
done
echo ""

if [ "$FAIL" -eq 0 ]; then
    echo -e "${G}━━━━━ ✅ §9.1 全部通过，可进入 §9.3 (pm2 reload) ━━━━━${N}"
    echo ""
    echo "下一步 (Kristy 手动):"
    echo "  ssh wonderbear-vps \"pm2 reload wonderbear-dingtalk && sleep 3 && pm2 logs wonderbear-dingtalk --lines 20 --nostream\""
    echo ""
    echo "然后钉钉测 4 条命令，每条预期 1 秒内看到 '📥 已收到':"
    echo "  • 派 <任意工单>"
    echo "  • /sync 测试"
    echo "  • /learn 测试"
    echo "  • /status-refresh"
    exit 0
else
    echo -e "${R}━━━━━ ❌ 有 $FAIL 项失败，禁止 pm2 reload ━━━━━${N}"
    echo ""
    echo "排查思路:"
    echo "  1. 看 [失败项] 具体是哪一步"
    echo "  2. 复用工单 + 失败输出，让 Factory 重做"
    echo "  3. 或从备份回滚: cp .backup-2026-04-30-wodt11-pre 覆盖回去"
    exit 1
fi
