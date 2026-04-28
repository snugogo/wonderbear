# WORKORDER: tv-html VPS production 部署

From: Kristy
To: VPS Claude
Date: 2026-04-28 上午
预算: $0
时限: 2 小时
展会倒计时: 48 小时

## 目标

让 Kristy 在浏览器开 http://154.217.234.241/ 访问 production tv-html, 看到 19 本真书。

## 背景

本地 vite dev server 5176 的 9 个屏全部 import.meta.env.DEV 短路, 强制 mock 12 本。改 9 个屏代码风险大。换部署形态: VPS nginx 80 端口 + /api 反代 :3000 + 静态产物。production build 自动 import.meta.env.DEV=false, dev 短路全失效, 零代码改动。

## 范围 do

1. 检查 nginx, 没装 apt install -y nginx
2. cd /opt/wonderbear/tv-html, git pull origin fix/tv-gallery-v2, npm install, npm run build
3. mkdir -p /var/www/wonderbear-tv, rsync -av --delete dist/ /var/www/wonderbear-tv/
4. 写 /etc/nginx/sites-available/wonderbear-tv:
   - listen 80 default_server
   - root /var/www/wonderbear-tv, index index.html
   - location /api/ { proxy_pass http://127.0.0.1:3000; proxy_http_version 1.1; proxy_set_header Host \$host; proxy_set_header X-Real-IP \$remote_addr; proxy_read_timeout 600s; proxy_send_timeout 600s; }
   - location / { try_files \$uri \$uri/ /index.html; }
   - location /assets/ { expires 30d; add_header Cache-Control "public, immutable"; }
5. ln -sf 到 sites-enabled, 现有 default 改名 default.bak.20260428 不要删
6. nginx -t, systemctl reload nginx
7. VPS 自测 4 条 curl: 静态首页 200, /api/health 通, SPA fallback /library 200, storyList total=19
8. 写报告 coordination/done/2026-04-28-vps-tv-deploy-report.md, git push
9. 钉钉通知 Kristy: 访问 URL + token 注入说明

## 范围外 dont

不改 vue 代码. 不改 vite.config.ts. 不动 dev 短路. 不做 HTTPS. 不重启 server-v7. 不改 server-v7 配置. 不"顺手"做别的.

## 红线

不重启 server-v7. 不动 :3000. 不删 nginx default 配置 (rename). build 失败立即 blocker. nginx -t 失败立即 blocker. /api 反代 404/502 立即 blocker.

## 验收 Kristy 早上

1. 浏览器 http://154.217.234.241/
2. 跳激活就在 console: localStorage.setItem('wb_device_token', '<deviceToken>'); location.reload();
3. Library 显示 19 stories, 第一本中文标题
4. 点进去 12 页有图能翻
5. Favorites 1 本, Create 3 本, Bear Stars editor_picks 抽样, Learning 中英能切

## deliverable

- http://154.217.234.241/ 可访问
- 报告含 4 条 sanity curl 输出 + nginx 配置路径 + build 产物路径
- 钉钉通知

By: Kristy (派单走 VPS 直写, 跳过 git)
