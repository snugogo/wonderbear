#!/bin/bash
# ============================================================
# WO-2 §9.1 自动验证脚本 (v2 - 修复 v1 的两个 bug)
# 修复:
#   1. grep -c 返回码 1 触发 || echo bug → 改用 safe_grep_count 函数
#   2. src/ 下 backup 检查 → 排除 wo2-pre 锚点（设计内保留）
#   3. 新增 .env 状态展示，供 §9.2 改 .env 时对照
# 用法: ssh wonderbear-vps "bash /opt/wonderbear/workorders/WO-2-verify.sh"
# 退出码: 0 = 全过, 非 0 = 至少一项失败
# ============================================================

set -u

SERVER_DIR="/opt/wonderbear/server-v7"
PASS=0
FAIL=0
RESULTS=()

G='\033[0;32m'
R='\033[0;31m'
Y='\033[0;33m'
N='\033[0m'

# 安全 grep -c：grep 无匹配返回码 1，会触发 || echo，导致输出多一行
# 这个函数确保只输出一个数字
safe_grep_count() {
    local pattern="$1"
    local file="$2"
    if [ ! -f "$file" ]; then
        echo "FILE_MISSING"
        return
    fi
    local count
    count=$(grep -c "$pattern" "$file" 2>/dev/null)
    # grep -c 即使无匹配也输出 0，只是返回码非 0
    # 所以 count 一定是数字（包括 0）
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
echo " WO-2 §9.1 自动验证 v2 ($(date '+%Y-%m-%d %H:%M:%S'))"
echo "════════════════════════════════════════════════════════"

# ─────────────────────────────────────────────────────────
# [1/5] services/asr.js 删除 'asr-whisper.*transcription=' 诊断 log
# ─────────────────────────────────────────────────────────
echo ""
echo "── [1/5] services/asr.js 删除诊断 log ───────────────────"
COUNT=$(safe_grep_count 'asr-whisper.*transcription=' "$SERVER_DIR/src/services/asr.js")
check "asr-whisper transcription log 已删除" "0" "$COUNT" "文件: src/services/asr.js"

# ─────────────────────────────────────────────────────────
# [2/5] routes/story.js audio dump ENV 守卫
# ─────────────────────────────────────────────────────────
echo ""
echo "── [2/5] routes/story.js audio dump ENV 开关 ────────────"
ENV_GUARD=$(grep -n "ASR_DUMP_ENABLED" "$SERVER_DIR/src/routes/story.js" 2>/dev/null || echo "")
if [ -n "$ENV_GUARD" ]; then
    echo -e "  ${G}✅ ASR_DUMP_ENABLED 守卫已添加${N}"
    echo "$ENV_GUARD" | sed 's/^/     /'
    PASS=$((PASS+1))
    RESULTS+=("PASS: routes/story.js ASR_DUMP_ENABLED")

    if echo "$ENV_GUARD" | grep -q "=== 'true'\|== 'true'"; then
        echo -e "     ${G}✓ 使用字符串 === 'true' 比较 (正确)${N}"
    else
        echo -e "     ${Y}⚠ 没看到 === 'true' 字符串比较，请人工确认${N}"
    fi
else
    echo -e "  ${R}❌ 没找到 ASR_DUMP_ENABLED 守卫${N}"
    FAIL=$((FAIL+1))
    RESULTS+=("FAIL: routes/story.js 没有 ASR_DUMP_ENABLED")
fi

# ─────────────────────────────────────────────────────────
# [3/5] src/ 下 backup 归档 - 排除 wo2-pre 锚点
# ─────────────────────────────────────────────────────────
echo ""
echo "── [3/5] src/ 下旧 backup 已归档 (wo2-pre 锚保留) ────────"

# 找所有 src/ 下的 backup 文件
ALL_BACKUPS=$(find "$SERVER_DIR/src" -name "*.backup-*" 2>/dev/null)
if [ -z "$ALL_BACKUPS" ]; then
    WO2_PRE_BACKUPS=""
    NON_WO2_BACKUPS=""
else
    WO2_PRE_BACKUPS=$(echo "$ALL_BACKUPS" | grep "wo2-pre" || true)
    NON_WO2_BACKUPS=$(echo "$ALL_BACKUPS" | grep -v "wo2-pre" || true)
fi

# 计数（处理空字符串）
if [ -z "$WO2_PRE_BACKUPS" ]; then
    WO2_PRE_COUNT=0
else
    WO2_PRE_COUNT=$(echo "$WO2_PRE_BACKUPS" | wc -l)
fi
if [ -z "$NON_WO2_BACKUPS" ]; then
    NON_WO2_COUNT=0
else
    NON_WO2_COUNT=$(echo "$NON_WO2_BACKUPS" | wc -l)
fi

# 期望 NON_WO2_COUNT = 0
check "src/ 下非 wo2-pre 的旧 backup" "0" "$NON_WO2_COUNT" "应已 mv 到 backups-archive/"
if [ "$NON_WO2_COUNT" -gt 0 ]; then
    echo "  残留:"
    echo "$NON_WO2_BACKUPS" | sed 's/^/    /'
fi

# 期望 wo2-pre = 3
check "src/ 下 wo2-pre 回滚锚点数" "3" "$WO2_PRE_COUNT" "应有 asr.js / story.js / env.js 各一份"
if [ -n "$WO2_PRE_BACKUPS" ]; then
    echo "  wo2-pre 锚点 (设计内保留):"
    echo "$WO2_PRE_BACKUPS" | sed 's/^/    /'
fi

# ─────────────────────────────────────────────────────────
# [4/5] backups-archive/2026-04/ 归档目录
# ─────────────────────────────────────────────────────────
echo ""
echo "── [4/5] backups-archive/2026-04/ 归档目录 ──────────────"
ARCHIVE_DIR="/opt/wonderbear/backups-archive/2026-04"
if [ -d "$ARCHIVE_DIR" ]; then
    ARCHIVE_COUNT=$(ls -1 "$ARCHIVE_DIR" 2>/dev/null | wc -l)
    echo -e "  ${G}✅ 归档目录存在${N}"
    echo "     文件数: $ARCHIVE_COUNT"
    echo "     列表 (按时间倒序):"
    ls -lt "$ARCHIVE_DIR" 2>/dev/null | tail -n +2 | head -15 | sed 's/^/       /'
    if [ "$ARCHIVE_COUNT" -gt 0 ]; then
        PASS=$((PASS+1))
        RESULTS+=("PASS: backups-archive 归档")
    else
        echo -e "  ${Y}⚠ 归档目录存在但为空${N}"
        FAIL=$((FAIL+1))
        RESULTS+=("FAIL: backups-archive 为空")
    fi
else
    echo -e "  ${R}❌ 归档目录不存在: $ARCHIVE_DIR${N}"
    FAIL=$((FAIL+1))
    RESULTS+=("FAIL: backups-archive 目录缺失")
fi

# ─────────────────────────────────────────────────────────
# [5/5] config/env.js 死字段清理
# ─────────────────────────────────────────────────────────
echo ""
echo "── [5/5] config/env.js 死字段清理 ────────────────────────"
DEAD_FIELDS=$(grep -nE 'STORAGE_TYPE|LOCAL_STORAGE_PATH|GEMINI_IMAGE_MODEL' "$SERVER_DIR/src/config/env.js" 2>/dev/null || true)
if [ -z "$DEAD_FIELDS" ]; then
    DEAD_COUNT=0
else
    DEAD_COUNT=$(echo "$DEAD_FIELDS" | wc -l)
fi
check "config/env.js 死字段引用数" "0" "$DEAD_COUNT" "应零匹配 STORAGE_TYPE/LOCAL_STORAGE_PATH/GEMINI_IMAGE_MODEL"
if [ -n "$DEAD_FIELDS" ]; then
    echo "  残留:"
    echo "$DEAD_FIELDS" | sed 's/^/    /'
fi

# ─────────────────────────────────────────────────────────
# 附加: .env 当前关键字段状态 (供 §9.2 改 .env 时对照)
# ─────────────────────────────────────────────────────────
echo ""
echo "── [附加] .env 当前关键字段状态 (§9.2 GUI 改 .env 参考) ──"

ENV_FILE="$SERVER_DIR/.env"

echo ""
echo "  死字段是否在 .env 中残留 (待你 GUI 删除):"
DEAD_IN_ENV=$(grep -nE '^STORAGE_TYPE=|^LOCAL_STORAGE_PATH=|^GEMINI_IMAGE_MODEL=' "$ENV_FILE" 2>/dev/null || true)
if [ -n "$DEAD_IN_ENV" ]; then
    echo -e "    ${Y}还在 .env 里 (待删):${N}"
    echo "$DEAD_IN_ENV" | sed 's/^/      /'
else
    echo -e "    ${G}.env 中已不存在${N}"
fi

echo ""
echo "  ASR_DUMP_ENABLED 是否已加到 .env (可选):"
ASR_DUMP=$(grep -nE '^ASR_DUMP_ENABLED=' "$ENV_FILE" 2>/dev/null || true)
if [ -n "$ASR_DUMP" ]; then
    echo -e "    ${G}已显式设置:${N}"
    echo "$ASR_DUMP" | sed 's/^/      /'
else
    echo -e "    ${Y}未显式设置 (env.js 默认 fallback 'false', 行为正确, 建议显式加)${N}"
fi

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
    echo -e "${G}━━━━━ ✅ §9.1 全部通过，可进入 §9.2 (改 .env) ━━━━━${N}"
    exit 0
else
    echo -e "${R}━━━━━ ❌ 有 $FAIL 项失败，禁止进入 §9.2 ━━━━━${N}"
    exit 1
fi
