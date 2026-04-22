# WonderBear TV · 本地联调启动指南

> 这是 v0.3 交付时的"端到端联调跑通"完整步骤。给 snugogo 你自己的 Mac/Win 用。
> 服务端跑 docker,TV 跑 dev server,手机扫码跑激活流程。

---

## 一、前提

你需要装好:
- **Docker Desktop**(服务端跑 PG15 + Redis7 容器)
- **Node.js 20+** + **npm 10+**(TV / H5 dev server)
- **Git**

可选(但强推):
- **ngrok** 免费版(让真手机扫码不用同 WiFi 也能跑通)—— 装它最简单的方式 `brew install ngrok` 或去 ngrok.com 下载

---

## 二、把 TV 推上 git 仓库

你给我的 zip(`wonderbear-tv-v0.3.zip`)解压后是 `wonderbear-tv/` 目录,要放进你 git monorepo 的 `tv-html/` 目录下:

```bash
# 假设你的 monorepo 已经 clone 在 ~/work/wonderbear
cd ~/work/wonderbear

# 检查 tv-html 目录(README 写"待开工",目录可能存在但是空的)
ls tv-html/   # 如果不存在就 mkdir tv-html

# 把 v0.3 zip 解压进去
unzip ~/Downloads/wonderbear-tv-v0.3.zip -d tv-html/

# 解压后会变成 ~/work/wonderbear/tv-html/wonderbear-tv/...
# 我们要把内容直接放在 tv-html/ 下,不要嵌套一层
mv tv-html/wonderbear-tv/* tv-html/wonderbear-tv/.* tv-html/ 2>/dev/null
rmdir tv-html/wonderbear-tv

# 确认结构对了
ls tv-html/
# 应该看到: package.json  src/  index.html  vite.config.ts  tsconfig.json  README.md  HANDOFF_TO_NEXT_WINDOW.md  ...

# 提交
git add tv-html/
git commit -m "feat(tv-html): v0.3 — 12 P0 screens + contract realigned to v7 git authoritative"
git push origin main
```

push 之后 GitHub 上 `tv-html/` 目录的 README 应该不再写"待开工",而是 `tv-html/README.md` 详述项目。

> 如果你对 monorepo 结构有不同布局,把上面的 `tv-html/` 替换成实际目录名就行。

---

## 三、起服务端(Docker)

按 `server-v7/README.md` 的"Day 0 五分钟跑通"走:

```bash
cd ~/work/wonderbear/server-v7

# 1. 准备 .env
cp .env.example .env
# .env.example 默认值能跑(infra 组),其他 7 组可空着,等批次推到要用时再填 key

# 2. 起 PG15 + Redis7 容器
docker compose up -d
# 应该看到 wonderbear_postgres + wonderbear_redis 都 healthy

# 3. 装依赖 + 建表
npm install                     # 约 90 秒
npx prisma migrate dev --name init   # 12 张表一次到位

# 4. 自检 env
npm run check-keys              # infra OK 即可

# 5. 起服务
npm run dev
# 应该看到: 🚀 WonderBear server-v7 running on port 3000

# 6. 另开终端,验证 health
curl -s http://localhost:3000/api/health | jq
# 应该返 {"code":0, "data":{"status":"ok",...}, "requestId":"..."}
```

服务端跑在 `http://localhost:3000`,API base 是 `/api`,所以全 URL 是 `http://localhost:3000/api/*`。

> ⚠️ **服务端目前只有 health 接口能用**(批次 0+1)。批次 2(auth)、3(device)、4(story)还没做。
> 你 TV 端跑起来后,**任何调 `/api/device/register` / `/api/story/*` 都会 404**。
> 等你这边推批次 2/3/4 才能完整联调。

---

## 四、起 TV 端(dev server)

```bash
cd ~/work/wonderbear/tv-html

# 1. 装依赖(只需第一次)
npm install     # 约 30 秒

# 2. 配 API 地址 — 指向本地 docker 服务端
cat > .env.development.local <<'EOF'
VITE_API_BASE=http://localhost:3000/api
EOF

# 3. 起 dev server
npm run dev
# 看到: ➜ Local: http://localhost:5173/

# 4. 浏览器打开 http://localhost:5173/?dev=1
#    ?dev=1 = 启用右下角 dev console
```

### Dev console 用法

右下角浮窗 🛠 点开,可以:

- **Mark activated** —— 跳过激活流程直接进 Home(联调时不依赖服务端 device/register)
- **Jump screen** —— 跳到任意 12 屏看 UI(每屏都能独立看,联调每屏不需要走完整链路)
- **Trigger error** —— 测试 ErrorScreen 的 12 种 tvAction
- **🎤 down/up** —— 模拟语音键(浏览器调试用,真机走 native bridge)
- **Offline / Online** —— 模拟网络变化,看 OfflineScreen 自动跳转

