#!/bin/bash
# WO-3.6 verify.sh — Standard 工单自动验证脚本
# 用法:
#   ssh wonderbear-vps "bash /opt/wonderbear/workorders/WO-3.6-verify.sh"
# 退出码:
#   0 = 全过
#   非 0 = 至少一项失败
#
# 设计原则(SPEC v2 §verify.sh):
#   - 不信 Factory 自报,自己 grep
#   - 每项带"为什么"
#   - 不调 AI(纯 bash)
#   - 用 safe_grep_count 避开 grep -c 返回码陷阱

set -uo pipefail  # 不开 -e,要让所有检查跑完再决定 exit

DIALOGUE_VUE="/opt/wonderbear/tv-html/src/screens/DialogueScreen.vue"
TV_HTML_DIR="/opt/wonderbear/tv-html"
DIST_DIR="/opt/wonderbear/tv-html/dist"
NGINX_DIR="/var/www/wonderbear-tv"
BACKUP_FILE="/opt/wonderbear/tv-html/src/screens/DialogueScreen.vue.backup-2026-04-30-wo3.6-pre"

PASS_COUNT=0
FAIL_COUNT=0

# ---- helper ----
safe_grep_count() {
    local pattern="$1"
    local file="$2"
    if [ ! -f "$file" ]; then
        echo "FILE_MISSING"
        return
    fi
    local count
    count=$(grep -cE "$pattern" "$file" 2>/dev/null || true)
    echo "${count:-0}"
}

check_pass() {
    PASS_COUNT=$((PASS_COUNT+1))
    echo "  ✅ PASS"
}

check_fail() {
    FAIL_COUNT=$((FAIL_COUNT+1))
    echo "  ❌ FAIL: $1"
}

# ---- header ----
echo "============================================================"
echo "WO-3.6 verify.sh — DialogueScreen 主题卡删除 + UI 话筒按钮"
echo "时间: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "目标文件: $DIALOGUE_VUE"
echo "============================================================"
echo

# ---- check 1: backup 文件 ----
echo "[1/8] backup 文件存在(回滚保险)"
echo "  为什么: §4 备份纪律,Factory 必须 cp 一份 backup 才能动主文件"
if [ -f "$BACKUP_FILE" ]; then
    SIZE=$(wc -c < "$BACKUP_FILE")
    echo "  backup: $BACKUP_FILE ($SIZE bytes)"
    check_pass
else
    check_fail "backup 文件不存在 — Factory 跳过备份纪律"
fi
echo

# ---- check 2: 4 格主题卡代码删除 ----
echo "[2/8] 4 格主题卡代码完全删除"
echo "  为什么: §2.1 改动 1,主题卡已废弃,不能保留"

THEME_REFS=$(safe_grep_count 'sceneForestRef|sceneOceanRef|sceneSpaceRef|sceneHomeRef' "$DIALOGUE_VUE")
THEME_CSS=$(safe_grep_count 'scenes-grid|scene-card' "$DIALOGUE_VUE")
THEME_HANDLERS=$(safe_grep_count 'startWithTheme|themeId|sceneTheme|pickTheme' "$DIALOGUE_VUE")

echo "  sceneXxxRef 出现次数: $THEME_REFS (应为 0)"
echo "  scenes-grid/scene-card CSS 出现次数: $THEME_CSS (应为 0)"
echo "  startWithTheme/themeId 出现次数: $THEME_HANDLERS (应为 0)"

if [ "$THEME_REFS" = "0" ] && [ "$THEME_CSS" = "0" ] && [ "$THEME_HANDLERS" = "0" ]; then
    check_pass
else
    check_fail "主题卡代码残留 — refs=$THEME_REFS, css=$THEME_CSS, handlers=$THEME_HANDLERS"
fi
echo

# ---- check 3: UI 话筒按钮代码新增到位 ----
echo "[3/8] UI 话筒按钮代码新增"
echo "  为什么: §2.2 改动 2,产品级按钮(template + script)"

MIC_BUTTON_TEMPLATE=$(safe_grep_count 'mic-button|micPressed|onMicDown|onMicUp' "$DIALOGUE_VUE")
echo "  mic-button/micPressed/onMicDown/onMicUp 出现次数: $MIC_BUTTON_TEMPLATE (应 ≥ 4 个独立标识符出现)"

if [ "$MIC_BUTTON_TEMPLATE" != "0" ] && [ "$MIC_BUTTON_TEMPLATE" != "FILE_MISSING" ]; then
    if [ "$MIC_BUTTON_TEMPLATE" -ge "4" ]; then
        check_pass
    else
        check_fail "mic 按钮标识符出现次数 $MIC_BUTTON_TEMPLATE,可能没完整实现(template/script/CSS 至少 4 处)"
    fi
else
    check_fail "mic-button 完全没出现 — 改动 2 没做"
fi
echo

# ---- check 4: bridge.emit 调用统一路径 ----
echo "[4/8] bridge emit 调用走统一路径"
echo "  为什么: §2.2 关键设计,UI 按钮和 GP15 物理键共享 bridge"

BRIDGE_EMIT=$(safe_grep_count "bridgeEmit\\('voice-key|emit\\('voice-key" "$DIALOGUE_VUE")
echo "  bridgeEmit('voice-key-...') 调用次数: $BRIDGE_EMIT (应 ≥ 2,down + up)"

