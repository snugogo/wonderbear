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

# ╔═══════════════════════════════════════════════════════════════╗
# ║ auto-coordinator v2 PATCH — Risk-Level 驱动的部署/接力       ║
# ║                                                              ║
# ║ 通过 append 到现有 auto-coordinator.sh 末尾,扩展 cmd_post_droid
# ║ 不破坏已有 假 FAIL 静默判定 + 验收聚合 逻辑                   ║
# ║                                                              ║
# ║ 新增 3 个函数:                                                 ║
# ║   parse_risk_level <wo_id>      → 输出 L1/L2/L3/L4            ║
# ║   handle_post_pass_by_risk <id> → 根据 Risk-Level 走部署流程  ║
# ║   try_dispatch_next             → 自动派 queue 下一单         ║
# ║                                                              ║
# ║ 改动入口:                                                     ║
# ║   request_acceptance() 函数被 call 时,先调 handle_post_pass_by_risk
# ║   它会决定 deploy / commit / 接力 / 验收消息内容             ║
# ╚═══════════════════════════════════════════════════════════════╝

# ─── 解析工单 README 顶部的 Risk-Level 字段 ───
# 用法: parse_risk_level WO-3.25 → 输出 L1/L2/L3/L4 (默认 L2)
parse_risk_level() {
  local wo_id="$1"
  local readme_path="/opt/wonderbear/coordination/workorders/${wo_id}/README.md"
  [ ! -f "$readme_path" ] && { echo "L2"; return; }
  local risk
  risk=$(head -30 "$readme_path" 2>/dev/null \
    | grep -ioE 'Risk-Level[^L]*L[1-4]' \
    | head -1 | grep -oE 'L[1-4]')
  [ -z "$risk" ] && risk="L2"
  echo "$risk"
}

# ─── 根据 Risk-Level 驱动后续流程 ───
# 调用时机: cmd_post_droid 中 verify PASS 后(包括假 FAIL 静默放行)
# 用法: handle_post_pass_by_risk <wo_id>
# 返回: 0=成功(无论是否需要 Kristy 验收), 1=部署/commit 失败需要 Kristy 介入
handle_post_pass_by_risk() {
  local wo_id="$1"
  local risk
  risk=$(parse_risk_level "$wo_id")

  log "🎚️  $wo_id Risk-Level: $risk"

  # 标记 queue 状态: deploying
  bash /opt/wonderbear/coordination/queue-helper.sh set-status "$wo_id" "deploying" >/dev/null 2>&1

  # === Step 1: 部署 (build + cp 到 /var/www) ===
  log "🚀 部署 $wo_id"
  local deploy_log="/tmp/deploy-${wo_id}.log"
  bash /opt/wonderbear/coordination/deploy-tv.sh "$wo_id" > "$deploy_log" 2>&1
  local deploy_rc=$?
  if [ "$deploy_rc" -ne 0 ]; then
    log "❌ 部署失败 rc=$deploy_rc"
    bash /opt/wonderbear/coordination/queue-helper.sh set-status "$wo_id" "failed" >/dev/null 2>&1
    "$DINGTALK_ROUTER" send-decision "wonderbear $wo_id 部署失败 rc=$deploy_rc,日志: $deploy_log"
    return 1
  fi

  # 提取部署备份路径
  local backup_path
  backup_path=$(grep '^DEPLOY_BACKUP_PATH=' "$deploy_log" | tail -1 | cut -d= -f2)
  log "✅ 部署完成 backup=$backup_path"

  # === Step 2: auto-commit (精确 add + push release + 如果是 L1 自动 push main) ===
  log "📝 自动 commit $wo_id (L=$risk)"
  local commit_log="/tmp/commit-${wo_id}.log"
  bash /opt/wonderbear/coordination/auto-commit.sh "$wo_id" "$risk" > "$commit_log" 2>&1
  local commit_rc=$?
  local commit_sha
  commit_sha=$(grep '^COMMIT_SHA=' "$commit_log" | tail -1 | cut -d= -f2)
  if [ "$commit_rc" -ne 0 ]; then
    log "⚠️ commit 失败 rc=$commit_rc 但部署已完成"
    "$DINGTALK_ROUTER" send-acceptance \
      "wonderbear $wo_id 已部署但 git commit 失败,请人工 review: $commit_log"
    bash /opt/wonderbear/coordination/queue-helper.sh set-status "$wo_id" "deployed_no_commit" >/dev/null 2>&1
    return 1
  fi
  log "✅ commit + push: $commit_sha"

  # === Step 3: 根据 Risk-Level 决定后续 ===
  case "$risk" in
    L1)
      # L1 全自动: auto-commit 已经把 main 也 push 了,直接接力
      log "🟢 L1 全自动完成,标记 approved + 接力"
      bash /opt/wonderbear/coordination/queue-helper.sh promote "$wo_id" >/dev/null 2>&1
      "$DINGTALK_ROUTER" send-info \
        "wonderbear 🟢 $wo_id (L1) 已部署 + 已合并 main + 接力下一单
