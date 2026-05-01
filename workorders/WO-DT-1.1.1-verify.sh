#!/bin/bash
# ============================================================
# WO-DT-1.1.1 §9.1 自动验证脚本
# 用途: 验证 done 状态前置检查改造是否到位
# 用法: ssh wonderbear-vps "bash /opt/wonderbear/workorders/WO-DT-1.1.1-verify.sh"
# 退出码: 0 = 全过, 非 0 = 至少一项失败
# ============================================================

set -u

BOT_DIR="/opt/wonderbear/dingtalk-bot"
DISPATCH="$BOT_DIR/src/factory-dispatch.js"
ROUTER="$BOT_DIR/src/command-router.js"
PASS=0
FAIL=0
RESULTS=()

G='\033[0;32m'
R='\033[0;31m'
Y='\033[0;33m'
N='\033[0m'

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
echo " WO-DT-1.1.1 §9.1 自动验证 ($(date '+%Y-%m-%d %H:%M:%S'))"
echo " 改造内容: done 状态前置检查（修复 ack/done 矛盾）"
echo "════════════════════════════════════════════════════════"

# ─────────────────────────────────────────────────────────
# [1/6] factory-dispatch.js 中 checkAlreadyDone 函数存在
# 为什么: 改动 1 抽出新函数让 router 能调用
# ─────────────────────────────────────────────────────────
echo ""
echo "── [1/6] checkAlreadyDone 函数定义 ──────────────────────"
HAS_FUNC=$(safe_grep_count "function checkAlreadyDone(workorderId)" "$DISPATCH")
check "checkAlreadyDone 函数定义" "1" "$HAS_FUNC" "应有: function checkAlreadyDone(workorderId) {"

if [ "$HAS_FUNC" -gt 0 ]; then
    echo "  实际函数定义:"
    grep -n "function checkAlreadyDone" "$DISPATCH" 2>/dev/null | head -3 | sed 's/^/    /'
fi

# ─────────────────────────────────────────────────────────
# [2/6] factory-dispatch.js 中 module.exports 暴露 checkAlreadyDone
# 为什么: 改动 2 必须 export 才能让 router 用
# ─────────────────────────────────────────────────────────
echo ""
echo "── [2/6] module.exports 暴露 checkAlreadyDone ────────────"
EXPORT_OK=$(safe_grep_count "checkAlreadyDone," "$DISPATCH")
check "module.exports 包含 checkAlreadyDone" "1" "$EXPORT_OK" "应在 module.exports = { ... } 块里"

if [ "$EXPORT_OK" -gt 0 ]; then
    echo "  exports 行预览:"
    grep -n "checkAlreadyDone," "$DISPATCH" 2>/dev/null | head -3 | sed 's/^/    /'
fi

# ─────────────────────────────────────────────────────────
# [3/6] command-router.js 中调用 checkAlreadyDone
# 为什么: 改动 3 必须 router 真的调它，否则 done 检查没生效
# ─────────────────────────────────────────────────────────
echo ""
echo "── [3/6] router 调用 checkAlreadyDone ───────────────────"
ROUTER_CALL=$(safe_grep_count "factoryDispatch.checkAlreadyDone" "$ROUTER")
check "router 调用 factoryDispatch.checkAlreadyDone" "1" "$ROUTER_CALL" "应有: factoryDispatch.checkAlreadyDone(r.id)"

if [ "$ROUTER_CALL" -gt 0 ]; then
    echo "  实际调用行:"
    grep -n "factoryDispatch.checkAlreadyDone" "$ROUTER" 2>/dev/null | head -3 | sed 's/^/    /'
fi

# ─────────────────────────────────────────────────────────
# [4/6] router 中 done 检查在 ack 之前（行号比较）
# 为什么: 必须 done 在 ack 前执行，否则 bug 没修
# 关键检查: line(checkAlreadyDone) < line(ACK-DISPATCH)
# ─────────────────────────────────────────────────────────
echo ""
echo "── [4/6] done 检查在 ack 之前 ────────────────────────────"
DONE_LINE=$(grep -n "factoryDispatch.checkAlreadyDone" "$ROUTER" 2>/dev/null | head -1 | cut -d: -f1)
ACK_LINE=$(grep -n "ACK-DISPATCH" "$ROUTER" 2>/dev/null | head -1 | cut -d: -f1)

if [ -z "$DONE_LINE" ] || [ -z "$ACK_LINE" ]; then
    echo -e "  ${R}❌ 无法定位 done 或 ack 行号${N}"
    echo "     done line: ${DONE_LINE:-未找到}"
    echo "     ack line:  ${ACK_LINE:-未找到}"
    FAIL=$((FAIL+1))
    RESULTS+=("FAIL: done/ack 行号定位失败")
else
    echo "  done 检查行号: $DONE_LINE"
    echo "  ack 触发行号:  $ACK_LINE"
    if [ "$DONE_LINE" -lt "$ACK_LINE" ]; then
        echo -e "  ${G}✅ done 在 ack 之前 ($DONE_LINE < $ACK_LINE)${N}"
        PASS=$((PASS+1))
        RESULTS+=("PASS: done 检查在 ack 之前")
    else
        echo -e "  ${R}❌ done 在 ack 之后 ($DONE_LINE >= $ACK_LINE) — bug 未修${N}"
        FAIL=$((FAIL+1))
        RESULTS+=("FAIL: done 应在 ack 之前 (got: done=$DONE_LINE ack=$ACK_LINE)")
    fi
