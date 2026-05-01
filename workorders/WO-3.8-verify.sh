#!/bin/bash
# WO-3.8 verify.sh — Create Story 体验完善哆包（4 反馈一起修）
# 用法: ssh wonderbear-vps "bash /opt/wonderbear/workorders/WO-3.8-verify.sh"
# 退出码: 0 = 全过, 非 0 = 至少一项失败

set -uo pipefail

REPO=/opt/wonderbear
DIALOGUE_VUE="$REPO/tv-html/src/screens/DialogueScreen.vue"
DIALOGUE_TS="$REPO/tv-html/src/stores/dialogue.ts"
ZH_TS="$REPO/tv-html/src/i18n/locales/zh.ts"
EN_TS="$REPO/tv-html/src/i18n/locales/en.ts"
LLM_JS="$REPO/server-v7/src/services/llm.js"
PROMPT_TXT="$REPO/server-v7/src/prompts/v2-lite/story.system.txt"

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
echo "WO-3.8 verify.sh — Create Story 体验完善哆包（4 反馈）"
echo "时间: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "============================================================"
echo

# ---- check 1: 6 个 backup 文件存在 ----
echo "[1/12] 6 个 backup 文件存在"
echo "  为什么: §4 备份纪律,4 个反馈跨 6 个目标文件"

BACKUP_OK=0
BACKUP_MISSING=()
for f in "$DIALOGUE_VUE" "$DIALOGUE_TS" "$ZH_TS" "$EN_TS" "$LLM_JS" "$PROMPT_TXT"; do
    BACKUP="$f.backup-2026-04-30-wo-3.8-pre"
    if [ -f "$BACKUP" ]; then
        BACKUP_OK=$((BACKUP_OK+1))
    else
        BACKUP_MISSING+=("$BACKUP")
    fi
done

echo "  backup 数量: $BACKUP_OK / 6"
if [ "$BACKUP_OK" = "6" ]; then
    check_pass
else
    echo "  缺失 backup:"
    for m in "${BACKUP_MISSING[@]}"; do
        echo "    $m"
    done
    check_fail "至少一个 backup 缺失"
fi
echo

# ---- check 2: dialogue.ts 含 lastBearReply 字段 ----
echo "[2/12] 反馈 1: dialogue store 含 lastBearReply 字段"
echo "  为什么: §2.1 改动 - 缓存上一轮小熊回答"

LAST_REPLY_TS=$(safe_grep_count "lastBearReply" "$DIALOGUE_TS")
echo "  lastBearReply 在 dialogue.ts 出现: $LAST_REPLY_TS (应 ≥ 2: 类型声明 + state 初始化 + applyTurn 赋值)"

if [ "$LAST_REPLY_TS" != "0" ] && [ "$LAST_REPLY_TS" != "FILE_MISSING" ]; then
    if [ "$LAST_REPLY_TS" -ge "2" ]; then
        check_pass
    else
        check_fail "lastBearReply 引用 $LAST_REPLY_TS 次,可能未完整实现"
    fi
else
    check_fail "dialogue.ts 缺 lastBearReply"
fi
echo

# ---- check 3: DialogueScreen.vue 含 lastBearReply 引用 ----
echo "[3/12] 反馈 1: DialogueScreen 含 lastBearReply UI 引用"

LAST_REPLY_VUE=$(safe_grep_count "lastBearReply" "$DIALOGUE_VUE")
echo "  lastBearReply 在 DialogueScreen.vue: $LAST_REPLY_VUE (应 ≥ 1)"

if [ "$LAST_REPLY_VUE" != "0" ] && [ "$LAST_REPLY_VUE" != "FILE_MISSING" ]; then
    check_pass
else
    check_fail "DialogueScreen 没引用 lastBearReply"
fi
echo

# ---- check 4: DialogueScreen 文本气泡 CSS 存在 ----
echo "[4/12] 反馈 1: 文本气泡 CSS / class 存在"

BUBBLE_CSS=$(safe_grep_count "previous-reply|prev-reply|bear-context|context-bubble|prev-bubble|reply-bubble" "$DIALOGUE_VUE")
echo "  气泡相关 class: $BUBBLE_CSS (应 ≥ 1)"