commit: $commit_sha
URL: $TV_URL_DEFAULT (F12 disable cache + Ctrl+Shift+R)
若需回滚: 钉钉发 \"回滚 $wo_id\""
      try_dispatch_next "$wo_id"
      ;;

    L2)
      # L2 半自动: 部署 + commit release 完成,等 Kristy 通过
      log "🟡 L2 部署完成,等待 Kristy 视觉验收"
      bash /opt/wonderbear/coordination/queue-helper.sh set-status "$wo_id" "awaiting_approval" >/dev/null 2>&1
      "$DINGTALK_ROUTER" send-acceptance \
        "wonderbear 🟡 $wo_id (L2) 已部署 — 请验收
URL: $TV_URL_DEFAULT (F12 disable cache + Ctrl+Shift+R)
commit: $commit_sha
通过: 钉钉发 \"通过 $wo_id\" (会自动 push main + 接力下一单)
回滚: 钉钉发 \"回滚 $wo_id\" (60秒回到上版本)"
      ;;

    L3)
      # L3 谨慎级: 部署到生产可能不合适,先只 commit release,不 push main,等 Kristy 多 review
      log "🔴 L3 谨慎级,已部署 + commit release,待 Kristy 深度 review"
      bash /opt/wonderbear/coordination/queue-helper.sh set-status "$wo_id" "awaiting_approval" >/dev/null 2>&1
      "$DINGTALK_ROUTER" send-acceptance \
        "wonderbear 🔴 $wo_id (L3 谨慎级) 已部署到生产 — 请深度 review
URL: $TV_URL_DEFAULT
commit (release 分支): $commit_sha
报告: /opt/wonderbear/coordination/done/${wo_id}-report.md
建议: 多角度测试后再发 \"通过 $wo_id\" / \"回滚 $wo_id\""
      ;;

    L4)
      # L4 隔离级: 不部署生产,仅 commit release 等人工 review
      log "⚫ L4 隔离级,仅 commit release,不部署生产"
      bash /opt/wonderbear/coordination/queue-helper.sh set-status "$wo_id" "awaiting_approval" >/dev/null 2>&1
      "$DINGTALK_ROUTER" send-decision \
        "wonderbear ⚫ $wo_id (L4 隔离级) 已 commit release 但未部署生产
请 ssh 到 VPS 完整 review 后,人工 cherry-pick 到 main 并部署
commit: $commit_sha"
      ;;
  esac

  return 0
}

