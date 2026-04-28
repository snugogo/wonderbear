#!/bin/bash
# push-lessons.sh
# 每天凌晨 4:05 自动 commit + push LESSONS.md 到 main
# 三道闸:
#   1. 只 commit LESSONS.md 这一个文件
#   2. 如果 working tree 有别的未 commit 改动 -> 跳过,防误推半成品
#   3. 如果 LESSONS.md 没变化 -> 跳过,无意义 commit

set -e

LOG_FILE="/tmp/push-lessons.log"
REPO_DIR="/opt/wonderbear"
LESSONS_FILE="dingtalk-bot/LESSONS.md"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

log "=== push-lessons.sh start ==="

cd "$REPO_DIR" || { log "ERROR: cannot cd to $REPO_DIR"; exit 1; }

# 闸 1: 检查 LESSONS.md 是否有变化
if git diff --quiet HEAD -- "$LESSONS_FILE" 2>/dev/null && git diff --quiet --cached -- "$LESSONS_FILE" 2>/dev/null; then
  log "LESSONS.md 无变化,跳过"
  exit 0
fi

# 闸 2: 检查 working tree 是否有 LESSONS.md 之外的未 commit 改动
DIRTY=$(git status --porcelain | grep -v "$LESSONS_FILE" | grep -v "^??" || true)
if [ -n "$DIRTY" ]; then
  log "ERROR: working tree 有 LESSONS.md 之外的未 commit 改动,跳过自动推送"
  log "脏文件列表:"
  echo "$DIRTY" >> "$LOG_FILE"
  exit 0
fi

# 闸 3: 检查当前分支是否 main(只在 main 上推)
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "main" ]; then
  log "WARN: 当前分支是 $CURRENT_BRANCH 不是 main,跳过推送"
  exit 0
fi

# 执行 commit + push
log "添加 LESSONS.md..."
git add "$LESSONS_FILE"

DATE_STR=$(date '+%Y-%m-%d')
COUNT=$(grep -c "^### $DATE_STR " "$LESSONS_FILE" 2>/dev/null || echo "0")

log "提交..."
git commit -m "📚 LESSONS.md 自动累积 - $DATE_STR ($COUNT 条新教训)" >> "$LOG_FILE" 2>&1

log "推送到 origin main..."
if git push origin main >> "$LOG_FILE" 2>&1; then
  log "SUCCESS: 已推送 $COUNT 条新教训"
  # DingTalk 通知 (使用 bot-cn-1 wonderbear,不是 bot-cn-3)
  if [ -f "/opt/wonderbear/coordination/.dingtalk-webhook" ]; then
    WEBHOOK=$(cat /opt/wonderbear/coordination/.dingtalk-webhook 2>/dev/null)
    if [ -n "$WEBHOOK" ]; then
      curl -s -X POST "$WEBHOOK" \
        -H 'Content-Type: application/json' \
        -d "{\"msgtype\":\"text\",\"text\":{\"content\":\"wonderbear 📚 LESSONS.md 已自动推送 $COUNT 条新教训到 main ($DATE_STR)\"}}" \
        >> "$LOG_FILE" 2>&1 || log "DingTalk 通知失败 (非致命)"
    fi
  fi
else
  log "ERROR: push 失败"
  exit 1
fi

log "=== push-lessons.sh end ==="