if [ "$BUBBLE_CSS" != "0" ] && [ "$BUBBLE_CSS" != "FILE_MISSING" ]; then
    check_pass
else
    check_fail "DialogueScreen 没文本气泡 CSS"
fi
echo

# ---- check 5: server llm.js 不再含硬编码 Luna ----
echo "[5/12] 反馈 2: server llm.js 不再含硬编码 'Luna'"
echo "  为什么: §2.2 - Luna 必须移除,改 Dora"

# 注意: 允许在 retryFeedback 等错误信息里出现 Luna 字样作 example,但不能在 default value
LUNA_HARDCODE=$(safe_grep_count "['\"]Luna['\"]|name.*=.*['\"]Luna|default.*Luna|childName.*=.*['\"]Luna" "$LLM_JS")
echo "  llm.js 硬编码 Luna 出现: $LUNA_HARDCODE (应为 0)"

if [ "$LUNA_HARDCODE" = "0" ]; then
    check_pass
else
    echo "  人工核查:"
    grep -nE "Luna" "$LLM_JS" | head -5 | sed 's/^/    /'
    check_fail "llm.js 仍有硬编码 Luna"
fi
echo

# ---- check 6: server llm.js 含 Dora fallback ----
echo "[6/12] 反馈 2: llm.js 含 'Dora' fallback 默认"
echo "  为什么: §2.2 - 默认必须 Dora 不是 Luna"

DORA_FALLBACK=$(safe_grep_count "['\"]Dora['\"]|\\|\\| ['\"]Dora|defaultName.*Dora|fallback.*Dora" "$LLM_JS")
echo "  llm.js Dora fallback: $DORA_FALLBACK (应 ≥ 1)"

if [ "$DORA_FALLBACK" != "0" ] && [ "$DORA_FALLBACK" != "FILE_MISSING" ]; then
    check_pass
else
    check_fail "llm.js 没设 Dora fallback"
fi
echo

# ---- check 7: server llm.js 含 childName 变量 ----
echo "[7/12] 反馈 3: llm.js 含 childName 变量化"
echo "  为什么: §2.2 - childName 从用户档案取"

CHILDNAME_REF=$(safe_grep_count "childName" "$LLM_JS")
echo "  childName 在 llm.js: $CHILDNAME_REF (应 ≥ 2: 取值 + 使用)"

if [ "$CHILDNAME_REF" != "0" ] && [ "$CHILDNAME_REF" != "FILE_MISSING" ]; then
    if [ "$CHILDNAME_REF" -ge "2" ]; then
        check_pass
    else
        check_fail "childName 引用 $CHILDNAME_REF 次,可能未完整变量化"
    fi
else
    check_fail "llm.js 缺 childName"
fi
echo

# ---- check 8: prompt 文件不再含 Luna ----
echo "[8/12] 反馈 2/3: prompt 文件不含 Luna"
echo "  为什么: §2.2 - prompt 里 Luna 字符串必须替换"

PROMPT_LUNA=$(safe_grep_count "Luna|露娜" "$PROMPT_TXT")
echo "  prompt 文件 Luna/露娜 出现: $PROMPT_LUNA (应为 0)"

if [ "$PROMPT_LUNA" = "0" ]; then
    check_pass
else
    grep -nE "Luna|露娜" "$PROMPT_TXT" | head -5 | sed 's/^/    /'
    check_fail "prompt 里仍有 Luna 字样"
fi
echo

# ---- check 9: outline 滚动条美化 CSS ----
echo "[9/12] 反馈 4: outline 列表滚动条隐藏"
echo "  为什么: §2.3 - 鼠标式滚动条要去掉"

# 找含 outline / story-shape / paragraph 类似的 vue 文件
SCROLLBAR_NONE=$(grep -rlE "scrollbar-width:.*none|::-webkit-scrollbar.*display:.*none|scrollbar-width: none" "$REPO/tv-html/src" 2>/dev/null | wc -l)
echo "  scrollbar-width: none 出现的文件数: $SCROLLBAR_NONE (应 ≥ 1)"

if [ "$SCROLLBAR_NONE" -ge "1" ]; then
    check_pass
else
    check_fail "找不到 scrollbar 隐藏 CSS"
fi
echo

