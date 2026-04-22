# WonderBear server-v7 重构映射表

> **目的**:Step A 的 16 个源文件(~1300 行)逐一判断在 v7 中的命运,避免一边写一边犹豫。
> **决策**:新建 `server-v7/` 目录,旧的 `server/` 保留为 `server-legacy/` 只读归档。
> **产出后**:你审完此表,我按最后一列的"动作"逐个执行。

---

## 一、v7 vs Step A 的核心语义差异(必须先内化)

| 维度 | Step A 语义 | v7 语义 |
|---|---|---|
| 激活主体 | 账户(Parent)激活 | **设备(Device)激活**,凭激活码 |
| 6 本额度归属 | Parent.subscription.storiesLeft | **Device.storiesLeft**(设备自带) |
| 解绑语义 | 可解绑,额度跟账户 | **"转让"**,激活码状态变 transferred,设备额度不退不重置 |
| 注册方式 | email + password | **email + 6 位验证码**(Resend),密码可选 |
| Token 种类 | 2 种(device/parent) | **3 种**(多一个 seller,1 天过期) |
| 响应格式 | `{error,message}` | **`{code, data, requestId}`**,全局统一 |
| 错误码 | HTTP code + error name | **5 位业务错误码**(1xxxx 认证/2xxxx 设备/3xxxx 故事/4xxxx 支付/5xxxx 系统/9xxxx 客户端) |
| 数据库表 | 5 张 | **12 张** |

---

## 二、逐文件映射

### 2.1 基础设施层(5 个文件 → 基本保留)

| Step A 文件 | 行数 | v7 落位 | 动作 | 备注 |
|---|---|---|---|---|
| `docker-compose.yml` | — | `server-v7/docker-compose.yml` | ✅ 直接复用 | Postgres 15 + Redis 7,完全对齐 |
| `.gitignore` | — | 同名 | ✅ 直接复用 | |
| `src/config/env.js` | 93 | `src/config/env.js` | 🔄 **扩展** | 增加 `RESEND_API_KEY`、`STRIPE_PAYPAL_*`、`R2_*`、`AZURE_OPENAI_*`;`validateEnvGroup` 扩 8 个分组 |
| `src/plugins/prisma.js` | 29 | 同名 | ✅ 完整复用 | Prisma 单例模式完全正确,无需改 |
| `src/plugins/redis.js` | 44 | 同名 | ✅ 完整复用 | |
| `src/server.js` | 32 | 同名 | ✅ 小改 | 加上启动时调用 `check-keys.sh` 逻辑的引用 |

**结论**:基础设施 ~200 行 **95% 可复用**。

---

### 2.2 工具层(7 个文件 → 3 保留、2 重写、2 新增)

| Step A 文件 | 行数 | v7 落位 | 动作 | 备注 |
|---|---|---|---|---|
| `src/utils/password.js` | 17 | 同名 | ✅ 完整复用 | 仅 bcrypt 轮数从 10 改 12(文档 6.3.4 要求) |
| `src/utils/jwt.js` | 48 | 同名 | 🔄 **扩展** | 加第三种 token 类型 `seller`,TTL 1 天;加 `signSellerToken`、扩 `assertTokenType` |
| `src/utils/rateLimit.js` | 147 | 同名 | 🔄 **改造** | 保留 `consumeRateLimit` 原子逻辑;`deviceDailyGenerateLimit` 因为额度现在挂在 **Device** 上,查询链路从 `device→parent→subscription` 改成直接读 `Device.storiesLeft` + `Parent.subscription`;新增 `emailCodeRateLimit`(3 次/小时) |
| `src/utils/errors.js` | 48 | ❌ **作废重写** | → `src/utils/response.js` | 响应格式变了,重写成全局 `ok()/fail()` 包装,带错误码表 |
| `src/utils/plan.js` | 70 | 同名 | 🔄 **小改** | `lifetimeStories` 归属从 Subscription 改 Device;`pdfExportsLeft` 新增(月度/年度 5 次) |
| `src/utils/activation.js` | 72 | ❌ **作废重写** | → `src/utils/deviceActivation.js` | 原逻辑是"Parent 激活",v7 是"设备凭激活码激活",完全不同。事务:Device.status/storiesLeft + ActivationCode.status + Device.parentId 三者原子 |
| `src/utils/storyQuota.js` | 118 | 同名 | 🔄 **改造** | `storyQuotaPreHandler` 改成读 Device.storiesLeft;`consumeStoryQuota` 同步改成 `device.update` 而非 `subscription.update`;402 响应改成 `fail(30004)` |
| **新增** | — | `src/utils/response.js` | ➕ **新建** | v7 统一响应格式 `{code, data, requestId}`;全局 Fastify hook 包装 |
| **新增** | — | `src/utils/errorCodes.js` | ➕ **新建** | 错误码表 + 多语言 message(zh/en/pl/ro) |
| **新增** | — | `src/utils/requestId.js` | ➕ **新建** | 每个请求生成 `req_<nanoid>` 注入 request 对象 |
| **新增** | — | `src/utils/mailer.js` | ➕ **新建** | Resend 封装,发验证码邮件,4 语言模板 |
| **新增** | — | `src/utils/verifyCode.js` | ➕ **新建** | 6 位数字生成 + Redis 存 5 分钟 + 3 次失败锁定 |