### 不依赖服务端能跑通的部分

服务端没就绪时,你也能在 TV 端看完所有 UI:
- 所有屏幕独立 UI 都能跳进去看(`Jump screen`)
- 所有错误屏 UI 都能看(`Trigger error`)
- DialogueScreen / GeneratingScreen 进去会立刻报错(因为调 API 失败),但能看到 ErrorScreen 弹出 ——**这就证明错误处理链路是通的**

### 服务端就绪后立刻能跑的链路

服务端推完批次 3(device)后:
- ✅ ActivationScreen → 真二维码 → 手机扫(见下面第五节)→ TV 自动跳 Home

服务端推完批次 4(story)后:
- ✅ Home → 创作小屋 → 7 轮对话 → AI 生成 → 12 页绘本 → 故事结束(完整心脏链路)
- ✅ 我的小书屋(列出真生成的故事)
- ✅ 识字模式(读真故事页文字)

---

## 五、让真手机扫码激活(2 种方案)

激活页 TV 上显示二维码 → 手机扫 → 跳手机 H5(就是你 git 仓库 `h5/` 目录下还没推的项目)→ H5 调 `/api/auth/register` → 服务端激活 → TV 轮询 `/device/status` 看到 `bound` → 自动跳 Home。

要让手机扫到电脑上的二维码,有 2 种方案:

### 方案 A:同 WiFi + LAN IP(零成本但最不稳)

1. 查 Mac LAN IP:
   ```bash
   ipconfig getifaddr en0      # Mac WiFi
   # 假设输出 192.168.1.42
   ```
2. 改 TV `.env.development.local`:
   ```
   VITE_API_BASE=http://192.168.1.42:3000/api
   ```
3. 改 H5 的部署地址 —— 等 H5 项目推上来再说,但 H5 的 dev server 也要 `--host 0.0.0.0` 暴露到 LAN
4. 启动 TV `npm run dev -- --host 0.0.0.0`
5. **关键**:服务端 docker compose 已经监听 `0.0.0.0:3000`,但 Mac 防火墙可能拦,你要去 系统设置 → 网络 → 防火墙 临时关掉
6. TV 二维码会指向 `http://192.168.1.42:5174/#/register?...`(假设 H5 跑在 5174)—— 手机扫了能打开

⚠️ 风险:咖啡馆/酒店 WiFi 经常有客户端隔离,LAN 互访不通。

### 方案 B:ngrok(推荐,稳)

1. 装 ngrok:`brew install ngrok && ngrok config add-authtoken <你的token>`(免费账号注册即送)
2. 给服务端做隧道:
   ```bash
   ngrok http 3000
   # 输出: Forwarding https://abc123.ngrok-free.app -> localhost:3000
   ```
3. 给 H5 做隧道(等 H5 推上来):
   ```bash
   # 另开终端
   ngrok http 5174
   ```
4. 改 TV `.env.development.local`:
   ```
   VITE_API_BASE=https://abc123.ngrok-free.app/api
   ```
5. 改 H5 的二维码 base URL —— 你需要在服务端 `OemConfig.h5BaseUrl` 数据库字段填 ngrok 给 H5 的 URL,这样 TV 调 `/api/oem/config` 拿到的 `h5BaseUrl` 就是 ngrok 地址,二维码也就对了
6. 重启 TV dev server

✅ 优点:手机随便走 4G 都能扫到,不依赖同 WiFi。
✅ HTTPS 自动:浏览器扫码 App 不会拦截 http URL。

---

## 六、Q3 决策落地:接口契约对齐流程

按你确认的 Q3=A,服务端窗口每完成一个批次,要在 `server-v7/docs/spec/api-actual.md` 追加实际接口示例。**TV 联调前**我(或下一棒 TV 接力的 Claude)要做这件事:

```bash
# 1. 拉最新 git
cd ~/work/wonderbear && git pull

# 2. 看 api-actual.md 增量
cat server-v7/docs/spec/api-actual.md
# 重点对照新批次的接口,看实际响应字段名/结构是否跟 docs/spec/API_CONTRACT.md 一致

# 3. 如果有差异,改 tv-html/src/services/api.ts 适配
#    所有类型集中在那一个文件,改起来快

# 4. 验证
cd tv-html && npm run typecheck
```

**当前 v0.3 已对齐的契约清单**(下次批次推完比对用):

