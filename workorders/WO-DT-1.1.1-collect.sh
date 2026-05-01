#!/bin/bash
# ============================================================
# WO-DT-1.1.1 报告收集脚本
# 用法: ssh wonderbear-vps "bash /opt/wonderbear/workorders/WO-DT-1.1.1-collect.sh"
# ============================================================

set -u

echo "════════════════════════════════════════════════════════"
echo " WO-DT-1.1.1 报告收集 ($(date '+%Y-%m-%d %H:%M:%S'))"
echo "════════════════════════════════════════════════════════"

# ─────────────────────────────────────────────────────────
# [1/4] 最近 3 个 Factory 任务
# ─────────────────────────────────────────────────────────
echo ""
echo "── [1/4] 最近 3 个 Factory 任务 ─────────────────────────"
DROID_DIR="/opt/wonderbear/coordination/droid-runs"
if [ -d "$DROID_DIR" ]; then
    ls -lt "$DROID_DIR" 2>/dev/null | head -4
else
    echo "  ⚠ $DROID_DIR 不存在"
fi
echo ""
echo "  /tmp/ 下 droid log:"
ls -lt /tmp/droid-*.log 2>/dev/null | head -3 || echo "  (无)"

# ─────────────────────────────────────────────────────────
# [2/4] 最新 Factory log 完整内容（优先 WO-DT-1.1.1 相关）
# ─────────────────────────────────────────────────────────
echo ""
echo "── [2/4] 最新 Factory 任务完整 log ───────────────────────"
LATEST_LOG=$(ls -t /tmp/droid-*WO-DT-1.1.1*.log 2>/dev/null | head -1)
if [ -z "$LATEST_LOG" ]; then
    LATEST_LOG=$(ls -t "$DROID_DIR"/*.log 2>/dev/null | head -1)
fi
if [ -z "$LATEST_LOG" ]; then
    LATEST_LOG=$(ls -t /tmp/droid-*.log 2>/dev/null | head -1)
fi

if [ -n "$LATEST_LOG" ]; then
    echo "  文件: $LATEST_LOG"
    echo "  大小: $(wc -c < "$LATEST_LOG") 字节, $(wc -l < "$LATEST_LOG") 行"
    echo "  ──────────────────────────────────────────────────"
    cat "$LATEST_LOG"
    echo "  ──────────────────────────────────────────────────"
else
    echo "  ⚠ 未找到任何 .log 文件"
fi

# ─────────────────────────────────────────────────────────
# [3/4] coordination/done/ 下最新报告
# ─────────────────────────────────────────────────────────
echo ""
echo "── [3/4] 最近 3 个完成报告 (done/) ──────────────────────"
DONE_DIR="/opt/wonderbear/coordination/done"
if [ -d "$DONE_DIR" ]; then
    ls -lt "$DONE_DIR" 2>/dev/null | head -4
else
    echo "  ⚠ $DONE_DIR 不存在"
fi

# ─────────────────────────────────────────────────────────
# [4/4] WO-DT-1.1.1 完成报告
# ─────────────────────────────────────────────────────────
echo ""
echo "── [4/4] WO-DT-1.1.1 完成报告 ───────────────────────────"
WODT_REPORT=$(ls -t "$DONE_DIR"/*WO-DT-1.1.1*.md 2>/dev/null | head -1)
if [ -z "$WODT_REPORT" ]; then
    WODT_REPORT="$DONE_DIR/WO-DT-1.1.1-report.md"
    [ -f "$WODT_REPORT" ] || WODT_REPORT=""
fi

if [ -n "$WODT_REPORT" ]; then
    echo "  文件: $WODT_REPORT"
    echo "  ──────────────────────────────────────────────────"
    cat "$WODT_REPORT"
    echo "  ──────────────────────────────────────────────────"
else
    echo "  ⚠ done/ 下没有 WO-DT-1.1.1 报告（Factory 可能把报告写在 stdout，看 [2/4] 段）"
fi

echo ""
echo "════════════════════════════════════════════════════════"
echo " 收集完成"
echo "════════════════════════════════════════════════════════"
echo ""
echo "下一步: 跑 verify"
echo "  ssh wonderbear-vps \"bash /opt/wonderbear/workorders/WO-DT-1.1.1-verify.sh\""
