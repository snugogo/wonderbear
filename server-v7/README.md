# WonderBear server-v7

AI 儿童故事投影仪服务端(Node.js 20 + Fastify 4 + PostgreSQL 15 + Redis 7 + Prisma)。

> **这是批次 0 骨架交付**。Health 路由可跑通,业务接口(auth/device/story/subscription 等)在后续批次实现。

---

## Day 0 — 本地五分钟跑通

前置:本地装好 Docker、Node.js 20+、git。

### 1. 解压并进入目录

```bash
cd server-v7
```

### 2. 准备 .env

```bash
cp .env.example .env
```

最小可跑通的 `.env` 只需要 `infra` 组(DATABASE_URL / JWT_SECRET / REDIS_URL 已在 `.env.example` 给了默认值,直接能用)。其他 7 组(mail/ai/tts/speech/stripe/paypal/storage)可以留空,相应 feature 不可用但服务能起。

### 3. 起 Postgres + Redis

```bash
docker compose up -d
```

**预期输出**:
```
[+] Running 3/3
 ✔ Network server-v7_default       Created
 ✔ Container wonderbear_postgres   Started
 ✔ Container wonderbear_redis      Started
```

确认健康:`docker compose ps` 两个容器都应是 `healthy`。

### 4. 安装依赖

```bash
npm install
```

预期约 90 秒,不报错即可。

### 5. 初始化数据库(创建 12 张表)

```bash
npx prisma migrate dev --name init
```

**预期输出**:
```
Applying migration `20260421xxxxxx_init`
... your database is now in sync with your schema.
✔ Generated Prisma Client (v5.x.x) to ./node_modules/@prisma/client
```

如果想可视化看表结构:`npx prisma studio`(打开 localhost:5555)。

### 6. 检查 env 配置

```bash
npm run check-keys
```

**预期输出(仅 infra 配置了)**:
```
WonderBear env audit
====================
  [infra   ]  OK
  [mail    ]  SKIP (not configured): RESEND_API_KEY
  [ai      ]  SKIP (not configured): OPENAI_API_KEY GEMINI_API_KEY FAL_KEY
  [tts     ]  SKIP (not configured): ELEVENLABS_API_KEY VOICE_ID_EN
  [speech  ]  SKIP (not configured): GOOGLE_SPEECH_KEY
  [stripe  ]  SKIP (not configured): STRIPE_SECRET_KEY ...
  [paypal  ]  SKIP (not configured): PAYPAL_CLIENT_ID ...
  [storage ]  SKIP (not configured): R2_ACCOUNT_ID ...

⚠  7 feature group(s) not configured: mail ai tts speech stripe paypal storage
   Server will boot, but these features will fail at first use.
✅ infra group OK — server can start.
```

如果 infra 组不全,脚本会 **exit 1**,按提示补齐 `.env` 再重跑。

### 7. 启动服务

```bash
npm run dev
```

**预期输出**:
```
[HH:MM:ss] INFO: ✅ Prisma connected to PostgreSQL
[HH:MM:ss] INFO: ✅ Redis connected
[HH:MM:ss] INFO: Server listening at http://0.0.0.0:3000
[HH:MM:ss] INFO: 🚀 WonderBear server-v7 running on port 3000 (development)
```

### 8. 验证 health 响应符合 v7 契约

另开一个终端:

```bash
curl -s http://localhost:3000/api/health | jq
```

**预期输出**(仅 infra 配置,所有上游 skipped):
```json
{
  "code": 0,
  "data": {
    "status": "ok",
    "version": "0.1.0",
    "services": {
      "db": "ok",
      "redis": "ok",
      "openai": "skipped",
      "gemini": "skipped",
      "fal": "skipped",
      "elevenlabs": "skipped",
      "resend": "skipped",
      "stripe": "skipped",
      "paypal": "skipped",
      "speech": "skipped"
    },
    "serverTime": "2026-04-21T..."
  },
  "requestId": "req_xxxxxxxxxxxx"
}
```

HTTP 响应头会带 `X-Request-Id: req_xxxxxxxxxxxx`。

---

## 批次 0 的验收标准

- [x] 12 张表 Prisma schema 一次 migrate 到位
- [x] `npm run check-keys` 对未配的 key warn 不阻断,infra 缺则报错退出
- [x] `curl /api/health` 返回 v7 格式 `{code:0, data:{...}, requestId}`
- [x] db/redis 挂了时 health 返回 HTTP 503(LB 会踢掉该实例)
- [x] 上游服务挂了时 health 返回 HTTP 200 + `status:'degraded'`(只告警不踢)
- [x] 9 个上游 ping 都有真实实现,有 key 则真探针,没 key 返回 skipped
- [x] 上游探针 60 秒内存缓存,避免 LB 每几秒探活都打上游

