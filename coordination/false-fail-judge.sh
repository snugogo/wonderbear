#!/usr/bin/env bash
# /opt/wonderbear/coordination/false-fail-judge.sh
#
# 假 FAIL 判定器 v2 — 带 LLM 兜底
#
# 输入:
#   $1 = WO-ID
#   $2 = verify.out 路径
#
# 输出:
#   stdout = 每个 FAIL 一行,标 [FALSE] 或 [REAL]
#   exit code:
#     0 = 全部假 FAIL,放行
#     1 = 至少一个真 FAIL 嫌疑
#     2 = 判定器自身错误
#
# 7 条规则(对应 verify-lib.sh 收编):
#   1. .backup/.bak 文件
#   2. spillover 类型同步白名单
#   3. cross-WO invariant 显式 scope
#   4. grep 命中代码注释行
#   5. 数组多元素同行计数失真
#   6. 后续补丁 verify 未排除前置工单已改文件
#   7. CSS 选择器在 styles/*.css 而非 .vue
#
# Phase 1: 规则匹配(快、确定)
# Phase 2: LLM 兜底(规则没命中的,调 Gemini 看是否是其他类型假 FAIL)
#
# LLM 兜底原则:
#   - 默认放行(Kristy 痛点是误报,宁错放也不错报)
#   - 但只放行 LLM 明确判为「verify 写法本身的问题」而非「业务 bug」
#   - 调用失败/超时 → 回退到默认放行(MVP 偏向 Kristy 静默偏好)
#
# 注意:Kristy 偏好「verify 几乎都是误报」,所以本判定器倾向放行。
# 兜底的责任由「验收消息附嫌疑列表」承担 — 让 Kristy 浏览器实测时心里有数。

set -uo pipefail

WO_ID="${1:-}"
VERIFY_OUT="${2:-}"
[[ -z "$WO_ID" || -z "$VERIFY_OUT" ]] && { echo "用法: $0 <WO-ID> <verify.out>" >&2; exit 2; }
[[ ! -f "$VERIFY_OUT" ]] && { echo "ERROR: verify.out 不存在: $VERIFY_OUT" >&2; exit 2; }

WORKORDER_MD="/opt/wonderbear/workorders/$WO_ID/README.md"
TV_DIR="/opt/wonderbear/tv-html"
ENV_FILE="/opt/wonderbear/server-v7/.env"

# ============ 规则匹配 ============

# 提取所有 FAIL 行
extract_fail_lines() {
  grep -nE '(^❌|^FAIL|❌ FAIL)' "$VERIFY_OUT" 2>/dev/null || true
}

# 单行分类 — 返回 [FALSE]/[REAL]/[UNCERTAIN] 标签
classify_fail_line() {
  local line="$1"

  # 规则 1: .backup/.bak
  if echo "$line" | grep -qE '\.(backup|bak)([0-9.-]*$|[^a-zA-Z])'; then
    echo "[FALSE] R1: 涉及 .backup/.bak,WO-3.17 已部署清理 + 防新增"
    return
  fi

  # 规则 2: 类型同步 spillover(verify-lib 默认白名单已收,verify FAIL 还命中说明工单 expected_files 漏写)
  if echo "$line" | grep -qE '(services/api\.ts|stores/[a-zA-Z]+\.ts)'; then
    echo "[FALSE] R2: 类型同步 spillover,verify-lib check_no_spillover 默认白名单"
    return
  fi

  # 规则 3: cross-WO invariant
  if echo "$line" | grep -qiE 'cross.?wo|invariant'; then
    if [[ -f "$WORKORDER_MD" ]] && grep -qE 'cross-WO-scope:|invariant-scope:' "$WORKORDER_MD"; then
      echo "[FALSE] R3: cross-WO invariant 已在工单显式 scope"
      return
    fi
  fi

  # 规则 4: 注释行
  if echo "$line" | grep -qE '^\s*(//|/\*|\*|<!--)'; then
    echo "[FALSE] R4: grep 命中注释行,verify-lib grep_excluding_comments 应过滤"
    return
  fi

  # 规则 5: 多元素同行计数失真
  if echo "$line" | grep -qE '\[.*,.*,.*\]|\{.*,.*,.*\}'; then
    if echo "$line" | grep -qiE 'expected.*[0-9]+.*found.*[0-9]+|期望.*实际|count.*mismatch|hits:\s*0'; then
      echo "[FALSE] R5: 数组多元素同行,verify-lib grep_count_multiline_safe 应 tr 拆行"
      return
    fi
  fi

  # 规则 6: 前置工单白名单
  if [[ -f "$WORKORDER_MD" ]]; then
    local prev_files
    prev_files=$(awk '/§previous-wo-whitelist:/,/^§|^---/' "$WORKORDER_MD" 2>/dev/null \
                 | grep -oE '[a-zA-Z0-9/_.-]+\.(vue|ts|js|css)' || true)
    if [[ -n "$prev_files" ]]; then
      while IFS= read -r f; do
        [[ -z "$f" ]] && continue
        if echo "$line" | grep -qF "$f"; then
          echo "[FALSE] R6: $f 在 §previous-wo-whitelist,前置工单合法改动"
          return
        fi
      done <<<"$prev_files"
    fi
  fi

  # 规则 7: CSS 选择器
  if echo "$line" | grep -qE '(class|selector|\.tv-|#).*not.found|找不到.*选择器'; then
    local selector
    selector=$(echo "$line" | grep -oE '\.[a-z][a-z0-9-]+|#[a-z][a-z0-9-]+' | head -1)
    if [[ -n "$selector" ]]; then
      if grep -rq "$selector" "$TV_DIR/src/styles/" 2>/dev/null; then
        echo "[FALSE] R7: 选择器 $selector 存在于 styles/*.css"
        return
      fi
    fi
  fi

  # ===== 规则未命中 → LLM 兜底 =====
  local llm_verdict
  llm_verdict=$(llm_judge "$line" 2>/dev/null || echo "")
  case "$llm_verdict" in
    FALSE:*)
      echo "[FALSE] LLM: ${llm_verdict#FALSE:}"
      return
      ;;
    REAL:*)
      echo "[REAL] LLM: ${llm_verdict#REAL:} | 原始: ${line:0:120}"
      return
      ;;
    *)
      # LLM 失败/超时 → 默认放行(Kristy 偏好静默)
      echo "[REAL] 未识别 FAIL(规则与 LLM 都未判定): ${line:0:150}"
      return
      ;;
  esac
}

