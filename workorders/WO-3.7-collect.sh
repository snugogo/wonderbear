#!/bin/bash
# WO-3.7 collect.sh — 拉 Factory 工作产出
# 用法: ssh wonderbear-vps "bash /opt/wonderbear/workorders/WO-3.7-collect.sh"

WO_ID="WO-3.7"
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

echo "[2/4] 最新 droid-run .log 完整内容"
echo "----------------------------------------"
if [ -d "$DROID_RUNS_DIR" ]; then
    LATEST_LOG=$(ls -t "$DROID_RUNS_DIR"/*.log 2>/dev/null | head -1)
    if [ -n "$LATEST_LOG" ]; then
        echo "文件: $LATEST_LOG"
        echo "大小: $(wc -l < "$LATEST_LOG") 行 / $(wc -c < "$LATEST_LOG") 字节"
        echo
        cat "$LATEST_LOG"
    else
        echo "未匹配: droid-runs/ 下无 .log"
    fi
else
    echo "未匹配: droid-runs/ 不存在"
fi
echo

echo "[3/4] 最近 3 个 done/ 报告"
echo "----------------------------------------"
if [ -d "$DONE_DIR" ]; then
    ls -lt "$DONE_DIR"/*.md 2>/dev/null | head -4
else
    echo "未匹配: $DONE_DIR 不存在"
fi
echo

echo "[4/4] 最新 done/ 匹配 $WO_ID 的 .md"
echo "----------------------------------------"
if [ -d "$DONE_DIR" ]; then
    MATCHED=$(ls -t "$DONE_DIR"/WO-3.7-report.md 2>/dev/null | head -1)
    if [ -n "$MATCHED" ] && [ -f "$MATCHED" ]; then
        echo "文件: $MATCHED"
        echo "大小: $(wc -l < "$MATCHED") 行"
        echo
        cat "$MATCHED"
    else
        FALLBACK=$(ls -t "$DONE_DIR"/ 2>/dev/null | grep -iE 'wo[\-]?3\.7' | grep -v 'processed' | head -1)
        if [ -n "$FALLBACK" ]; then
            echo "(fallback) 文件: $DONE_DIR/$FALLBACK"
            cat "$DONE_DIR/$FALLBACK"
        else
            echo "未匹配: done/ 下无 $WO_ID 报告"
        fi
    fi
else
    echo "未匹配: done/ 不存在"
fi
echo

echo "============================================================"
echo "collect.sh 完"
echo "下一步: bash /opt/wonderbear/workorders/$WO_ID-verify.sh"
echo "============================================================"
