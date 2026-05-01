#!/usr/bin/env bash
# /opt/wonderbear/coordination/auto-coordinator.sh
#
# WonderBear 自动化协调器 v2 — 静默优先版
#
# 设计哲学:
#   Kristy 真实痛点 = 「7 次 verify FAIL 全是误报」+「只想在验收时被打扰」
#
# 核心策略:
#   1. verify 全 PASS → 钉钉 ping 一次「待验收」(@)
#   2. verify FAIL → 调 false-fail-judge
#       - 全部假 FAIL → 静默放行,直接请求验收
#       - 有真 FAIL → 仍然请求验收,但消息附「未识别 FAIL 嫌疑列表」前 3 条
#   3. 整个工单生命周期 Kristy 只被 @ 一次:产品验收请求
#   4. 真 bug 兜底:验收消息附嫌疑列表,Kristy 浏览器实测前可一眼扫到
#
# 这与 v1 的关键区别:
#   - v1 真 FAIL → 立即 @ Kristy(噪音,7 次实战全误报)
#   - v2 真 FAIL → 写 marker,聚合到验收消息(信息聚合,Kristy 心里有数)

set -uo pipefail

# ============ 配置 ============
COORD_DIR="/opt/wonderbear/coordination"
WORKORDERS_DIR="/opt/wonderbear/workorders"
LOG_DIR="$COORD_DIR/auto-coordinator-logs"
DINGTALK_ROUTER="$COORD_DIR/dingtalk-router.sh"
FALSE_FAIL_JUDGE="$COORD_DIR/false-fail-judge.sh"
TV_URL_DEFAULT="https://tv.bvtuber.com/"

mkdir -p "$LOG_DIR"

# ============ 日志 ============
WO_ID="${2:-unknown}"
LOG_FILE="$LOG_DIR/$(date +%Y%m%d-%H%M%S)-${WO_ID}.log"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

# ============ 子命令: post-droid ============
# done-watcher.js 在 verify.sh 跑完后调用
# 用法: auto-coordinator post-droid <WO-ID> <verify-stdout-file> <verify-exit-code>
cmd_post_droid() {
  local wo_id="$1"
  local verify_out="${2:-}"
  local verify_exit="${3:-1}"

  [[ -z "$wo_id" ]] && { log "ERROR: post-droid 缺 WO-ID"; exit 1; }

  local marker_dir="$COORD_DIR/markers/$wo_id"
  mkdir -p "$marker_dir"

  log "===== post-droid: $wo_id (verify exit=$verify_exit) ====="

  # 保存 verify 输出
  if [[ -n "$verify_out" && -f "$verify_out" ]]; then
    cp "$verify_out" "$marker_dir/verify.out"
  fi

  # ===== Case A: verify 全 PASS =====
  if [[ "$verify_exit" -eq 0 ]]; then
    log "✅ verify 全 PASS,直接请求验收"
    touch "$marker_dir/.verify-passed"
    request_acceptance "$wo_id" ""
    return
  fi

  # ===== Case B: verify FAIL,调判定器(静默判)=====
  log "⚠️ verify FAIL,调 false-fail-judge(静默)"
  local judge_out="$marker_dir/judge.out"
  local judge_exit=0
  "$FALSE_FAIL_JUDGE" "$wo_id" "$marker_dir/verify.out" >"$judge_out" 2>&1 || judge_exit=$?

  case "$judge_exit" in
    0)
      # 全部假 FAIL,静默放行
      log "✅ judge: 全部假 FAIL,静默放行"
      touch "$marker_dir/.verify-passed-with-known-false-fails"
      cp "$judge_out" "$marker_dir/.false-fail-reasons.txt"
      request_acceptance "$wo_id" ""
      ;;
    1)
      # 有未识别 FAIL — 仍请求验收,但消息附嫌疑列表
      log "🔍 judge: 有未识别 FAIL,验收消息附嫌疑列表(不另发警报)"
      touch "$marker_dir/.verify-passed-with-unknown-fails"
      cp "$judge_out" "$marker_dir/.unknown-fail-suspects.txt"
      request_acceptance "$wo_id" "$judge_out"
      ;;
    *)
      # 判定器内部错误(罕见,协调器自身故障)
      log "⚠️ judge 内部错误 exit=$judge_exit,降级人工"
      touch "$marker_dir/.verify-judge-error"
      "$DINGTALK_ROUTER" send-decision "wonderbear $wo_id 自动化协调器内部错误,需人工 review: $LOG_FILE"
      ;;
  esac
}