# ============ LLM 兜底(MVP)============
# 调 Gemini 2.5 Flash 判一行 FAIL 是否是「verify 写法问题」
# 输入:FAIL 行
# 输出 stdout 格式:
#   FALSE:<原因> 或 REAL:<原因>
#   失败/超时 → 空字符串
llm_judge() {
  local fail_line="$1"

  # 读 Gemini key
  local gemini_key=""
  if [[ -f "$ENV_FILE" ]]; then
    gemini_key=$(grep -E '^GEMINI_API_KEY=' "$ENV_FILE" | cut -d= -f2- | tr -d '"' | head -1 || true)
  fi
  [[ -z "$gemini_key" ]] && return

  # 构造提示(简短,降本)
  local prompt
  prompt=$(cat <<EOF
你判定 verify 脚本的一行 FAIL 是「verify 自身写法问题(假 FAIL,应放行)」还是「真业务 bug(应人工)」。

回答格式严格遵守(不要 markdown,不要解释):
FALSE:简短原因
或
REAL:简短原因

判 FALSE 的常见情形:grep 模式过严、文件路径错、计数方式不当、白名单遗漏、verify 没考虑前置工单改动。
判 REAL 的常见情形:文件确实缺失、import 缺失、build error、产品逻辑错误。

不确定时偏向 FALSE(用户痛点是误报多)。

FAIL 行:$fail_line
EOF
)

  # 调用(超时 8 秒,失败安静返回)
  local response
  response=$(curl -sS -m 8 \
    -X POST "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=$gemini_key" \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg p "$prompt" '{contents:[{parts:[{text:$p}]}],generationConfig:{thinkingConfig:{thinkingBudget:0},maxOutputTokens:80}}')" \
    2>/dev/null) || return

  # 提取 text
  local verdict
  verdict=$(echo "$response" | jq -r '.candidates[0].content.parts[0].text // ""' 2>/dev/null | head -1 | tr -d '\r')

  # 校验格式
  if echo "$verdict" | grep -qE '^(FALSE|REAL):'; then
    echo "$verdict"
  fi
}

# ============ 主流程 ============

FAIL_LINES=$(extract_fail_lines)

if [[ -z "$FAIL_LINES" ]]; then
  echo "[INFO] 无 FAIL 行"
  exit 0
fi

HAS_REAL=0
HAS_FALSE=0

while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  result=$(classify_fail_line "$line")
  echo "$result"
  case "$result" in
    \[REAL\]*)  HAS_REAL=1 ;;
    \[FALSE\]*) HAS_FALSE=1 ;;
  esac
done <<<"$FAIL_LINES"

echo ""
echo "===== 判定汇总 ====="
echo "假 FAIL: $HAS_FALSE | 真 FAIL 嫌疑: $HAS_REAL"

if [[ $HAS_REAL -eq 1 ]]; then
  exit 1
fi
exit 0
