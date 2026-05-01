#!/bin/bash
# WO-3.8 collect.sh — 拉 Factory 工作产出
# 用法: ssh wonderbear-vps "bash /opt/wonderbear/workorders/WO-3.8-collect.sh"

WO_ID="WO-3.8"
DROID_RUNS_DIR="/opt/wonderbear/coordination/droid-runs"
DONE_DIR="/opt/wonderbear/coordination/done"

echo "============================================================"
echo "$WO_ID collect.sh — Factory 工作产出"
echo "时间: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "============================================================"
echo

echo "[1/4] 最近 3 个 droid-runs"
echo "----------------------------------------"
if [ -d "$DROID_RUNS_DIR" ]; then
    ls -lt "$DROID_RUNS_DIR" 2>/dev/null | head -4
else
    echo "未匹配: $DROID_RUNS_DIR 不存在"
fi
echo

echo "[2/4] 最新 droid-run .log"
echo "----------------------------------------"
if [ -d "$DROID_RUNS_DIR" ]; then
    LATEST_LOG=$(ls -t "$DROID_RUNS_DIR"/*.log 2>/dev/null | head -1)
    if [ -n "$LATEST_LOG" ]; then
        echo "文件: $LATEST_LOG"
        echo "大小: $(wc -l < "$LATEST_LOG") 行"
        echo
        cat "$LATEST_LOG"
    else
        echo "未匹配: 无 .log"
    fi
fi
echo

echo "[3/4] 最近 3 个 done/ 报告"
echo "----------------------------------------"
ls -lt "$DONE_DIR"/*.md 2>/dev/null | head -4
echo

echo "[4/4] 最新 WO-3.8 报告"
echo "----------------------------------------"
MATCHED=$(ls -t "$DONE_DIR"/WO-3.8-report.md 2>/dev/null | head -1)
if [ -n "$MATCHED" ] && [ -f "$MATCHED" ]; then
    echo "文件: $MATCHED"
    echo "大小: $(wc -l < "$MATCHED") 行"
    echo
    cat "$MATCHED"
else
    echo "未匹配: 无 $WO_ID 报告"
fi
echo

echo "============================================================"
echo "collect.sh 完"
echo "下一步: bash /opt/wonderbear/workorders/$WO_ID-verify.sh"
echo "============================================================"