---

## 目录结构

```
server-v7/
├── .env.example              # 8 组 env 全列 + 中文注释
├── .gitignore
├── README.md                 # 本文件
├── docker-compose.yml        # PG15 + Redis7
├── nodemon.json
├── package.json              # Fastify 4 / Prisma 5 / ESM
├── prisma/
│   └── schema.prisma         # 12 张表 ⭐
├── scripts/
│   └── check-keys.sh         # Day 0 自检
├── docs/                       # 项目文档(详见 docs/README.md)
│   ├── README.md                       # docs 索引
│   ├── CHANGELOG.md                    # 变更日志(原 PROTOCOL_AMENDMENTS)
│   ├── spec/                           # 权威规范
│   │   ├── PROMPT_SPEC_v7_1.md             # LLM + 生图 prompt(批次 4 用)
│   │   └── API_CONTRACT_PATCH_v2.md        # 协议补充 patch
│   ├── handoff/                        # 窗口交接包
│   │   └── HANDOFF_BATCH2.md
│   └── ops/                            # 操作指南
│       └── GIT_INIT.md                     # monorepo 初始化指令
├── test/
│   └── smoke/run.mjs         # 72 个断言,跑批次 0+1 全链路
└── src/
    ├── app.js                # Fastify app factory
    ├── server.js             # 启动 + 优雅关停
    ├── config/
    │   └── env.js            # 8 组 ENV_GROUPS + validateEnvGroup
    ├── plugins/
    │   ├── prisma.js
    │   ├── redis.js
    │   ├── requestId.js          # 批次 1:req_xxx 生成 + locale 解析
    │   ├── responseEnvelope.js   # 批次 1:onSend 自动包装 v7 envelope
    │   └── errorHandler.js       # 批次 1:BizError → 错误信封 + 5xx 兜底
    ├── utils/
    │   ├── errorCodes.js     # 批次 1:36+ 错误码 4 语言消息
    │   ├── response.js       # 批次 1:BizError 类 + ok() 工具
    │   └── locale.js         # 批次 1:body > Accept-Language > 'en'
    └── routes/
        └── health.js         # 9 上游 ping + db/redis + v7 响应格式
```

## 12 张表一览

| 表 | 作用 |
|---|---|
| **Device** | 物理设备,存 `storiesLeft`(一次性 6 本额度挂这里不挂账户) |
| **ActivationCode** | 激活码,状态 issued/activated/transferred/revoked |
| **Parent** | 家长账户,密码可选(邮箱验证码为主) |
| **Child** | 孩子档案,每家长最多 4 个 |
| **Story** | 12 页绘本,pages/dialogue/metadata 都是 Jsonb |
| **Subscription** | 订阅,pdfExportsLeft 挂这里(storiesLeft 挂 Device) |
| **PdfTask** | 异步 PDF 合成任务 |
| **ContentAlert** | 三级内容安全告警(脱敏存储) |
| **ImageGenLog** | 三路生图监控,调优降级策略 |
| **Seller** | 经销商账户(批次 7) |
| **OemConfig** | OEM 贴牌配置(含 `h5BaseUrl` 用于 TV 二维码绑定 URL,见 API_CONTRACT §14.5) |
| **TelemetryEvent** | 埋点事件,按 deviceId+timestamp 索引 |

## 后续批次路线

| 批次 | 内容 | 依赖 |
|---|---|---|
| **0** ✅ | 骨架 + 12 表 + health | — |
| **1** ✅ | 响应格式全局 hook + 5 位错误码表 + requestId 插件 + BizError | 0 |
| 2 | `/api/auth/*` 验证码登录全链路 + Resend | 1 |
| 3 | `/api/device/*` + `/api/child/*` | 2 |
| 4 | `/api/story/*` 三路降级 + Bull 队列 | 3 |
| 5 | Stripe + PayPal + PDF | 4 |
| 6 | OTA + telemetry + OEM + dev tools | 5 |
| 7 | 经销商 Console | 6 |

## 部署工作流

本地开发 → push 到 GitHub → 服务器 `git pull` + `pm2 reload`。`.env` 绝不进 Git。

---

**版本**: 0.1.0 · 批次 0 · 2026-04-21
