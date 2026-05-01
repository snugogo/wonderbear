#!/bin/bash
# ============================================================
# WO-2 报告收集脚本
# 用途: 拉 Factory 最新 droid-runs log + 完成报告，一把输出
# 用法: ssh wonderbear-vps "bash -s" < WO-2-collect.sh
#       或 scp 上去后  ssh wonderbear-vps "bash /tmp/WO-2-collect.sh"
# ============================================================

set -u  # 引用未定义变量报错；不用 -e，因为有些 ls 找不到文件是正常情况

echo "════════════════════════════════════════════════════════"
echo " WO-2 报告收集 ($(date '+%Y-%m-%d %H:%M:%S'))"
echo "════════════════════════════════════════════════════════"

# ─────────────────────────────────────────────────────────
# 1. 最近 3 个 droid-runs (按时间倒序)
# ─────────────────────────────────────────────────────────
echo ""
echo "── [1/4] 最近 3 个 Factory 任务 ─────────────────────────"
ls -lt /opt/wonderbear/coordination/droid-runs/ 2>/dev/null | head -4 || echo "  ⚠ 目录不存在或为空"

# ─────────────────────────────────────────────────────────
# 2. 最新 droid-runs log 完整内容
# ─────────────────────────────────────────────────────────
echo ""
echo "── [2/4] 最新 Factory 任务完整 log ───────────────────────"
LATEST_LOG=$(ls -t /opt/wonderbear/coordination/droid-runs/*.log 2>/dev/null | head -1)
if [ -n "$LATEST_LOG" ]; then
    echo "  文件: $LATEST_LOG"
    echo "  大小: $(wc -c < "$LATEST_LOG") 字节, $(wc -l < "$LATEST_LOG") 行"
    echo "  ──────────────────────────────────────────────────"
    cat "$LATEST_LOG"
    echo "  ──────────────────────────────────────────────────"
else
    echo "  ⚠ 未找到 .log 文件"
fi

# ─────────────────────────────────────────────────────────
# 3. coordination/done/ 下最新 3 个完成报告
# ─────────────────────────────────────────────────────────
echo ""
echo "── [3/4] 最近 3 个完成报告 (done/) ──────────────────────"
ls -lt /opt/wonderbear/coordination/done/ 2>/dev/null | head -4 || echo "  ⚠ done/ 目录不存在"

# ─────────────────────────────────────────────────────────
# 4. 最新完成报告完整内容
# ─────────────────────────────────────────────────────────
echo ""
echo "── [4/4] 最新完成报告完整内容 ────────────────────────────"
LATEST_REPORT=$(ls -t /opt/wonderbear/coordination/done/*WO-2*.md 2>/dev/null | head -1)
if [ -z "$LATEST_REPORT" ]; then
    # 如果没有 WO-2 命名的，退回到最新任意 .md
    LATEST_REPORT=$(ls -t /opt/wonderbear/coordination/done/*.md 2>/dev/null | head -1)
fi
if [ -n "$LATEST_REPORT" ]; then
    echo "  文件: $LATEST_REPORT"
    echo "  ──────────────────────────────────────────────────"
    cat "$LATEST_REPORT"
    echo "  ──────────────────────────────────────────────────"
else
    echo "  ⚠ done/ 下没有 .md 报告"
fi

echo ""
echo "════════════════════════════════════════════════════════"
echo " 收集完成"
echo "════════════════════════════════════════════════════════"
