# WORKORDER: tv-html VPS production 部署

**From**: Kristy (本地 morning window Local Claude 协助起草)
**To**: VPS Claude
**Date**: 2026-04-28 上午
**Branch**: `fix/tv-gallery-v2`
**预算**: $0 (无 API 调用)
**时限**: 2 小时上限
**展会倒计时**: 48 小时

---

## §1 目标

让 Kristy 在任意浏览器打开 `http://154.217.234.241/` 访问 production 模式的 tv-html, 验收 19 本真书的展示、翻页、收藏、Bear Stars、Create 等屏。

---

## §2 为什么要做

本地 vite dev server (5176) 的 9 个屏全部包含 `import.meta.env.DEV` 短路, 强制渲染 mock 12 本, 无法在浏览器验 production 路径。

今早已尝试两种 workaround:
- console 注入 token + base URL → API 调用通了 (CORS 过), 但屏自身 mock 短路绕不过
- sed 改 LibraryScreen 的 `isDevBrowser` → 牵连到其他 8 个屏 (CreateScreen / FavoritesScreen / StoryCoverScreen / StoryBodyScreen / LearningScreen / DialogueScreen / GeneratingScreen / ActivationScreen 都有同样模式), 修改面太大, 风险与展会冲刺不匹配

决定换部署形态: VPS 上 build production 静态产物 + nginx 80 端口 + `/api` 反代到本地 3000。production build 中 `import.meta.env.DEV === false`, 所有 dev 短路自动失效, 零代码改动。

---

## §3 范围 (do)

### 3.1 nginx 准备
- `systemctl status nginx` 检查
- 没装就 `apt update && apt install -y nginx`
- 检查 80 端口未被占用: `ss -tlnp | grep ':80 '`

### 3.2 build tv-html
- `cd /opt/wonderbear/tv-html`
- `git pull origin fix/tv-gallery-v2` (确认 HEAD 与 GitHub 同步, 当前应为 `689e5b3` 或更新)
- `npm install` (如有新依赖)
- `npm run build`
- 确认 `dist/index.html` + `dist/assets/` 存在

### 3.3 部署静态产物
- `mkdir -p /var/www/wonderbear-tv`
- `rsync -av --delete dist/ /var/www/wonderbear-tv/`
- 确认权限: `chown -R www-data:www-data /var/www/wonderbear-tv`

### 3.4 nginx server block
新增 `/etc/nginx/sites-available/wonderbear-tv`:

```nginx
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    root /var/www/wonderbear-tv;
    index index.html;

    # API 反代到 server-v7 (保留 /api 前缀)
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
    }

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 静态资源缓存 (assets 已 hash 命名)
    location /assets/ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

启用:
- `ln -sf /etc/nginx/sites-available/wonderbear-tv /etc/nginx/sites-enabled/`
- 如果 `/etc/nginx/sites-enabled/default` 存在且占 80, **rename 备份**为 `default.bak.20260428` 而不是删除
- `nginx -t`
- `systemctl reload nginx`

### 3.5 VPS 自测 (写到报告里)
```bash
# 1. 静态首页
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://localhost/
# 期望: 200 text/html

# 2. /api 反代
curl -s http://localhost/api/health
# 期望: server-v7 健康响应 JSON

# 3. SPA fallback
curl -s -o /dev/null -w "%{http_code}\n" http://localhost/library
# 期望: 200 (回 index.html)

# 4. 真 storyList 经过 nginx 反代
DEVICE_TOKEN=$(jq -r .deviceToken /tmp/e2e-test-context.json)
CHILD_ID=$(jq -r .childId /tmp/e2e-test-context.json)
curl -s -H "Authorization: Bearer $DEVICE_TOKEN" \
  "http://localhost/api/story/list?childId=$CHILD_ID&limit=50" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print('total:',d.get(chr(100)+chr(97)+chr(116)+chr(97),{}).get(chr(116)+chr(111)+chr(116)+chr(97)+chr(108)))"
