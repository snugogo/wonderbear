# VPS tv-html production 部署报告

**From**: Factory Droid (VPS spawn-droid)
**To**: Kristy / VPS Claude
**Time**: 2026-04-28 08:29 UTC
**Workorder**: `coordination/workorders/2026-04-28-tv-vps-deploy/workorder.md`
**Branch**: `fix/tv-gallery-v2`
**预算**: $0
**展会倒计时**: 48h

---

## 结论

`DEPLOY OK` — http://154.217.234.241/ 已上线 production 构建,nginx 80 反代 :3000 通畅,SPA fallback OK,server-v7 未被触碰。

---

## 1. 4 条 sanity curl 完整输出

### curl 1 — 静态首页
```
$ curl -sI http://127.0.0.1/
HTTP/1.1 200 OK
Server: nginx/1.18.0 (Ubuntu)
Date: Tue, 28 Apr 2026 08:29:00 GMT
Content-Type: text/html
Content-Length: 1174
Last-Modified: Tue, 28 Apr 2026 08:28:01 GMT
Connection: keep-alive
ETag: "69f06f91-496"
Accept-Ranges: bytes
```
✅ 期望 200,实测 200。

### curl 2 — /api/health 反代
```
$ curl -s http://127.0.0.1/api/health
{"code":0,"data":{"status":"ok","version":"0.1.0","services":{"db":"ok","redis":"ok","openai":"ok","gemini":"ok","fal":"ok","elevenlabs":"ok","resend":"skipped","stripe":"skipped","paypal":"skipped","speech":"ok"},"serverTime":"2026-04-28T08:29:01.363Z"},"requestId":"req_5dY54CVDl5QF"}
```
✅ 期望 ok,实测 status=ok,所有外部依赖 ping 通(db / redis / openai / gemini / fal / elevenlabs / speech)。

### curl 3 — SPA fallback /library
```
$ curl -sI http://127.0.0.1/library
HTTP/1.1 200 OK
Server: nginx/1.18.0 (Ubuntu)
Date: Tue, 28 Apr 2026 08:29:01 GMT
Content-Type: text/html
Content-Length: 1174
Last-Modified: Tue, 28 Apr 2026 08:28:01 GMT
Connection: keep-alive
ETag: "69f06f91-496"
Accept-Ranges: bytes
```
✅ 期望 200(SPA fallback 至 index.html),实测 200。

### curl 4 — /api/story/list (期望 total=19)
**接口路径**:`GET /api/story/list`(server-v7 `src/routes/story.js:534`)

**实测**(无 token):
```
$ curl -sw "\nHTTP_STATUS=%{http_code}\n" "http://127.0.0.1/api/story/list?limit=20"
{"code":10001,"message":"Session expired, please log in again", ...}
HTTP_STATUS=200
```

⚠️ **未能直接验证 total=19**。原因记录(workorder §范围 do 第 7 条允许"如果接口路径不确定就跳过这条但记录原因",此处接口路径已确定但需鉴权才能取真实 total):

- `/api/story/list` 强制 dual-auth(device token 或 parent token),源码 `src/routes/story.js:533` `await verifyDualAuth(request, prisma)`,且后续要求 `device.activeChildId` 或 query `childId`
- VPS Droid 当前没有任何 device token / parent token,无法生成有效 token(不在范围 do 内,且会触碰范围外的鉴权流程)
- 但反代链路本身已被 curl 4 的 `HTTP_STATUS=200` + 业务错误码 `10001` 证明:
  - 不是 502(server-v7 接得到)
  - 不是 404(路由命中)
  - 走到了 server-v7 的 `verifyDualAuth` 函数返回业务错误,说明反代 + 路由 + 业务层全通
- 期望 total=19 这一条留给 Kristy 浏览器注入 token 后在 Library 页面眼测,见下方 §6

---

## 2. nginx 配置文件

**路径**:`/etc/nginx/sites-available/wonderbear-tv`(被 `/etc/nginx/sites-enabled/wonderbear-tv` 软链激活)

**完整内容**:
```nginx
server {
    listen 80 default_server;
    listen [::]:80 default_server;

    server_name _;

    root /var/www/wonderbear-tv;
    index index.html;

    # /api/ 反代 server-v7 (:3000)
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
    }

    # 静态 assets 长缓存
    location /assets/ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

**`nginx -t` 输出**:
```
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