if [ "$BRIDGE_EMIT" != "0" ] && [ "$BRIDGE_EMIT" != "FILE_MISSING" ]; then
    if [ "$BRIDGE_EMIT" -ge "2" ]; then
        check_pass
    else
        check_fail "bridgeEmit 出现 $BRIDGE_EMIT 次,期望 ≥ 2(down + up 各 1 次)"
    fi
else
    check_fail "bridgeEmit 完全没出现 — UI 按钮没接入 bridge"
fi
echo

# ---- check 5: 没有 console.log 调试污染 ----
echo "[5/8] 没有 console.log 调试污染"
echo "  为什么: §3 红线,不允许调试 log 进 mainline"

DEBUG_LOG=$(safe_grep_count 'console\.log.*debug-asr|console\.log.*\[asr|console\.log.*\[mic' "$DIALOGUE_VUE")
echo "  调试 console.log 出现次数: $DEBUG_LOG (应为 0)"

if [ "$DEBUG_LOG" = "0" ]; then
    check_pass
else
    check_fail "调试 console.log 残留 — Factory 复用 stash 代码时把调试日志带进来了"
fi
echo

# ---- check 6: i18n 改动 ----
echo "[6/8] i18n key 新增"
echo "  为什么: §2.4 改动 4,按钮文字必须走 i18n"

I18N_FILES=$(find /opt/wonderbear/tv-html/src/i18n -name '*.ts' 2>/dev/null)
if [ -z "$I18N_FILES" ]; then
    check_fail "找不到 i18n 文件目录"
else
    I18N_NEW_KEY_FOUND=0
    for f in $I18N_FILES; do
        c=$(safe_grep_count 'micButton' "$f")
        if [ "$c" != "0" ] && [ "$c" != "FILE_MISSING" ]; then
            I18N_NEW_KEY_FOUND=$((I18N_NEW_KEY_FOUND+1))
            echo "  $f: 找到 micButton key (count=$c)"
        fi
    done
    if [ "$I18N_NEW_KEY_FOUND" -ge "1" ]; then
        check_pass
    else
        check_fail "i18n 文件没有 micButton key — 改动 4 没做"
    fi
fi
echo

# ---- check 7: npm run build 通过 ----
echo "[7/8] npm run build 通过"
echo "  为什么: §5 Dry-run 校验,build 失败说明 TS 错误或 vite 错误"

cd "$TV_HTML_DIR"
BUILD_OUTPUT=$(npm run build 2>&1 || true)
BUILD_LAST_LINES=$(echo "$BUILD_OUTPUT" | tail -5)
echo "  build 输出末尾:"
echo "$BUILD_LAST_LINES" | sed 's/^/    /'

if echo "$BUILD_OUTPUT" | grep -q 'built in'; then
    check_pass
else
    check_fail "npm run build 失败 — 看上面输出"
fi
echo

# ---- check 8: dist 时间戳更新 ----
echo "[8/8] dist 产物时间戳是今天"
echo "  为什么: build 成功但产物没更新 = build cache,需调查"

if [ -d "$DIST_DIR" ]; then
    INDEX_HTML="$DIST_DIR/index.html"
    if [ -f "$INDEX_HTML" ]; then
        TODAY=$(date +%Y-%m-%d)
        FILE_DATE=$(stat -c %y "$INDEX_HTML" 2>/dev/null | cut -d' ' -f1)
        echo "  dist/index.html 修改日期: $FILE_DATE (今天: $TODAY)"
        if [ "$FILE_DATE" = "$TODAY" ]; then
            check_pass
        else
            check_fail "dist/index.html 不是今天的(可能 build 没真跑成功)"
        fi
    else
        check_fail "dist/index.html 不存在 — build 没产出"
    fi
else
    check_fail "dist/ 目录不存在"
fi
echo

# ---- summary ----
echo "============================================================"
echo "总结: $PASS_COUNT 项 PASS, $FAIL_COUNT 项 FAIL"
echo "============================================================"

if [ "$FAIL_COUNT" -gt "0" ]; then
    echo
    echo "❌ verify 失败 — 至少一项不过"
    echo
    echo "下一步建议(SPEC v2 §标准用法):"
    echo "  把以上输出贴回 Claude,AI 判断 A/B/C 类:"
    echo "  A. Factory 错 → 复用工单重派"
    echo "  B. 工单错 → 出 v2(同名 N,不开 N.1)"
    echo "  C. 漏了 → 出 WO-3.6.x 补丁"
    exit 1
else
    echo
    echo "✅ 全部 PASS"
    echo
    echo "下一步(Kristy 跑):"
    echo "  1. rsync -av --delete /opt/wonderbear/tv-html/dist/ /var/www/wonderbear-tv/"
    echo "  2. Chrome Ctrl+Shift+R 强制刷新 tv.bvtuber.com"
    echo "  3. 进 DialogueScreen,确认右下角有 amber 圆形话筒按钮 + 4 格主题卡消失"
    echo "  4. 按一下按钮,看状态机切换到 recording(不必真说话,不烧钱)"
    echo "  5. git add -A + commit(用 §11 的 commit message 模板)"
    exit 0
fi