**结论**:工具层从 7 个 ~520 行 → 12 个 ~900 行。**~50% 可复用**,其余重写或新增。

---

### 2.3 插件层(1 个保留、1 改造、2 新增)

| Step A 文件 | 行数 | v7 落位 | 动作 | 备注 |
|---|---|---|---|---|
| `src/plugins/auth.js` | 44 | 同名 | 🔄 **扩展** | 加 `authenticateSeller`,逻辑与 parent/device 同构 |
| **新增** | — | `src/plugins/response.js` | ➕ **新建** | 全局 hook:把所有 route 返回值包装成 `{code:0, data, requestId}`,错误也包成 `{code, message, requestId}` |
| **新增** | — | `src/plugins/requestId.js` | ➕ **新建** | onRequest 注入 requestId,加响应 header `X-Request-Id` |

---

### 2.4 路由层(3 个现有 → 1 重写、2 改造 + 12 个新增模块)

v7 API 清单 17 个模块,我们现在只做完了 2 个半,路线图 Phase 1 范围:

| 模块 | Step A 状态 | v7 P0 要求 | 动作 |
|---|---|---|---|
| `/api/health` | ✅ 已有 | 增加检查 OpenAI/Gemini/FAL/ElevenLabs/Stripe | 🔄 扩展 `routes/health.js` |
| `/api/auth` | ❌ 没有(用的 parent/register) | register/login-code/login-password/refresh/logout + send-code | ➕ **新建** `routes/auth.js`,把旧 parent.js 的 register/login 迁过来改造 |
| `/api/device` | 🟡 有 register/me/bind | register 改成带激活码、加 status/bind/unbind/heartbeat/active-child/reboot | 🔄 **大改** `routes/device.js` |
| `/api/child` | ❌ 没有 | CRUD,最多 4 个 | ➕ **新建** `routes/child.js` |
| `/api/story` | ❌ 没有 | dialogue/generate/status/detail/list/favorite/delete/play-stat | ➕ **新建** `routes/story.js`(**Step C 核心**) |
| `/api/tts` | ❌ | synthesize/voices/preference | ➕ **新建** |
| `/api/asr` | ❌ | upload | ➕ **新建** |
| `/api/pdf` | ❌ | generate/status/download | ➕ **新建** |
| `/api/subscription` | ❌ | status/stripe/paypal/cancel | ➕ **新建** |
| `/api/stripe` | ❌ | webhook/portal | ➕ **新建** |
| `/api/paypal` | ❌ | webhook/confirm | ➕ **新建** |
| `/api/oem` | ❌ | get-config | ➕ **新建**(Phase 1 仅读接口) |
| `/api/ota` | ❌ | check/report | ➕ **新建** |
| `/api/seller` | ❌ | login/codes-batch/codes-list/devices/stats | ➕ **新建**(可推迟到 Phase 1 末) |
| `/api/telemetry` | ❌ | report | ➕ **新建** |
| `/api/dev` | ❌ | 4 个快速测试接口 | ➕ **新建**(仅 NODE_ENV=development) |

**Step A 两个路由**:
- `routes/health.js`(39 行)→ 扩成 ~100 行,加上游服务探活
- `routes/device.js`(252 行)→ **拆成三份**:`routes/device.js`(TV 侧)+ `routes/auth.js`(家长注册登录迁过来)+ `routes/device-parent.js`(家长绑定/解绑/切活跃孩子)
- `routes/parent.js`(196 行)→ 内容被 `routes/auth.js` 和 `routes/parent.js`(简化版 me/settings)吸收

---

### 2.5 数据库层(Schema)

**当前 5 张表 → 目标 12 张表**,schema 完全重写。

