#!/usr/bin/env bash
# /opt/wonderbear/coordination/dingtalk-router.sh
#
# 钉钉路由器 v2 — 静默优先
#
# 三类消息:
#   - send-info:        信息(假 FAIL 放行、commit 提示),不@,前缀 [WonderBear-Auto] ℹ️
#   - send-acceptance:  产品验收请求,@Kristy,前缀 [WonderBear-Auto] 🎬
#   - send-decision:    协调器自身故障,@Kristy(罕见),前缀 [WonderBear-Auto] 🔴
#
# 设计原则:所有自动化协调器发的消息都加 [WonderBear-Auto] 前缀,与 bot 自由对话回复区分

set -uo pipefail

ENV_FILE="/opt/wonderbear/server-v7/.env"
TOKEN=""

# 优先 .env
if [[ -f "$ENV_FILE" ]]; then
  TOKEN=$(grep -E '^DINGTALK_BOT_TOKEN=' "$ENV_FILE" | cut -d= -f2- | tr -d '"' || true)
fi

# fallback: memory token
if [[ -z "$TOKEN" ]]; then
  TOKEN="1e6fa6c0706fd12c32ec18326e9ef1c6cbc9ee4da3779b21fed1e6bc440ecf44"
fi

WEBHOOK="https://oapi.dingtalk.com/robot/send?access_token=$TOKEN"

TYPE="${1:-send-info}"
CONTENT="${2:-}"
[[ -z "$CONTENT" ]] && { echo "用法: $0 <send-info|send-acceptance|send-decision> <content>" >&2; exit 1; }

# 强制 wonderbear 关键词
if ! echo "$CONTENT" | grep -qi 'wonderbear'; then
  CONTENT="wonderbear $CONTENT"
fi

PREFIX="[WonderBear-Auto] "
AT_KRISTY=false

case "$TYPE" in
  send-info)        PREFIX="${PREFIX}ℹ️ "; AT_KRISTY=false ;;
  send-acceptance)  PREFIX="${PREFIX}🎬 "; AT_KRISTY=true ;;
  send-decision)    PREFIX="${PREFIX}🔴 "; AT_KRISTY=true ;;
  *) echo "未知类型: $TYPE" >&2; exit 1 ;;
esac

# WO-3.21: removed the legacy `at` field from the payload. It was the
# real root cause of errcode 450103 ("只有群主可以@全体成员") when calling
# the custom robot webhook from a shell script — DingTalk's server
# rejects the call as soon as the AT block is present without a matching
# mobile whitelist on the bot config, even when no users are referenced.
# AT_KRISTY now only controls the visual prefix emoji. We keep the
# variable so callers can still tell info / acceptance / decision apart
# in router logs.
PAYLOAD=$(jq -n --arg c "${PREFIX}${CONTENT}" \
  '{msgtype:"text",text:{content:$c}}')

RESPONSE=$(curl -sS -m 10 -X POST "$WEBHOOK" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" 2>&1) || { echo "钉钉发送失败: $RESPONSE" >&2; exit 1; }

if echo "$RESPONSE" | grep -q '"errcode":0'; then
  echo "✅ [$TYPE] 已发送"
else
  echo "⚠️ 钉钉响应异常: $RESPONSE" >&2
  exit 1
fi