# ---- check 10: server-v7 编译 + require() 通过 ----
echo "[10/12] server-v7 语法 + 模块加载测试"
echo "  为什么: WO-DT-1.3 v1 教训 - 必须 require() 才能抓嵌入字符串错"

cd "$REPO/server-v7"
SYNTAX_CHECK=$(node -c "$LLM_JS" 2>&1 || true)
if [ -n "$SYNTAX_CHECK" ]; then
    echo "  $SYNTAX_CHECK" | head -3 | sed 's/^/    /'
    check_fail "node -c 失败"
else
    LOAD_TEST=$(timeout 10 node -e "
try {
  require('$LLM_JS');
  setTimeout(() => process.exit(0), 100);
} catch (e) {
  console.error('LOAD_ERROR:', e.message);
  process.exit(1);
}
" 2>&1 || true)
    if echo "$LOAD_TEST" | grep -qE 'SyntaxError|ReferenceError|LOAD_ERROR'; then
        echo "  $LOAD_TEST" | head -5 | sed 's/^/    /'
        check_fail "require() 加载失败"
    else
        echo "  node -c + require() 通过"
        check_pass
    fi
fi
echo

# ---- check 11: tv-html npm run build 通过 ----
echo "[11/12] tv-html npm run build 通过"

cd "$REPO/tv-html"
BUILD_OUTPUT=$(npm run build 2>&1 || true)
if echo "$BUILD_OUTPUT" | grep -q 'built in'; then
    echo "  build OK"
    check_pass
else
    echo "  build 输出末尾:"
    echo "$BUILD_OUTPUT" | tail -10 | sed 's/^/    /'
    check_fail "tv-html build 失败"
fi
echo

# ---- check 12: Factory 报告含 4 反馈关键代码段 ----
echo "[12/12] Factory 报告含 4 反馈各自的关键代码段"

REPORT_FILE=$(ls -t /opt/wonderbear/coordination/done/WO-3.8-report.md 2>/dev/null | head -1)
if [ -z "$REPORT_FILE" ] || [ ! -f "$REPORT_FILE" ]; then
    check_fail "找不到 WO-3.8 Factory 报告"
else
    echo "  报告: $REPORT_FILE"
    F1=$(safe_grep_count "lastBearReply|反馈 1" "$REPORT_FILE")
    F2=$(safe_grep_count "Dora|反馈 2|默认主角" "$REPORT_FILE")
    F3=$(safe_grep_count "childName|反馈 3|变量化" "$REPORT_FILE")
    F4=$(safe_grep_count "scrollbar|反馈 4|outline.*滚动" "$REPORT_FILE")
    echo "  反馈 1 (lastBearReply): $F1"
    echo "  反馈 2 (Dora): $F2"
    echo "  反馈 3 (childName): $F3"
    echo "  反馈 4 (scrollbar): $F4"
    if [ "$F1" != "0" ] && [ "$F2" != "0" ] && [ "$F3" != "0" ] && [ "$F4" != "0" ]; then
        check_pass
    else
        check_fail "Factory 报告没贴齐 4 个反馈关键代码段"
    fi
fi
echo

# ---- summary ----
echo "============================================================"
echo "总结: $PASS_COUNT 项 PASS, $FAIL_COUNT 项 FAIL"
echo "============================================================"

if [ "$FAIL_COUNT" -gt "0" ]; then
    echo
    echo "❌ verify 失败 - 哆包工单任意一项失败必须整个回滚"
    echo
    echo "下一步建议:"
    echo "  把以上输出贴 Claude,判断 A/B/C 类失败"
    echo "  哆包工单红线: 不接受部分成功,必须全 12 项 PASS 才能 commit"
    exit 1
else
    echo
    echo "✅ 全部 12 项 PASS"
    echo
    echo "下一步（Kristy 跑）:"
    echo "  1. ssh wonderbear-vps 'pm2 restart wonderbear-server'"
    echo "  2. ssh wonderbear-vps 'rsync -av --delete /opt/wonderbear/tv-html/dist/ /var/www/wonderbear-tv/'"
    echo "  3. Chrome Ctrl+Shift+R tv.bvtuber.com 走完整流程"
    echo "  4. 检查 4 项: 上下文气泡 / 主角 Dora / 滚动条消失 / outline 正常"
    echo "  5. 全过 → git add + commit (用 §11 模板)"
    exit 0
fi