| 表 | Step A 状态 | v7 动作 |
|---|---|---|
| `Device` | ✅ 有基础字段 | 扩:`activationCode`、`status` enum、`oemId`、`batchCode`、`hwFingerprint`、`firmwareVer`、`lastSeenAt`、**`storiesLeft`(关键迁移)**、`pdfExportsLeft` |
| `Parent` | ✅ 有 | 删:`activatedAt`(不再在 Parent 上);加:`locale`、`playBgm`、`loginFailedCount`、`lockedUntil` |
| `Child` | ✅ 骨架 | 扩:`gender`、`birthday`、`voiceId`、`country` |
| `Story` | ✅ 骨架 | 扩:`characterDescription`、`playCount`、`favorited`、`genCostCents`、`provider`(openai/gemini/fal) |
| `Subscription` | ✅ 有 | 改:删 `storiesLeft`(迁到 Device),加 `paypalSubId`、`pdfExportsLeft` |
| `ActivationCode` | ❌ 没 | **新建**:code、batchId、sellerId、oemId、status、usedByDeviceId、bonusMonths |
| `PdfTask` | ❌ | **新建**:parentId、storyIds(JSON)、status、fileUrl、completedAt |
| `ContentAlert` | ❌ | **新建**:deviceId、parentId、level、category、脱敏内容 |
| `ImageGenLog` | ❌ | **新建**:storyId、pageNum、provider、success、durationMs、costCents、errorCode |
| `Seller` | ❌ | **新建**:email、companyName、regionCode、status |
| `OemConfig` | ❌ | **新建**:oemId、brandName(JSON 多语言)、logoUrl、colors、menus、assetBundleVersion |
| `TelemetryEvent` | ❌ | **新建**:deviceId、type、timestamp、params(JSON) |

**迁移策略**:新建 `server-v7/prisma/schema.prisma`,从零写,不从旧 schema 迁移(因为字段归属变了,迁移脚本得写复杂的业务逻辑,不值)。

---

### 2.6 Day 0 自检脚本(全新)

| 项 | 动作 |
|---|---|
| `scripts/check-keys.sh` | ➕ 新建,验证 8 个服务 key |
| `scripts/verify-all.sh` | 🔄 原有,按 v7 接口重写 E2E 测试 |
| `test-smoke-v2.mjs` | ✅ 保留(档位/密码/过期降级纯逻辑测试通用) |
| `test-plan.mjs`, `test-smoke.mjs` | ❌ 作废(被 v2 覆盖) |

---

## 三、总览数字