**reload 状态**:`systemctl is-active nginx` → `active`

---

## 3. build 产物

- **源**:`/opt/wonderbear/tv-html/dist/`(`vue-tsc --noEmit && vite build` 通过,5.87s)
- **部署目标**:`/var/www/wonderbear-tv/`(rsync `--delete` 同步)
- **大小**:452K
- **结构**:
  ```
  /var/www/wonderbear-tv/
  ├── assets/
  │   ├── GalleryView-BZ5EkbVK.js  (6.51 kB / gzip 3.43 kB)
  │   ├── GalleryView-CGeRkKiJ.css (2.94 kB / gzip 1.00 kB)
  │   ├── index-DGD4mAWf.js        (308.84 kB / gzip 107.88 kB)
  │   └── index-zkD2FMHC.css       (75.67 kB / gzip 13.06 kB)
  ├── fonts/
  │   ├── fredoka-v17-latin-ext.woff2
  │   └── fredoka-v17-latin.woff2
  └── index.html                    (1.17 kB / gzip 0.66 kB)
  ```

---

## 4. 部署 URL

- 公网:**http://154.217.234.241/**(`curl -sI` 实测 200,`Server: nginx/1.18.0 (Ubuntu)`,`Last-Modified` = build 时间)
- 内网:`http://127.0.0.1/`

---

## 5. nginx default 备份说明

**操作**:Ubuntu 默认装 nginx 时随附 `default` 站点(`/etc/nginx/sites-available/default` + `/etc/nginx/sites-enabled/default` 软链)。按 workorder 红线"不删 nginx default 配置 (rename)"执行:

1. `rm /etc/nginx/sites-enabled/default`(只删软链,不删源文件)
2. `mv /etc/nginx/sites-available/default → /etc/nginx/sites-available/default.bak.20260428`(源文件改名保留)
3. 当前 `sites-available/`:
   ```
   default.bak.20260428   ← 原 default 全文备份
   wonderbear-tv         ← 新启用站点
   ```
4. 当前 `sites-enabled/`:
   ```
   wonderbear-tv -> /etc/nginx/sites-available/wonderbear-tv
   ```

**回滚指令**(如需):
```bash
mv /etc/nginx/sites-available/default.bak.20260428 /etc/nginx/sites-available/default
ln -sf /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default
rm /etc/nginx/sites-enabled/wonderbear-tv
nginx -t && systemctl reload nginx
```

---

## 6. Kristy 浏览器 token 注入命令

1. 浏览器打开 **http://154.217.234.241/**
2. 若直接进了激活/登录页(说明本地 localStorage 没有 wb_device_token),按 F12 打开 console 粘贴:
   ```js
   localStorage.setItem('wb_device_token', '<deviceToken>'); location.reload();
   ```
   把 `<deviceToken>` 换成 Kristy 自己的 device token(从 server-v7 设备对子表里拿)。
3. 验收路径(workorder §验收):
   - Library 显示 19 stories,第一本中文标题
   - 任一本点进 12 页有图能翻
   - Favorites 显示 1 本,Create 入口显示 3 本
   - Bear Stars editor_picks 抽样
   - Learning 中英可切

---

## 7. 红线遵守

- ✅ 未启动/未停止/未 reload `server-v7`(:3000),其 PID 全程未变
- ✅ 未触碰 vue 代码、未改 `vite.config.ts`
- ✅ nginx default 仅 rename 为 `default.bak.20260428`,未删
- ✅ 未做 HTTPS、未动 prisma、未改 .env
- ✅ build 一次通过,无 retry
- ✅ `nginx -t` 一次通过
- ✅ `/api` 反代验证非 502/404
- ✅ 仍在 `fix/tv-gallery-v2` 分支,未切 main、未 push main

---

## 8. 时间戳

- 0828 build OK
- 0828 rsync OK
- 0828 nginx config + symlink OK
- 0828 `nginx -t` OK
- 0828 reload OK
- 0829 4 条 curl OK
- 0829 报告写入

---

**By**: Factory Droid (spawn-droid as root, VPS local)
**Refs**: AGENTS.md §2.1 备份纪律 / §2.2 单独命令逐条 / §4.2 health 端点
