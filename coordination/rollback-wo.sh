#!/usr/bin/env bash
# /opt/wonderbear/coordination/rollback-wo.sh
#
# 回滚某工单 — 用部署备份秒级恢复 + git revert
# 用法: bash rollback-wo.sh <wo_id>

set -uo pipefail
WO_ID="${1:?用法: $0 <wo_id>}"

cd /opt/wonderbear || exit 1
LOG_TAG="[rollback][$WO_ID]"

# === Step 1: 找最近的部署备份(秒级回滚最快) ===
BACKUP=$(ls -dt /var/www/wonderbear-tv.bak-*-${WO_ID} 2>/dev/null | head -1)
if [ -z "$BACKUP" ]; then
  # fallback: 找上一次任意的备份
  BACKUP=$(ls -dt /var/www/wonderbear-tv.bak-* 2>/dev/null | head -2 | tail -1)
fi

if [ -n "$BACKUP" ] && [ -d "$BACKUP" ]; then
  echo "$LOG_TAG === 用备份秒级回滚 $BACKUP → /var/www/wonderbear-tv ==="
  rm -rf /var/www/wonderbear-tv/assets/index-* 2>/dev/null
  cp -r "$BACKUP"/* /var/www/wonderbear-tv/
  echo "$LOG_TAG ✅ 部署回滚完成 (用 $BACKUP)"
else
  echo "$LOG_TAG ⚠️  没找到部署备份,跳过部署回滚"
fi

# === Step 2: git revert 该工单的 commit ===
TARGET_SHA=$(git log --oneline -50 | grep "auto: $WO_ID" | head -1 | awk '{print $1}')
if [ -z "$TARGET_SHA" ]; then
  echo "$LOG_TAG ⚠️  找不到 $WO_ID 的 commit,跳过 git revert"
  echo "$LOG_TAG    部署已用备份回滚,但 git 历史保留 commit"
  exit 0
fi

echo "$LOG_TAG === git revert $TARGET_SHA ==="
git revert --no-edit "$TARGET_SHA" 2>&1 | tail -5
REV_RC="${PIPESTATUS[0]}"
if [ "$REV_RC" -ne 0 ]; then
  echo "$LOG_TAG ⚠️  git revert 失败 (有 conflict),需手动处理"
  echo "$LOG_TAG    部署已用备份回滚,git 历史保留原 commit"
  git revert --abort 2>/dev/null
  exit 1
fi

CURRENT_BRANCH=$(git branch --show-current)
git push origin "$CURRENT_BRANCH" 2>&1 | tail -3
echo "$LOG_TAG ✅ revert + push 完成"

# 标记 queue.json 该工单为 rolled_back
bash /opt/wonderbear/coordination/queue-helper.sh set-status "$WO_ID" "rolled_back" 2>/dev/null

echo "$LOG_TAG ✅ $WO_ID 已完整回滚"
exit 0
