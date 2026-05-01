#!/bin/bash
# WO-3.7 verify.sh — Gemini retry + prompt schema 加固
# 用法: ssh wonderbear-vps "bash /opt/wonderbear/workorders/WO-3.7-verify.sh"
# 退出码: 0 = 全过, 非 0 = 至少一项失败

set -uo pipefail

SERVER_DIR="/opt/wonderbear/server-v7"
PROMPT_FILE_PATTERN="story.system.txt"
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
echo "WO-3.7 verify.sh — Gemini retry + prompt schema 加固"
echo "时间: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "目标: server-v7 故事生成 service + prompts/v2-lite/story.system.txt"
echo "============================================================"
echo

# ---- 自动定位故事生成文件 ----
STORY_FILE=$(grep -rlE "Gemini.*story|generateStory|pages\.length.*===.*12|expected.*12.*pages" "$SERVER_DIR/src" 2>/dev/null \
    | grep -v node_modules \
    | grep -E "(services|queues|routes)/.*\.(js|ts)$" \
    | head -1)

PROMPT_FILE=$(find "$SERVER_DIR" -type f -name "$PROMPT_FILE_PATTERN" 2>/dev/null | grep -v backup | head -1)

echo "自动定位故事生成文件: ${STORY_FILE:-<未找到>}"
echo "自动定位 prompt 文件: ${PROMPT_FILE:-<未找到>}"
echo

if [ -z "$STORY_FILE" ]; then
    check_fail "找不到故事生成文件 — Factory 勘察阶段没改对地方"
    echo
    echo "============================================================"
    echo "❌ 致命错误"
    echo "============================================================"
    exit 1
fi

if [ -z "$PROMPT_FILE" ]; then
    check_fail "找不到 prompts/v2-lite/story.system.txt"
    echo
    echo "============================================================"
    echo "❌ 致命错误"
    echo "============================================================"
    exit 1
fi

# ---- check 1: backup 文件 ----
echo "[1/8] backup 文件存在 (.js + prompt 两份)"
echo "  为什么: §4 备份纪律,回滚锚"
JS_BACKUP="${STORY_FILE}.backup-2026-04-30-wo-3.7-pre"
PROMPT_BACKUP="${PROMPT_FILE}.backup-2026-04-30-wo-3.7-pre"

JS_OK=0
PROMPT_OK=0
if [ -f "$JS_BACKUP" ]; then
    echo "  JS backup: $JS_BACKUP ($(wc -c < "$JS_BACKUP") bytes)"
    JS_OK=1
fi
if [ -f "$PROMPT_BACKUP" ]; then
    echo "  Prompt backup: $PROMPT_BACKUP ($(wc -c < "$PROMPT_BACKUP") bytes)"
    PROMPT_OK=1
fi

if [ "$JS_OK" = "1" ] && [ "$PROMPT_OK" = "1" ]; then
    check_pass
else
    check_fail "至少一个 backup 缺失 (js=$JS_OK, prompt=$PROMPT_OK)"
fi
echo

# ---- check 2: 关键代码出现 ----
echo "[2/8] retry 关键代码存在"
echo "  为什么: §2.2 必须有 generateStoryWithRetry / MAX_ATTEMPTS / buildStoryPromptWithFeedback"

RETRY_FN=$(safe_grep_count "generateStoryWithRetry|generate.*Retry|StoryRetry" "$STORY_FILE")
MAX_ATTEMPTS=$(safe_grep_count "MAX_ATTEMPTS|maxAttempts|attempts.*=.*2|attempts.*<.*2" "$STORY_FILE")
FEEDBACK_FN=$(safe_grep_count "buildStoryPromptWithFeedback|promptWithFeedback|withFeedback" "$STORY_FILE")

echo "  retry 主函数: $RETRY_FN"
echo "  MAX_ATTEMPTS 引用: $MAX_ATTEMPTS"
echo "  feedback prompt builder: $FEEDBACK_FN"

if [ "$RETRY_FN" != "0" ] && [ "$MAX_ATTEMPTS" != "0" ] && [ "$FEEDBACK_FN" != "0" ]; then
    check_pass
else
    check_fail "retry 关键代码缺失"
fi
echo

# ---- check 3: 12 页校验仍在 ----
echo "[3/8] 12 页硬约束仍存在 (没被偷偷改成 11 接受)"
echo "  为什么: §3 红线 不许改 12 页约束"

CHECK_12=$(safe_grep_count "pages\\.length.*===.*12|length.*===.*12|=== 12|== 12" "$STORY_FILE")
echo "  '12 页校验' 出现: $CHECK_12 (应 ≥ 1)"

# 顺便检测有没有"接受 11/13"的偷改
SUSPECT_LOOSE=$(safe_grep_count "pages\\.length.*>=.*10|length.*>=.*10|truncate|slice.*0.*12" "$STORY_FILE")
echo "  嫌疑松校验 (>= 10/truncate): $SUSPECT_LOOSE (应为 0)"

if [ "$CHECK_12" != "0" ] && [ "$SUSPECT_LOOSE" = "0" ]; then
    check_pass
else
    check_fail "12 页校验被改 / 偷塞松校验"
fi
echo

# ---- check 4: 没有调试 console.log ----
echo "[4/8] 没有调试 console.log"
echo "  为什么: §3 红线 必须用 logger"

DEBUG_LOG=$(safe_grep_count "console\\.log\\(.*\\[debug|console\\.log\\(.*WO-3\\.7|console\\.log\\(.*storyGen" "$STORY_FILE")
echo "  调试 console.log: $DEBUG_LOG (应为 0)"

if [ "$DEBUG_LOG" = "0" ]; then
    check_pass
else
    check_fail "调试 console.log 残留"
fi
echo