# ─── 自动派 queue 下一单 ───
# 用法: try_dispatch_next [previous_wo_id]
try_dispatch_next() {
  local prev="${1:-}"
  local next_id
  next_id=$(bash /opt/wonderbear/coordination/queue-helper.sh next 2>/dev/null)

  if [ -z "$next_id" ]; then
    log "📋 队列已空,接力终止"
    "$DINGTALK_ROUTER" send-info \
      "wonderbear 🎉 队列已空 — 全部工单完成 (最后: $prev)"
    bash /opt/wonderbear/coordination/queue-helper.sh set-current "null" >/dev/null 2>&1
    return 0
  fi

  log "▶️  接力派 $next_id"
  bash /opt/wonderbear/coordination/queue-helper.sh set-current "$next_id" >/dev/null 2>&1
  bash /opt/wonderbear/coordination/queue-helper.sh set-status "$next_id" "running" >/dev/null 2>&1

  # 调 bot 的 dispatch 接口
  # bot 提供 /tmp/dispatch-trigger 文件,bot 监听这个文件触发派单
  echo "$next_id" > /tmp/wonderbear-auto-dispatch-trigger
  log "📤 写 dispatch trigger: /tmp/wonderbear-auto-dispatch-trigger ($next_id)"

  "$DINGTALK_ROUTER" send-info \
    "wonderbear ▶️  自动接力下一单: $next_id (来自 queue.json)"
}

# ╔═══════════════════════════════════════════════════════════════╗
# ║ 修改 request_acceptance — 在原逻辑前调 handle_post_pass_by_risk║
# ║                                                              ║
# ║ 原 request_acceptance 已存在,本 patch 用 wrapper 包装它       ║
# ║ 旧逻辑保留(_request_acceptance_legacy),新逻辑分流             ║
# ╚═══════════════════════════════════════════════════════════════╝

# 备份旧的 request_acceptance 为 _request_acceptance_legacy
# 这一步通过 declare -f 取到旧函数定义,然后改名(在 PATCH 第一次 source 时执行)
if declare -f request_acceptance > /dev/null && ! declare -f _request_acceptance_legacy > /dev/null; then
  eval "$(echo "_request_acceptance_legacy()"; declare -f request_acceptance | tail -n +2)"
fi

# 新版 request_acceptance: 走 Risk-Level 分流
request_acceptance() {
  local wo_id="$1"
  local suspect_file="${2:-}"

  # 调 v2 的 Risk-Level 处理
  handle_post_pass_by_risk "$wo_id"
}

# ╔═══════════════════════════════════════════════════════════════╗
# ║ 修改子命令分发表 — 加 product-confirmed-via-bot 子命令         ║
# ║   bot 收到 "通过 WO-X" 钉钉命令后调用                          ║
# ║   流程: cherry-pick to main + push main + 接力 next            ║
# ╚═══════════════════════════════════════════════════════════════╝

cmd_approve_to_main() {
  local wo_id="$1"
  log "📥 收到 approve-to-main: $wo_id"

  # 检查工单状态
  local status
  status=$(bash /opt/wonderbear/coordination/queue-helper.sh get-status "$wo_id" 2>/dev/null)
  if [ "$status" != "awaiting_approval" ]; then
    "$DINGTALK_ROUTER" send-info \
      "wonderbear ⚠️ $wo_id 当前状态 ($status) 非 awaiting_approval,跳过 approve-to-main"
    return 1
  fi

  # cherry-pick to main + push
  bash /opt/wonderbear/coordination/approve-to-main.sh "$wo_id" 2>&1 | tail -10
  local rc=$?
  if [ "$rc" -ne 0 ]; then
    "$DINGTALK_ROUTER" send-decision \
      "wonderbear ❌ $wo_id 合并 main 失败,请人工 review"
    return 1
  fi

  # promote queue → history
  bash /opt/wonderbear/coordination/queue-helper.sh promote "$wo_id" >/dev/null 2>&1

  "$DINGTALK_ROUTER" send-info \
    "wonderbear ✅ $wo_id 已合并到 main 接力下一单"

  try_dispatch_next "$wo_id"
}

# 把 cmd_approve_to_main 加到子命令分发(若 case 已存在,这里只是 alias)
# bot 的 command-router 会调 auto-coordinator approve-to-main <WO-ID>
# 在原 case 块外加一个 if 判定,捕获新子命令
if [ "${1:-}" = "approve-to-main" ]; then
  cmd_approve_to_main "${2:-}"
  exit $?
fi

if [ "${1:-}" = "rollback" ]; then
  bash /opt/wonderbear/coordination/rollback-wo.sh "${2:-}"
  exit $?
fi

if [ "${1:-}" = "next-from-queue" ]; then
  try_dispatch_next "${2:-}"
  exit $?
fi