| 维度 | Step A | server-v7 目标 |
|---|---|---|
| 源文件数 | 16 | ~45-50 |
| 代码行数 | ~1300 | ~4500-5500 |
| 数据表 | 5 | 12 |
| API 路由模块 | 3 | 17 |
| Token 类型 | 2 | 3 |
| 环境变量分组 | 4 | 8 |
| 错误码 | 0 | ~30 (按 5xxxx 分类) |
| 依赖新增 | — | resend、nanoid、stripe、@paypal/*、sharp、bull、pdfkit、@fal-ai/*、openai、@google/generative-ai |
| 复用率 | — | **约 30% 代码可直接迁或小改** |

---

## 四、server-v7 目标目录结构

```
server-v7/
├── .env.example              # v7 完整 key 列表
├── package.json              # 新增 12+ 依赖
├── docker-compose.yml        # 复用
├── nodemon.json              # 复用
├── prisma/
│   └── schema.prisma         # 12 张表全新
├── scripts/
│   ├── check-keys.sh         # Day 0 必须通过
│   └── verify-e2e.sh         # 按 §20.1 跑 18 步
├── src/
│   ├── server.js             # 复用
│   ├── app.js                # 改造,挂 17 路由
│   ├── config/
│   │   └── env.js            # 扩展
│   ├── plugins/
│   │   ├── prisma.js         # 复用
│   │   ├── redis.js          # 复用
│   │   ├── auth.js           # 加 seller
│   │   ├── requestId.js      # 新
│   │   └── response.js       # 新(全局响应包装)
│   ├── utils/
│   │   ├── password.js       # 复用(轮数 10→12)
│   │   ├── jwt.js            # 加 seller
│   │   ├── rateLimit.js      # 改 quota 查询
│   │   ├── response.js       # 新(ok/fail)
│   │   ├── errorCodes.js     # 新(错误码表)
│   │   ├── mailer.js         # 新(Resend)
│   │   ├── verifyCode.js     # 新
│   │   ├── plan.js           # 小改
│   │   ├── deviceActivation.js  # 重写(替代 activation.js)
│   │   ├── storyQuota.js     # 改查询源
│   │   └── logger.js         # 新(结构化日志)
│   ├── services/             # 新分层:业务逻辑
│   │   ├── imageGen/         # 三路降级
│   │   │   ├── index.js
│   │   │   ├── openai.js
│   │   │   ├── gemini.js
│   │   │   └── fal.js
│   │   ├── tts.js            # ElevenLabs
│   │   ├── asr.js            # Google Speech
│   │   ├── llm.js            # Gemini 2.0 Flash
│   │   ├── pdf.js            # pdfkit
│   │   ├── stripe.js
│   │   ├── paypal.js
│   │   └── storage.js        # R2 / local
│   ├── routes/               # 17 路由模块
│   │   ├── health.js         # 扩展
│   │   ├── auth.js           # 新(吸收 parent.js 的 register/login)
│   │   ├── device.js         # 大改
│   │   ├── parent.js         # 简化(me/settings)
│   │   ├── child.js          # 新
│   │   ├── story.js          # 新(Step C 核心)
│   │   ├── tts.js            # 新
│   │   ├── asr.js            # 新
│   │   ├── pdf.js            # 新
│   │   ├── subscription.js   # 新
│   │   ├── stripe.js         # 新
│   │   ├── paypal.js         # 新
│   │   ├── oem.js            # 新
│   │   ├── ota.js            # 新
│   │   ├── seller.js         # 新(Phase 1 末再做)
│   │   ├── telemetry.js      # 新
│   │   └── dev.js            # 新(仅 dev)
│   └── workers/              # 新
│       ├── storyGenQueue.js  # Bull:故事生成任务
│       └── pdfQueue.js       # Bull:PDF 导出任务
└── test/
    ├── smoke/                # 纯逻辑单元测试
    └── e2e/                  # Fastify inject 测试
```

---

## 五、执行顺序(你审完后按此推进)

| 批次 | 内容 | 预估文件数 | 依赖 |
|---|---|---|---|
| **批次 0** | `server-v7/` 骨架 + Docker + env + Prisma 12 表 + Day 0 脚本 | ~15 | — |
| **批次 1** | 响应格式全局 hook + 错误码表 + requestId + 基础插件 | ~8 | 批次 0 |
| **批次 2** | `/api/auth/*`(验证码 + 注册 + 登录密码 + 登录验证码 + 刷新 + 登出)+ Resend | ~6 | 批次 1 |
| **批次 3** | `/api/device/*`(带激活码的注册、status 轮询、heartbeat、active-child) + `/api/child/*` | ~5 | 批次 2 |
| **批次 4** | `/api/story/*` 全链路(含三路降级 imageGen service + Bull 队列) | ~10 | 批次 3、Resend/Stripe key 就绪 |
| **批次 5** | `/api/subscription/*` + `/api/stripe/*` + `/api/paypal/*` + `/api/pdf/*` | ~8 | 批次 4 |
| **批次 6** | `/api/ota/*` + `/api/telemetry/*` + `/api/oem/*` + `/api/dev/*` | ~5 | 批次 5 |
| **批次 7** | `/api/seller/*` + 经销商 Console 激活码批量生成 | ~4 | 批次 6 |

**我的建议节奏**:批次 0-3 我在这个窗口一口气做完(是 Week 1-2 底座),批次 4 单独开一轮(是 Step C 故事生成,比较烧钱需要你先配 key),批次 5-7 按 Phase 1 节奏推进。

---

## 六、需要你提前准备的东西

按 Week 1 第一天就要申请的 key 顺序:

| 服务 | 用途 | 申请地址 | 审批时长 |
|---|---|---|---|
| **Resend** | 邮箱验证码 | resend.com | 即时 |
| **OpenAI** | 生图主通道 + LLM 备 | platform.openai.com | 即时 |
| **Gemini** | LLM 主 + 生图二路 | aistudio.google.com | 即时 |
| **FAL** | 生图三路 | fal.ai | 即时 |
| **ElevenLabs** | TTS | elevenlabs.io | 即时,企业版 3-5 天 |
| **Google Cloud** | Speech-to-Text | cloud.google.com | 1 小时内 |
| **Stripe** | 订阅支付 | stripe.com | 欧盟 entity 1-2 周 ⚠️ |
| **PayPal** | 订阅支付二路 | developer.paypal.com | Sandbox 即时,生产审批 1-2 周 |
| **Cloudflare R2** | 图片 CDN 存储 | cloudflare.com | 即时 |
| **Azure OpenAI** | 封号兜底(可选) | azure.microsoft.com | 1-3 天 |

**最关键阻塞项**:Stripe 欧盟 entity。**今天就去申请**,别等代码写完才发现还没批。

没申请 key 之前也可以开发,策略:
- 对应的 `validateEnvGroup()` 只 warn 不 exit
- 在路由里用 feature flag 控制:key 没配则返回 "功能未上线"
- 开发时用 Stripe/PayPal 的 Sandbox 沙箱账号,随时可开
