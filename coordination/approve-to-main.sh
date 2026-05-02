#!/usr/bin/env bash
# /opt/wonderbear/coordination/approve-to-main.sh
#
# 把 release 分支的某个 commit cherry-pick 到 main + push
# Kristy "通过" 时调,或 L1 工单 auto-commit 后自动调
#
# 用法: bash approve-to-main.sh <wo_id> [commit_sha]

set -uo pipefail
WO_ID="${1:?用法: $0 <wo_id> [commit_sha]}"
COMMIT_SHA="${2:-}"

cd /opt/wonderbear || exit 1
LOG_TAG="[approve-to-main][$WO_ID]"

CURRENT_BRANCH=$(git branch --show-current)

# 找到 commit SHA(如果没传)
if [ -z "$COMMIT_SHA" ]; then
  COMMIT_SHA=$(git log --oneline -50 | grep "auto: $WO_ID" | head -1 | awk '{print $1}')
  if [ -z "$COMMIT_SHA" ]; then
    echo "$LOG_TAG ❌ 找不到 $WO_ID 的 commit (寻找 'auto: $WO_ID' 标记)"
    exit 1
  fi
fi
echo "$LOG_TAG 目标 commit: $COMMIT_SHA"

# 切到 main + pull 最新
echo "$LOG_TAG === 切换到 main 分支 ==="
git checkout main 2>&1 | tail -3
PULL_OUT=$(git pull origin main 2>&1 | tail -3)
echo "$LOG_TAG pull: $PULL_OUT"

# Cherry-pick
echo "$LOG_TAG === Cherry-pick $COMMIT_SHA ==="
git cherry-pick "$COMMIT_SHA" 2>&1 | tail -5
CP_RC="${PIPESTATUS[0]}"
if [ "$CP_RC" -ne 0 ]; then
  echo "$LOG_TAG ❌ cherry-pick 失败 (有 conflict?)"
  git cherry-pick --abort 2>/dev/null
  git checkout "$CURRENT_BRANCH" 2>&1 | tail -2
  exit 1
fi

# Push main
echo "$LOG_TAG === push origin main ==="
git push origin main 2>&1 | tail -5
PUSH_RC="${PIPESTATUS[0]}"
if [ "$PUSH_RC" -ne 0 ]; then
  echo "$LOG_TAG ⚠️  push main 失败 (rc=$PUSH_RC)"
  git checkout "$CURRENT_BRANCH" 2>&1 | tail -2
  exit 1
fi

# 切回原分支
git checkout "$CURRENT_BRANCH" 2>&1 | tail -2
echo "$LOG_TAG ✅ $WO_ID 已合并到 main"
exit 0
