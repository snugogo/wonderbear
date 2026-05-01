#!/bin/bash
# WO-3.6 collect.sh — 拉 Factory 工作产出
# 用法:
#   ssh wonderbear-vps "bash /opt/wonderbear/workorders/WO-3.6-collect.sh"
#
# 设计原则(SPEC v2 §collect.sh):
#   - 4 段输出
#   - droid-runs(stdout log)+ done/ 报告两边都看
#   - 没有匹配显示"未匹配",不退到无关文件

WO_ID="WO-3.6"
DROID_RUNS_DIR="/opt/wonderbear/coordination/droid-runs"
DONE_DIR="/opt/wonderbear/coordination/done"

echo "============================================================"
echo "$WO_ID collect.sh — Factory 工作产出"
echo "时间: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "============================================================"
echo

# ---- [1/4] 最近 3 个 droid-runs ----
echo "[1/4] 最近 3 个 droid-runs"
echo "----------------------------------------"
if [ -d "$DROID_RUNS_DIR" ]; then
    ls -lt "$DROID_RUNS_DIR" 2>/dev/null | head -4
else
    echo "未匹配:$DROID_RUNS_DIR 目录不存在"
fi
echo

# ---- [2/4] 最新 .log 完整内容 ----
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
        echo "未匹配:droid-runs/ 下无 .log 文件"
    fi
else
    echo "未匹配:droid-runs/ 目录不存在"
fi
echo

# ---- [3/4] 最近 3 个 done/ 报告 ----
echo "[3/4] 最近 3 个 done/ 报告"
echo "----------------------------------------"
if [ -d "$DONE_DIR" ]; then
    ls -lt "$DONE_DIR"/*.md 2>/dev/null | head -4
else
    echo "未匹配:$DONE_DIR 目录不存在"
fi
echo

# ---- [4/4] 最新 done/ 匹配 WO-3.6 的 .md 完整内容 ----
echo "[4/4] 最新 done/ 匹配 $WO_ID 的 .md"
echo "----------------------------------------"
if [ -d "$DONE_DIR" ]; then
    # 匹配 WO-3.6 / wo-3.6 / wo3.6 多种命名方式
    MATCHED=$(ls -t "$DONE_DIR"/*.md 2>/dev/null | xargs -I{} grep -l -E "WO-3\.6|wo-3\.6|wo3\.6" {} 2>/dev/null | head -1)
    if [ -n "$MATCHED" ]; then
        echo "文件: $MATCHED"
        echo "大小: $(wc -l < "$MATCHED") 行"
        echo
        cat "$MATCHED"
    else
        # fallback:按文件名匹配
        MATCHED_BY_NAME=$(ls -t "$DONE_DIR"/ 2>/dev/null | grep -iE 'wo[\-]?3\.6' | head -1)
        if [ -n "$MATCHED_BY_NAME" ]; then
            echo "(按文件名匹配)文件: $DONE_DIR/$MATCHED_BY_NAME"
            cat "$DONE_DIR/$MATCHED_BY_NAME"
        else
            echo "未匹配:done/ 下无 $WO_ID 相关报告"
            echo "(Factory 可能把报告写在 droid-runs log 里 — 看 [2/4])"
        fi
    fi
else
    echo "未匹配:done/ 目录不存在"
fi
echo

# ---- footer ----
echo "============================================================"
echo "collect.sh 完"
echo "下一步:运行 verify.sh"
echo "  ssh wonderbear-vps \"bash /opt/wonderbear/workorders/WO-3.6-verify.sh\""
echo "============================================================"