| 端点 | 已实现请求字段 | 已实现响应字段 |
|---|---|---|
| `POST /device/register` | `deviceId, activationCode, hwFingerprint?, model, firmwareVer, osVersion, batchCode?` | `deviceToken, device:{id,deviceId,status,boundAt,storiesLeft}, oemConfig` |
| `GET /device/status` | — | `status, parent:{id,email,locale}\|null, activeChild:Child\|null` |
| `POST /device/heartbeat` | `currentScreen?, memoryUsageMb?, firmwareVer?, networkType?` | `pendingCommands[], serverTime` |
| `GET /device/active-child` | — | `activeChild:Child\|null, allChildren:Child[]` |
| `POST /device/active-child` | `deviceId, childId` | `activeChild:Child` |
| `POST /story/dialogue/start` | `childId, targetLang?, learningLang?` | `dialogueId, roundCount(5\|7), firstQuestion:{text,textLearning?,ttsUrl?}` |
| `POST /story/dialogue/:id/turn` | `round, userInput? OR audioBase64?, skipRemaining?` | `done, nextQuestion?, summary?, safetyLevel, safetyReplacement?` |
| `POST /story/generate` | `dialogueId, childId` | `storyId, status:'queued', queuePosition?, estimatedDurationSec, priority` |
| `GET /story/:id/status` | — | `storyId, status, progress:{stage,pagesGenerated,totalPages:12,percent}, error?, completedAt?` |
| `GET /story/:id` | — | `{story: Story}` (注意是包了一层 story) |
| `GET /story/list` | `childId?, cursor?, limit?, sort?, onlyFavorited?` | `items: StorySummary[], nextCursor, total` |
| `POST /story/:id/play-stat` | `event('start'\|'page_end'\|'complete'\|'abort'), pageNum?, timestamp, durationMs?` | `null` |
| `GET /oem/config` | — | `{oemConfig: OemConfig\|null}` (`OemConfig.h5BaseUrl` 已加,patch v2) |

**Q2 协议补充已落地**:`dialogue/turn` 的 `audioBase64` 字段 —— TV 端直接传 base64 音频,服务端内部 ASR,省 1 次往返。这条**需要你跟服务端窗口同步确认**,让批次 4 实现时按这个走。

---

## 七、常见问题

### Q. TV 启动后白屏

打开浏览器 DevTools console 看错误。常见原因:
- `VITE_API_BASE` 没配 / 配错了
- 服务端 docker 没起(`docker compose ps` 看)
- 服务端 CORS 拦截 —— 服务端 `app.js` 应该已经开了 `@fastify/cors`,如果没开你需要在那边加

### Q. 二维码扫了进 H5 但报错

H5 还没推,这条链路目前跑不通。等你把 H5 项目推到 git `h5/` 目录后再说。

### Q. DialogueScreen 进去就跳错误屏

正常 —— 服务端批次 4 没做,`/api/story/dialogue/start` 返 404 → TV 走 ErrorScreen。
等服务端推批次 4。

### Q. 想脱离服务端单独看完整 demo 给经销商看

目前 v0.3 没有内置 mock 数据模式。如果有需求,告诉我,我下一版加个 `?demo=1` URL 参数,所有 API 调用都吐预定义假数据(假对话、假 12 页故事、假图、假 TTS),完全独立于服务端。**适合明天就要 demo 的场景**。

### Q. 怎么测试 ErrorScreen 的所有 12 种 tvAction

dev console → "Trigger error" 下拉,我已经预置了 6 个代表性错误码:
- 30001 STORY_GEN_FAILED → show_retry
- 30004 QUOTA_EXHAUSTED → show_upgrade_prompt
- 30005 DAILY_LIMIT_REACHED → show_tomorrow
- 30006 CONTENT_SAFETY_BLOCKED → rewind_dialogue(回 DialogueScreen)
- 30011 ASR_FAILED → redo_speak
- 91000 NETWORK_OFFLINE → goto_offline(跳 OfflineScreen)

其他错误码的测试:用浏览器 DevTools console 跑 `__api.request('GET','/some/404/path').catch(console.error)` 触发不同 code。

---

## 八、下一步

服务端推批次 2/3/4 后,你按下面顺序联调:

1. **批次 3 device 推完** → 测激活流程
   - TV `?dev=1` → 不点 Mark activated → ActivationScreen 显二维码
   - 手机扫(用 ngrok)→ H5 完成绑定(H5 项目推完才能跑)
   - TV 自动 `/device/status` 轮询到 `bound` → 跳 Home

2. **批次 4 story 推完** → 测心脏链路
   - Home → 创作小屋 → 浏览器 dev console 模拟 `🎤 down → up`(模拟孩子说话)
   - 看是否走通 7 轮对话 → 生成屏 → 真水彩绘本

3. **联调出 bug** → 先比对 `docs/spec/api-actual.md` 和 `tv-html/src/services/api.ts`
   - 字段名差异 → 改 api.ts 适配
   - 响应结构差异 → 改对应 store 或 screen
   - 改完跑 `npm run typecheck && npm run build`,绿了再 commit

**祝你 demo 顺利。** 有问题随时告诉我,我从 git 拉最新,继续接力。

— 第二棒 TV Claude (Opus 4.7)