# ============ 验收请求(唯一会 @ Kristy 的消息)============
request_acceptance() {
  local wo_id="$1"
  local suspects_file="${2:-}"

  local marker_dir="$COORD_DIR/markers/$wo_id"
  local accept_url="$TV_URL_DEFAULT"

  # 工单可自定义验收 URL
  local wo_md="$WORKORDERS_DIR/$wo_id/README.md"
  if [[ -f "$wo_md" ]]; then
    local custom_url
    custom_url=$(grep -oP '§accept-test-url:\s*\K\S+' "$wo_md" | head -1 || true)
    [[ -n "$custom_url" ]] && accept_url="$custom_url"
  fi

  touch "$marker_dir/.awaiting-product-acceptance"

  # 构造消息
  local msg="$wo_id 待产品验收: $accept_url

实测 OK 回复: $wo_id confirmed
实测有 bug 回复: $wo_id reject <原因>"

  # 嫌疑列表(若有)
  if [[ -n "$suspects_file" && -f "$suspects_file" ]]; then
    local suspect_count
    suspect_count=$(grep -c '^\[REAL\]' "$suspects_file" 2>/dev/null || echo "0")
    [ -z "$suspect_count" ] && suspect_count=0
    if [[ "$suspect_count" -gt 0 ]] 2>/dev/null; then
      msg="$msg

⚠️ verify 有 $suspect_count 个未识别 FAIL(已自动放行),实测时关注:
$(grep '^\[REAL\]' "$suspects_file" | head -3 | sed 's/^/  /')"
    fi
  fi

  log "📤 发验收请求"
  "$DINGTALK_ROUTER" send-acceptance "wonderbear $msg"
}

# ============ product-confirmed ============
cmd_product_confirmed() {
  local wo_id="$1"
  [[ -z "$wo_id" ]] && { log "ERROR: 缺 WO-ID"; exit 1; }

  local marker_dir="$COORD_DIR/markers/$wo_id"
  if [[ ! -d "$marker_dir" ]]; then
    log "WARN: marker 不存在: $marker_dir"
    "$DINGTALK_ROUTER" send-info "wonderbear $wo_id confirmed 但 marker 不存在,可能是手动测试"
    return
  fi

  touch "$marker_dir/.product-confirmed"
  log "✅ $wo_id 验收通过"
  "$DINGTALK_ROUTER" send-info "wonderbear $wo_id 验收 ✅ 已记录,方便时 commit + push"
}

# ============ product-rejected ============
cmd_product_rejected() {
  local wo_id="$1"
  local reason="${2:-未提供原因}"

  local marker_dir="$COORD_DIR/markers/$wo_id"
  mkdir -p "$marker_dir"
  echo "$reason" > "$marker_dir/.product-rejected.txt"
  log "❌ $wo_id reject: $reason"
  "$DINGTALK_ROUTER" send-info "wonderbear $wo_id reject 已记录: $reason"
}

# ============ status ============
cmd_status() {
  local markers_dir="$COORD_DIR/markers"
  [[ ! -d "$markers_dir" ]] && { echo "(无 marker 记录)"; return; }

  printf "%-15s %-55s\n" "WO-ID" "状态"
  printf "%-15s %-55s\n" "-----" "----"

  for d in "$markers_dir"/*/; do
    [[ ! -d "$d" ]] && continue
    local wo_id; wo_id=$(basename "$d")
    local state="未知"
    [[ -f "$d/.verify-passed" ]] && state="✅ verify全PASS 待实测"
    [[ -f "$d/.verify-passed-with-known-false-fails" ]] && state="✅ 假FAIL放行 待实测"
    [[ -f "$d/.verify-passed-with-unknown-fails" ]] && state="⚠️ 含未识别FAIL 待实测(查嫌疑)"
    [[ -f "$d/.verify-judge-error" ]] && state="🔴 协调器故障"
    [[ -f "$d/.product-confirmed" ]] && state="✅ 已闭环 待commit"
    [[ -f "$d/.product-rejected.txt" ]] && state="❌ 已 reject"
    printf "%-15s %-55s\n" "$wo_id" "$state"
  done
}

# ============ 入口 ============
case "${1:-help}" in
  post-droid)        cmd_post_droid "${2:-}" "${3:-}" "${4:-1}" ;;
  product-confirmed) cmd_product_confirmed "${2:-}" ;;
  product-rejected)  cmd_product_rejected "${2:-}" "${3:-}" ;;
  status)            cmd_status ;;
  help|*)
    cat <<EOF
WonderBear 自动化协调器 v2 (静默优先)

用法:
  $0 post-droid <WO-ID> <verify-out-file> <verify-exit-code>
  $0 product-confirmed <WO-ID>
  $0 product-rejected <WO-ID> <reason>
  $0 status

哲学:
  - Kristy 整个工单生命周期只被 @ 一次:验收请求
  - verify 真假 FAIL 都静默处理,真 FAIL 嫌疑附在验收消息里
  - 不自动 commit/push (memory §10 红线 #5)
EOF
    ;;
esac
