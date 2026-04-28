#!/bin/bash
# push-knowledge.sh
# 每天凌晨 4:05 自动 commit + push LESSONS.md 和 STATUS.md 到 main
# 替代了原来的 push-lessons.sh
# 三道闸:
#   1. 只 commit LESSONS.md / STATUS.md / STATUS-ARCHIVE/ 三类文件
#   2. 如果 working tree 有别的未 commit 改动 -> 跳过
#   3. 只在 main 分支推

set -e

LOG_FILE="/tmp/push-knowledge.log"
REPO_DIR="/opt/wonderbear"
LESSONS_FILE="dingtalk-bot/LESSONS.md"
STATUS_FILE="dingtalk-bot/STATUS.md"
ARCHIVE_DIR="dingtalk-bot/STATUS-ARCHIVE"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

log "=== push-knowledge.sh start ==="

cd "$REPO_DIR" || { log "ERROR: cannot cd to $REPO_DIR"; exit 1; }

# 闸 3: 只在 main 推
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "main" ]; then
  log "WARN: 当前分支 $CURRENT_BRANCH 不是 main, 跳过推送"
  exit 0
fi

# 闸 1: 检查这 3 类文件是否有变化
HAS_CHANGES=0
if ! git diff --quiet HEAD -- "$LESSONS_FILE" 2>/dev/null || ! git diff --quiet --cached -- "$LESSONS_FILE" 2>/dev/null; then
  HAS_CHANGES=1
fi
if ! git diff --quiet HEAD -- "$STATUS_FILE" 2>/dev/null || ! git diff --quiet --cached -- "$STATUS_FILE" 2>/dev/null; then
  HAS_CHANGES=1
fi
# Untracked LESSONS / STATUS 文件 (首次)
if git status --porcelain | grep -E "^\?\? (dingtalk-bot/LESSONS\.md|dingtalk-bot/STATUS\.md|dingtalk-bot/STATUS-ARCHIVE)" > /dev/null; then
  HAS_CHANGES=1
fi
# Archive 目录的变化
if [ -d "$ARCHIVE_DIR" ]; then
  if ! git diff --quiet HEAD -- "$ARCHIVE_DIR" 2>/dev/null; then
    HAS_CHANGES=1
  fi
fi

if [ "$HAS_CHANGES" -eq 0 ]; then
  log "无变化, 跳过"
  exit 0
fi

# 闸 2: 检查 working tree 是否有这 3 类之外的脏文件
DIRTY=$(git status --porcelain | grep -v "$LESSONS_FILE" | grep -v "$STATUS_FILE" | grep -v "$ARCHIVE_DIR" | grep -v "^??" || true)
if [ -n "$DIRTY" ]; then
  log "ERROR: working tree 有 LESSONS/STATUS 之外的未 commit 改动, 跳过"
  log "脏文件:"
  echo "$DIRTY" >> "$LOG_FILE"
  exit 0
fi

# 执行 commit + push
log "添加 LESSONS / STATUS / ARCHIVE..."
git add "$LESSONS_FILE" "$STATUS_FILE"
[ -d "$ARCHIVE_DIR" ] && git add "$ARCHIVE_DIR"

DATE_STR=$(date '+%Y-%m-%d')
LESSONS_COUNT=$(grep -c "^### $DATE_STR " "$LESSONS_FILE" 2>/dev/null || echo "0")

log "提交..."
git commit -m "📚 LESSONS+STATUS 自动累积 - $DATE_STR (今日 $LESSONS_COUNT 条新教训)" >> "$LOG_FILE" 2>&1 || {
  log "WARN: commit 失败 (可能无变化)"
  exit 0
}

log "推送到 origin main..."
if git push origin main >> "$LOG_FILE" 2>&1; then
  log "SUCCESS: 已推送"
  if [ -f "/opt/wonderbear/coordination/.dingtalk-webhook" ]; then
    WEBHOOK=$(cat /opt/wonderbear/coordination/.dingtalk-webhook 2>/dev/null)
    if [ -n "$WEBHOOK" ]; then
      curl -s -X POST "$WEBHOOK" \
        -H 'Content-Type: application/json' \
        -d "{\"msgtype\":\"text\",\"text\":{\"content\":\"wonderbear 📚 知识库已自动推送到 main ($DATE_STR, $LESSONS_COUNT 条新教训)\"}}" \
        >> "$LOG_FILE" 2>&1 || log "DingTalk 通知失败 (非致命)"
    fi
  fi
else
  log "ERROR: push 失败"
  exit 1
fi

log "=== push-knowledge.sh end ==="