fi

# ─────────────────────────────────────────────────────────
# [5/6] wodt111-pre 备份锚点
# 为什么: §4 备份纪律
# ─────────────────────────────────────────────────────────
echo ""
echo "── [5/6] wodt111-pre 备份锚点 ────────────────────────────"
DISPATCH_BAK="$DISPATCH.backup-2026-04-30-wodt111-pre"
ROUTER_BAK="$ROUTER.backup-2026-04-30-wodt111-pre"

DISPATCH_BAK_OK=0
ROUTER_BAK_OK=0
[ -f "$DISPATCH_BAK" ] && DISPATCH_BAK_OK=1
[ -f "$ROUTER_BAK" ] && ROUTER_BAK_OK=1
TOTAL_BAK=$((DISPATCH_BAK_OK + ROUTER_BAK_OK))

check "wodt111-pre 备份文件数" "2" "$TOTAL_BAK" "应有 dispatch + router 各一个"
if [ "$DISPATCH_BAK_OK" -eq 1 ]; then
    echo -e "    ${G}✓ dispatch 备份: $DISPATCH_BAK${N}"
else
    echo -e "    ${R}✗ dispatch 备份缺失${N}"
fi
if [ "$ROUTER_BAK_OK" -eq 1 ]; then
    echo -e "    ${G}✓ router 备份:   $ROUTER_BAK${N}"
else
    echo -e "    ${R}✗ router 备份缺失${N}"
fi

# 顺便确认 WO-DT-1.1 的 wodt11-pre 锚点还在（不能被覆盖）
echo ""
echo "  附加检查: WO-DT-1.1 锚点 (wodt11-pre) 应仍存在:"
WODT11_DISPATCH=0
WODT11_ROUTER=0
[ -f "$DISPATCH.backup-2026-04-30-wodt11-pre" ] && WODT11_DISPATCH=1
[ -f "$ROUTER.backup-2026-04-30-wodt11-pre" ] && WODT11_ROUTER=1
echo "    wodt11-pre dispatch: $([ $WODT11_DISPATCH -eq 1 ] && echo "✓" || echo "✗ (被覆盖了！)")"
echo "    wodt11-pre router:   $([ $WODT11_ROUTER -eq 1 ] && echo "✓" || echo "✗ (被覆盖了！)")"

# ─────────────────────────────────────────────────────────
# [6/6] node --check 双语法校验
# ─────────────────────────────────────────────────────────
echo ""
echo "── [6/6] node --check 语法校验 ──────────────────────────"

cd "$BOT_DIR" || { echo -e "${R}❌ cannot cd to $BOT_DIR${N}"; exit 99; }

DISPATCH_CHECK=$(node --check src/factory-dispatch.js 2>&1)
DISPATCH_CHECK_RC=$?
ROUTER_CHECK=$(node --check src/command-router.js 2>&1)
ROUTER_CHECK_RC=$?

CHECK_PASS=0
if [ "$DISPATCH_CHECK_RC" -eq 0 ]; then
    echo -e "  ${G}✓ factory-dispatch.js 语法 OK${N}"
    CHECK_PASS=$((CHECK_PASS+1))
else
    echo -e "  ${R}✗ factory-dispatch.js 语法错误:${N}"
    echo "$DISPATCH_CHECK" | sed 's/^/    /'
fi

if [ "$ROUTER_CHECK_RC" -eq 0 ]; then
    echo -e "  ${G}✓ command-router.js 语法 OK${N}"
    CHECK_PASS=$((CHECK_PASS+1))
else
    echo -e "  ${R}✗ command-router.js 语法错误:${N}"
    echo "$ROUTER_CHECK" | sed 's/^/    /'
fi

check "node --check 双通过" "2" "$CHECK_PASS" "两个 .js 文件应都 exit 0"

# ─────────────────────────────────────────────────────────
# 附加: pm2 状态参考
# ─────────────────────────────────────────────────────────
echo ""
echo "── [附加] dingtalk-bot pm2 状态参考 ──────────────────────"
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
echo -e "  ${Y}注: pm2 reload 由 Kristy 手动执行${N}"

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
    echo "然后钉钉测试:"
    echo "  测试 A: 钉钉发 '派 WO-DT-1.1' (已完成的工单)"
    echo "    预期: 只收到 ❌ 工单已完成... (不应看到 📥 ack)"
    echo "  测试 B: 钉钉发 '派 WO-DT-1.1.1' (未完成工单)"
    echo "    预期: 1 秒内看到 📥 已收到... 然后 ✅ 已派 Factory"
    exit 0
else
    echo -e "${R}━━━━━ ❌ 有 $FAIL 项失败，禁止 pm2 reload ━━━━━${N}"
    echo ""
    echo "排查思路:"
    echo "  1. 看 [失败项] 具体是哪一步"
    echo "  2. 复用工单 + 失败输出，让 Factory 重做"
    echo "  3. 或回滚: cp .backup-2026-04-30-wodt111-pre 覆盖回去"
    exit 1
fi