# ---- check 5: metric log 关键字存在 ----
echo "[5/8] metric log 关键字存在"
echo "  为什么: §2.2 - 区分 firstAttempt / retrySucceeded / retryFailed"

METRIC_KEY=$(safe_grep_count "\\[storyGen\\.metric\\]|storyGen\\.metric" "$STORY_FILE")
FIRST_OK=$(safe_grep_count "firstAttemptSucceeded|attempt.*1.*success|firstAttempt" "$STORY_FILE")
RETRY_OK=$(safe_grep_count "retrySucceeded|retry.*success" "$STORY_FILE")
RETRY_FAIL=$(safe_grep_count "retryFailed|retry.*fail" "$STORY_FILE")

echo "  [storyGen.metric] tag: $METRIC_KEY (应 ≥ 3)"
echo "  firstAttempt log: $FIRST_OK (应 ≥ 1)"
echo "  retrySucceeded log: $RETRY_OK (应 ≥ 1)"
echo "  retryFailed log: $RETRY_FAIL (应 ≥ 1)"

if [ "$METRIC_KEY" != "0" ] && [ "$FIRST_OK" != "0" ] && [ "$RETRY_OK" != "0" ] && [ "$RETRY_FAIL" != "0" ]; then
    check_pass
else
    check_fail "metric log 不全"
fi
echo

# ---- check 6: server 编译 + 加载通过 (v1 教训) ----
echo "[6/8] server-v7 编译 + 加载通过 (node -c + node -e require)"
echo "  为什么: WO-DT-1.3 v1 教训 - node -c 不够,必须 require() 才能抓嵌入字符串错"

cd "$SERVER_DIR"
SYNTAX_CHECK=$(node -c "$STORY_FILE" 2>&1 || true)
if [ -n "$SYNTAX_CHECK" ]; then
    echo "  $SYNTAX_CHECK" | head -5 | sed 's/^/    /'
    check_fail "node -c 语法检查失败"
else
    echo "  node -c OK"
    LOAD_TEST=$(timeout 10 node -e "
try {
  require('$STORY_FILE');
  setTimeout(() => process.exit(0), 100);
} catch (e) {
  console.error('LOAD_ERROR:', e.message);
  process.exit(1);
}
" 2>&1 || true)

    if echo "$LOAD_TEST" | grep -qE 'SyntaxError|ReferenceError|Unexpected identifier|LOAD_ERROR'; then
        echo "  $LOAD_TEST" | head -5 | sed 's/^/    /'
        check_fail "require() 加载失败"
    else
        echo "  require() OK"
        check_pass
    fi
fi
echo

# ---- check 7: prompt schema 段已追加 ----
echo "[7/8] prompts/v2-lite/story.system.txt 含新 schema 段"
echo "  为什么: §2.3 - 'EXACTLY 12 elements' / 'VALIDATION RULES' 必须存在"

SCHEMA_EXACTLY=$(safe_grep_count "EXACTLY 12|exactly 12|exactly twelve" "$PROMPT_FILE")
SCHEMA_RULES=$(safe_grep_count "VALIDATION RULES|validation rules|MUST equal 12" "$PROMPT_FILE")

echo "  'EXACTLY 12' 标记: $SCHEMA_EXACTLY (应 ≥ 1)"
echo "  'VALIDATION RULES' 标记: $SCHEMA_RULES (应 ≥ 1)"

if [ "$SCHEMA_EXACTLY" != "0" ] && [ "$SCHEMA_RULES" != "0" ]; then
    check_pass
else
    check_fail "prompt schema 段缺失"
fi
echo

# ---- check 8: Factory 报告含 Gemini 真实测试输出 ----
echo "[8/8] Factory 报告含 Gemini 真实测试输出"
echo "  为什么: §2.4 测试 2 - 必须真实调用 Gemini 验证 retry 逻辑"

REPORT_FILE=$(ls -t /opt/wonderbear/coordination/done/WO-3.7-report.md 2>/dev/null | head -1)
if [ -z "$REPORT_FILE" ] || [ ! -f "$REPORT_FILE" ]; then
    check_fail "找不到 WO-3.7 Factory 报告"
else
    echo "  报告: $REPORT_FILE"
    HAS_TEST=$(safe_grep_count "attempts=|SUCCESS pages|FAIL.*pages|attempts=1|attempts=2" "$REPORT_FILE")
    echo "  测试输出关键字: $HAS_TEST"
    if [ "$HAS_TEST" != "0" ]; then
        check_pass
    else
        check_fail "Factory 没贴 Gemini 真实测试输出"
    fi
fi
echo

# ---- summary ----
echo "============================================================"
echo "总结: $PASS_COUNT 项 PASS, $FAIL_COUNT 项 FAIL"
echo "============================================================"

if [ "$FAIL_COUNT" -gt "0" ]; then
    echo
    echo "❌ verify 失败"
    echo
    echo "下一步建议:"
    echo "  把以上输出贴 Claude,判断 A/B/C 类失败"
    exit 1
else
    echo
    echo "✅ 全部 PASS"
    echo
    echo "下一步（Kristy 跑）:"
    echo "  1. ssh wonderbear-vps 'pm2 restart wonderbear-server && sleep 3 && pm2 logs wonderbear-server --lines 30 --nostream'"
    echo "     ⚠️ 必须看到 server 正常启动,无 startup 报错"
    echo "  2. Chrome Ctrl+Shift+R tv.bvtuber.com,走完整对话流程"
    echo "  3. 等 5-6 分钟看故事是否成功 (或 retry 1 次成功)"
    echo "  4. 查 server 日志 [storyGen] 关键字看 attempts=1/2"
    echo "  5. git add + commit (用 §11 模板)"
    exit 0
fi
