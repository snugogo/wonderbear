#!/usr/bin/env bash
# /opt/wonderbear/coordination/deploy-tv.sh
#
# tv-html build + 部署到生产 /var/www/wonderbear-tv/
# 自动备份当前生产版本(允许秒级回滚)
#
# 用法: bash deploy-tv.sh <wo_id>
# 退出码: 0=成功, 1=build失败, 2=cp失败
# 输出: DEPLOY_BACKUP_PATH=/var/www/wonderbear-tv.bak-<TS>

set -uo pipefail
WO_ID="${1:?用法: $0 <wo_id>}"
TS=$(date +%Y%m%d-%H%M%S)
LOG_TAG="[deploy-tv][$WO_ID]"

cd /opt/wonderbear/tv-html || { echo "$LOG_TAG ❌ tv-html 目录不存在"; exit 1; }

echo "$LOG_TAG === build start ==="
npm run build 2>&1 | tail -20
BUILD_RC="${PIPESTATUS[0]}"
if [ "$BUILD_RC" -ne 0 ]; then
  echo "$LOG_TAG ❌ build 失败 (rc=$BUILD_RC)"
  exit 1
fi

if [ ! -d /opt/wonderbear/tv-html/dist ] || [ -z "$(ls -A /opt/wonderbear/tv-html/dist 2>/dev/null)" ]; then
  echo "$LOG_TAG ❌ dist 目录不存在或为空"
  exit 1
fi
echo "$LOG_TAG ✅ build OK"

# 备份当前生产
BACKUP_PATH="/var/www/wonderbear-tv.bak-$TS-$WO_ID"
if [ -d /var/www/wonderbear-tv ]; then
  echo "$LOG_TAG === 备份当前生产到 $BACKUP_PATH ==="
  cp -r /var/www/wonderbear-tv "$BACKUP_PATH" 2>/dev/null
  # 只保留最近 10 个备份(节省磁盘)
  ls -dt /var/www/wonderbear-tv.bak-* 2>/dev/null | tail -n +11 | xargs -r rm -rf
fi

# 部署新版
echo "$LOG_TAG === 部署 dist → /var/www/wonderbear-tv ==="
rm -rf /var/www/wonderbear-tv/assets/index-* 2>/dev/null
cp -r /opt/wonderbear/tv-html/dist/* /var/www/wonderbear-tv/
CP_RC=$?
if [ "$CP_RC" -ne 0 ]; then
  echo "$LOG_TAG ❌ cp 失败 (rc=$CP_RC)"
  echo "$LOG_TAG 自动回滚: cp -r $BACKUP_PATH/* /var/www/wonderbear-tv/"
  cp -r "$BACKUP_PATH"/* /var/www/wonderbear-tv/ 2>/dev/null
  exit 2
fi

echo "$LOG_TAG ✅ 部署完成"
echo "DEPLOY_BACKUP_PATH=$BACKUP_PATH"
exit 0