# 期望: total: 19
```

### 3.6 报告
写 `coordination/done/2026-04-28-vps-tv-deploy-report.md`, 包含:
- nginx 版本 + 配置文件路径
- build 产物大小 (`du -sh /var/www/wonderbear-tv`)
- 4 条 sanity curl 实际输出
- token 注入说明 (Kristy 早上验收时用)
- 任何遇到的坑

git push 到 `fix/tv-gallery-v2`。

### 3.7 钉钉通知
通过现有 outgoing webhook 通知 Kristy:
- 部署完成 + URL
- 是否需要 token 注入 (大概率需要)
- 验收清单链接到 §6

---

## §4 范围外 (don't)

- ❌ 不改任何 .vue 代码
- ❌ 不改 vite.config.ts
- ❌ 不动 dev 短路 (`isDevBrowser` / `isDemoMode` / `import.meta.env.DEV`)
- ❌ 不做 HTTPS / 域名 / SSL 证书
- ❌ 不重启 server-v7 (PM2 wonderbear-server 不能动)
- ❌ 不改 server-v7 的任何配置或 .env
- ❌ 不调任何付费 API
- ❌ 不"顺便"再做点别的

参考凌晨 HANDOFF §6 陷阱 1: 展会冲刺期间, 拒绝任何范围外改动, 哪怕看起来很顺手。

---

## §5 红线

- 🚫 不重启 server-v7 (会断现有 19 本验收数据)
- 🚫 不动 :3000 端口的任何配置
- 🚫 不删除现有 `/etc/nginx/sites-enabled/default` (如有, 改 rename 备份)
- 🚫 不污染 PM2 (本部署是 nginx, 不进 PM2 管理)
- 🚫 build 失败 → 立即写 blocker, 抓完整 vite 报错, 不要硬绕
- 🚫 nginx -t 失败 → 立即 blocker, 不要 reload
- 🚫 反代后 /api 返回 404/502 → 立即 blocker, 不要在前端代码里 hack
- 🚫 任何"顺手"改动 → 拒绝

---

## §6 验收 (Kristy 早上做)

### Step 1: 浏览器开 `http://154.217.234.241/`

### Step 2: 如果跳激活屏 / 一片白
浏览器 console (F12) 跑:
```js
localStorage.setItem('wb_device_token', '<paste deviceToken>');
location.reload();
```

deviceToken 来源: `ssh root@154.217.234.241` → `cat /tmp/e2e-test-context.json` → 复制 deviceToken 字段值 (无引号)

### Step 3: 验收清单
- [ ] Library/Stories 屏右上角显示 **19 stories** (不是 12)
- [ ] 第一本是中文标题《彩虹森林的閃亮果子》或类似真生成的标题
- [ ] 点进任一本 → Story Cover 屏正常 → 进 Body → 12 页能翻、有图 (R2 CDN)
- [ ] 收藏 (Favorites 屏) 显示 1 本
- [ ] Create 屏显示最近 3 本
- [ ] Bear Stars Editor 精选 tab 显示从 19 本随机抽样
- [ ] Learning 屏切换中英能播 (注意 status 真实值是 `completed` 不是 `done`)

### Step 4: 任何屏空白 / 报错 / 还显示 12 本
- 截图 + DevTools Network tab 红色请求
- 不要立即派 fix, 先回 Local Claude 分析
- VPS Claude 视情况起 PHASE3 fix workorder

---

## §7 失败兜底

| 失败 | 行动 |
|---|---|
| nginx 装不上 | blocker, 抓 apt 报错 |
| 80 端口被其他服务占 | blocker, ss -tlnp 输出贴出来, Kristy 决策 |
| npm install 失败 | blocker, 抓 npm error log |
| npm run build 失败 | blocker, 抓 vite 完整 stderr |
| nginx -t 失败 | blocker, 抓 nginx -t 输出, 不要 reload |
| /api 反代 404 | 检查 nginx error log + server-v7 PM2 status, blocker |
| Kristy 浏览器打开还是 12 本 | 不算成功, blocker, 抓浏览器 Network tab + 后端 access log |

---

## §8 deliverable

- ✅ VPS `http://154.217.234.241/` 浏览器可访问
- ✅ Production tv-html 渲染, 显示 19 本真书
- ✅ 报告 `coordination/done/2026-04-28-vps-tv-deploy-report.md` 含 4 条 sanity curl 输出
- ✅ nginx 配置文件路径写到报告
- ✅ build 产物路径写到报告
- ✅ 钉钉通知 Kristy

---

**By: Kristy + Local Claude (morning window)**
**派单时间**: 2026-04-28 上午
**dispatch signal**: `coordination/responses/2026-04-28-tv-vps-deploy-dispatch.md`
