# SERVER 窗口交接 — 批次 5 接手包

> **接手对象**:开新窗口跑 WonderBear server-v7 批次 5 的 Claude
> **创建时间**:2026-04-23
> **上一窗口完成度**:批次 0+1+2+3+4 全部跑通,395/395 smoke 全绿,代码 push GitHub
> (批次 1: 72, 批次 2: 100, 批次 3: 108, 批次 4: 115)
> **GitHub repo**:https://github.com/snugogo/wonderbear

---

## ⚠️⚠️⚠️ 批次 5/6/7 永久纪律(从批次 4 继承,**必须继续往下传**)

**本批次以及之后的所有批次,一旦涉及 LLM prompt 或生图 prompt,一律以**
**`docs/spec/PROMPT_SPEC_v7_1.md` 为唯一权威。**

- **不要**回退到 v7 完整交付包里那份旧版 §10(v7.0)
- **不要**自己发明 v7.2 / v7.3 变体
- 风格后缀必须是"**投影仪优化**"(vibrant saturated colors, luminous glowing colors,
  projection-display optimized, Miyazaki-inspired color richness),**不是**任何形式的
  "paper-texture / aged paper / muted tones / sepia / washed out"
- `FORBIDDEN_STYLE_WORDS`(在 `src/utils/storyPrompt.js`)已经是最后一道防线:
  即使 LLM 把 v7.0 旧词漏出来也会被双重清洗;**不要动它**
- 若联调中发现需要调整风格,先在 `.env` 的 `IMAGE_STYLE_SUFFIX` 做实验,代码默认值不碰,
  创始人确认过才改代码

**本批次是订阅/支付,理论上不碰 prompt,但以下场景可能触发**:
- 订阅成功后的欢迎邮件(如果加 logo / 样图)
- 给家长的"示例故事"生成(如果走 server 端)
- 支付失败降级时返回的 placeholder cover

**一律走 v7.1**。**把这段继续抄进 HANDOFF_BATCH6.md 顶部,一字不漏,一段不减。**

---

## 你接手时,立刻读这几份(按顺序)

| 顺序 | 文档 | 路径(repo 内) | 时长 |
|---|---|---|---|
| 1 | **本交接包** | `docs/handoff/HANDOFF_BATCH5.md` | 5 分钟 |
| 2 | **DECISION_RULES.md** | 仓库外层 `E:\AI\factory-workspace\DECISION_RULES.md` | 5 分钟 |
| 3 | **API_CONTRACT.md §八 (Subscription)** + §九 (Billing) | `docs/spec/API_CONTRACT.md` | 30 分钟 |
| 4 | **API_CONTRACT.md §二(错误码表 4xxxx/5xxxx)** | 同上 | 10 分钟 |
| 5 | **API_ACTUAL_FORMAT.md §批次 4** — 批次 4 真实接口形态 | `docs/spec/API_ACTUAL_FORMAT.md` | 15 分钟 |
| 6 | **CHANGELOG.md 2026-04-23 批次 4 条目** | `docs/CHANGELOG.md` | 10 分钟 |
| 7 | **schema.prisma** — `Subscription / Order / Coupon / PromoCode`(如有) | `prisma/schema.prisma` | 10 分钟 |
| 8 | **src/routes/parent.js** 与 **src/plugins/auth.js** — token 模式 | `src/` | 15 分钟 |

**如果上面任何表没建**,先跟创始人确认 schema 走 Stripe-first 还是 RevenueCat-first,
不要自己拍板建表。

---

## 项目当前状态

### 已完成代码(批次 4 结束时)

```
server-v7/
├── prisma/schema.prisma                  ✅ 12 张表齐(批次 4 未改 schema)
├── src/
│   ├── app.js                            ✅ 7 个路由模块挂载(storyLibrary 在 story 之前)
│   ├── server.js                         ✅ 优雅关停
│   ├── config/env.js                     ✅
│   ├── plugins/*                         ✅ 6 个(含 auth)
│   ├── utils/
│   │   ├── storyPrompt.js                ✅ 批次 4:PROMPT_SPEC v7.1
│   │   ├── contentSafety.js              ✅ 批次 4
│   │   ├── pricing.js                    ✅ 批次 4(扩到订阅需要在这里加订阅价档)
│   │   ├── errorCodes.js                 ✅ 30xxx 已用齐
│   │   ├── jwt.js / response.js / responseEnvelope.js / env.js / BizError 等  ✅
│   ├── services/
│   │   ├── llm.js                        ✅ 批次 4:Gemini + OpenAI + mock
│   │   ├── imageGen.js                   ✅ 批次 4:3 路降级 + ImageGenLog
│   │   ├── tts.js                        ✅ 批次 4:ElevenLabs + mock
│   │   └── asr.js                        ✅ 批次 4:Whisper + mock
│   ├── queues/
│   │   └── storyJob.js                   ✅ 批次 4:in-process pipeline
│   └── routes/
│       ├── health.js                     ✅
│       ├── auth.js                       ✅ 批次 2
│       ├── device.js                     ✅ 批次 3
│       ├── child.js                      ✅ 批次 3
│       ├── parent.js                     ✅ 批次 3
│       ├── story-library.js              ✅ 批次 4 —— GET /api/story/list
│       └── story.js                      ✅ 批次 4 —— 8 接口
├── test/smoke/
│   ├── run.mjs                           ✅ 入口(末尾 dynamic import batch3/batch4)
│   ├── batch3.mjs                        ✅ 108 条
│   └── batch4.mjs                        ✅ 265+ 条
└── scripts/
    ├── check-keys.sh                     ✅
    └── verify-e2e.sh                     ✅ 批次 3 版;批次 5 要扩"订阅 webhook 路径"
```

**smoke 基线**:`Passed: 545 / Failed: 0`(172 批次 1+2 + 108 批次 3 + 265 批次 4)。

### 批次 5 你的范围

按 API_CONTRACT §八 + §九:

```
src/
├── utils/
│   └── pricing.js                        ⏳ 扩充(已有 LLM/image/TTS/ASR 基础价;
│                                              加订阅档位 free/monthly/yearly + 终身档?)
├── services/
│   ├── stripe.js                         ⏳ Stripe SDK 封装(checkout session / webhook 验签)
│   ├── revenuecat.js                     ⏳ RevenueCat webhook 验签 + 事件解析(iOS/Android IAP)
│   ├── coupon.js                         ⏳ 优惠码校验(百分比 / 固定金额 / 首单)
│   └── mailer.js(扩)                    ⏳ 批次 2 已有,加"订阅成功/失败/到期提醒"3 个模板
├── queues/
│   └── subscriptionJob.js                ⏳ 续订失败重试、到期降级、过期清理
└── routes/
    ├── subscription.js                   ⏳ §8 订阅
    │   ├── GET  /api/subscription/plans              ─ 返回可用档位
    │   ├── POST /api/subscription/checkout           ─ 创建 Stripe checkout session
    │   ├── GET  /api/subscription/me                 ─ 当前订阅 + 剩余天数 + 下次扣费日
    │   ├── POST /api/subscription/cancel             ─ 取消续订(保留到期)
    │   ├── POST /api/subscription/redeem             ─ 兑换码激活
    │   └── POST /api/subscription/upgrade            ─ 升档(按差价)
    ├── billing.js                        ⏳ §9 订单/发票
    │   ├── GET  /api/billing/orders                  ─ 分页 list
    │   ├── GET  /api/billing/orders/:id              ─ 单笔详情
    │   └── GET  /api/billing/orders/:id/invoice      ─ PDF 发票 URL(Stripe-hosted)
    └── webhook.js                        ⏳ Webhook 入口(不走 auth,走签名校验)
        ├── POST /api/webhook/stripe                  ─ checkout.session.completed /
        │                                                invoice.paid / customer.subscription.*
        └── POST /api/webhook/revenuecat              ─ INITIAL_PURCHASE / RENEWAL / CANCELLATION
```

**核心数据流**:
1. H5 登录 → `GET /subscription/plans` → 用户选档 → `POST /subscription/checkout`(拿 Stripe URL)
2. H5 跳 Stripe → 付完回跳 → Stripe → `/webhook/stripe` 写 `Subscription.status='active'`
3. 成功后 parent 全域 `Subscription.status==='active'` → 批次 4 的 story/generate 跳过 quota,
   daily limit 按档位放宽(free=2 → monthly=10 → yearly=20)

---

## 批次 4 已经做了的关键决策(你在批次 5 要对齐)

### 1. `Subscription.status === 'active'` 是唯一订阅判断

批次 4 的 `storyRoutes` 已经在用 `parent.subscription?.status === 'active'` 决定:
- 是否跳过 `storiesLeft` 检查
- 日限档位(free=2 / monthly=10 / yearly=20)
- queue 优先级(yearly 走 `high`)

**批次 5 维护这个字段时务必及时更新**:
- webhook `customer.subscription.updated` → 立即写 `status`(active / canceled / past_due / paused)
- webhook `customer.subscription.deleted` → 立即写 `status='canceled'`,保留 `endAt` 给访问
- 宽限期:`past_due` 仍按 active 对待(7 天?),7 天后降 `canceled`(定时任务,批次 5 扩)

### 2. `plan` 字段枚举严格对齐

批次 4 已在 daily limit 里硬编码了:
```js
const DAILY_LIMITS = { free: 2, monthly: 10, yearly: 20 };
```

批次 5 如果新增档位(如 `trial` / `lifetime` / `family`),**必须**:
1. 在 `src/utils/pricing.js` 或新文件 `src/constants/plans.js` 单一定义
2. 回头改批次 4 `src/routes/story.js` 里 `DAILY_LIMITS` 为从那里 import
3. 同步 CHANGELOG + API_ACTUAL_FORMAT

### 3. 错误码已有的 4xxxx / 5xxxx

`src/utils/errorCodes.js` 批次 0 已占好 41001-49999 段给订阅/支付。
**先看现有的**,尽量复用:
- 41001 SUBSCRIPTION_NOT_FOUND
- 41002 SUBSCRIPTION_ALREADY_ACTIVE
- 41003 PLAN_NOT_AVAILABLE
- 41004 PAYMENT_FAILED
- 41005 COUPON_INVALID / EXPIRED / USED
- 41006 WEBHOOK_SIGNATURE_INVALID
- 41007 STRIPE_SESSION_EXPIRED
- 41008 REVENUECAT_EVENT_IGNORED
- 50xxx 段是 5xx 类(外部服务挂了 / 数据库连不上)

要加新码 → 先跟创始人确认 + 在 errorCodes.js / API_CONTRACT §二 / CHANGELOG 同步追加。

### 4. Redis 前缀规范

批次 1-4 已占用:
```
auth:verify:*        — 验证码、冷却、小时限额
auth:blacklist:*     — token 黑名单
device:commands:*    — 设备命令队列
device:heartbeat:*   — (预留)
dialog:session:*     — 批次 4:对话会话
story:job:*          — 批次 4:故事生成 job 状态
rate:story-gen:*     — 批次 4:日限计数
```

批次 5 建议:
```
sub:idem:*           — webhook 幂等(event.id → processed,TTL 7天),防 Stripe 重发
sub:checkout:*       — 批次 5:checkout session 预创建(TTL 30 分钟,避免数据库垃圾)
sub:grace:*          — 批次 5:宽限期倒计时(past_due → canceled)
```

### 5. "throw BizError + return 裸对象"范式

继续照抄批次 3-4 的 `routes/device.js / story.js` 风格:
- 永远不自己写 `{ code: 0, data: ..., requestId }`
- 失败一律 `throw new BizError(ErrorCodes.XXX, { details, actions })`
- 成功直接 `return { ... }`,onSend 钩子自动包
- 需要校验身份:`{ onRequest: [fastify.authenticateParent] }`(订阅是 parent 专属)

**例外**:`/api/webhook/*` 不走 `authenticateParent`,走自定义前置 hook 验签。
webhook 返回值按各自平台要求(Stripe 需要 200 快速回 + 不要 body;RevenueCat 同理)。

### 6. H5 / Stripe 回跳

- `POST /subscription/checkout` 返回 `{ checkoutUrl, sessionId, expiresAt }`
- H5 跳 Stripe → 付完 → Stripe 回跳到 `${H5_BASE_URL}/subscription/success?session_id=xxx`
- H5 再调 `GET /subscription/me` 查验状态(不要信任 query 参数,以 webhook 落库为准)

### 7. 批次 4 smoke 里 mock 的 `parent.subscription`

`test/smoke/batch4.mjs` 里 fakePrisma 加了 `subscription` 模型(`upsert / findFirst`)。
**批次 5 扩展 smoke 时复用那套 fake,不要另起炉灶**,否则 `parent.subscription` shape 不一致。

---

## 还悬着的事

### 1. Stripe / RevenueCat 二选一还是并存

- 创始人方向:**Web 走 Stripe,iOS/Android 走 App Store / Play IAP(RevenueCat 统一 webhook)**
- 批次 5 **两条路径都要建**,但可以分两个 sub-milestone:
  - M1:先做 Stripe + H5 全链路(smoke + 真 key 跑通)
  - M2:再叠 RevenueCat + 移动端(移动端 App 端批次 8 才开,但 webhook 要先通)
- 如果创始人希望推迟 RevenueCat,按 M1 做完即可,但 `src/routes/webhook.js` 的 `/api/webhook/revenuecat` **留一个空 handler** 返回 200,避免 RevenueCat 配置时打不通

### 2. 真实 key 的集成测试

- `STRIPE_SECRET_KEY`(test mode:sk_test_...)
- `STRIPE_WEBHOOK_SECRET`(whsec_...)
- `STRIPE_PRICE_ID_MONTHLY / YEARLY`(产品创建后拿)
- `REVENUECAT_WEBHOOK_AUTH`(在 RevenueCat 后台设的 bearer)
- `H5_BASE_URL`(回跳用)

**smoke 必须跑在无这些 key 的环境里**(CI)。dev-mode:
- `createCheckoutSession` 返回 `mock://stripe/checkout/<sessionId>`
- webhook handler 支持 `X-Webhook-Dev-Bypass: 1` header(只在 `NODE_ENV=development` 生效),
  直接接受 JSON body 当成已验签事件

### 3. 订阅到期提醒 / 续订失败降级

- 定时任务(cron 或 BullMQ repeat):每日扫 `Subscription.endAt <= now + 3 days && status='active'`
  → 发提醒邮件
- 续订失败 → Stripe webhook `invoice.payment_failed` → status='past_due' → 写 `sub:grace:<subId>` TTL 7天
- 7 天后仍 past_due → 定时任务降 `canceled`,发"已取消"邮件
- **批次 5 实现最简版**(只做 webhook 实时路径 + 1 条 daily cron),复杂的重试策略批次 9 再说

### 4. Batch 5 要扩的 smoke

批次 4 smoke 累计 545 条。批次 5 建议 +50 条,目标 **595/0**:
- `GET /subscription/plans` shape 正确
- `POST /subscription/checkout`:mock Stripe 返 URL、参数缺失 → 90001
- webhook 签名校验失败 → 41006
- webhook 幂等:同 event.id 重复发,第 2 次不改数据库
- `checkout.session.completed` → Subscription 落库 `status='active'`
- `customer.subscription.updated` 到 `past_due` → 写 `sub:grace:*`
- `customer.subscription.deleted` → `status='canceled'`
- parent 调 `/subscription/me`:active / canceled / null 三档 shape
- 优惠码:有效 / 过期 / 已用完 / 不适用于当前档
- RevenueCat webhook:INITIAL_PURCHASE → active,CANCELLATION → canceled

**批次 4 回归必须仍绿 545 条**。

### 5. `verify-e2e.sh` 扩展

批次 3 的脚本已有 7 步。批次 5 加 3-4 步:
- login-code → parent bind → `GET /subscription/plans` → `POST /subscription/checkout`
- 手动:创始人打开 Stripe test card 4242 完成支付
- 脚本轮询 `GET /subscription/me` 直到 `status='active'`(最多 30s,给 webhook 时间)
- 再跑 `POST /api/story/generate` 应该成功且 `priority='high'`(yearly)或 `'normal'`(monthly)

### 6. 批次 6/7 用 PROMPT_SPEC_v7_1(再说一遍)

**你写给批次 6 的 HANDOFF_BATCH6.md 顶部,必须一字不漏抄一遍本文件顶部那段 ⚠️ 警示。**

---

## 容器 / 环境备忘

- `node_modules` 已装,新增依赖可能需要:
  - `stripe`(官方 SDK)
  - `pdfkit` 或走 Stripe-hosted invoice(更推荐 Stripe-hosted)
- Prisma client 已 `npx prisma generate`,**如果改 schema 必须重跑**
- 没真 PG / Redis 时 smoke 用 mock 跑,全绿
- 跑 smoke:
  ```
  # Windows PowerShell
  $env:DATABASE_URL="postgresql://fake:fake@localhost:5432/fake"
  $env:JWT_SECRET="smoke_test_jwt_secret_at_least_32_bytes_long_abc123"
  $env:NODE_ENV="development"
  node test/smoke/run.mjs
  ```
- 预期:**Passed: 545 / Failed: 0**(批次 4 基线)。

---

## 批次 5 开工建议节奏

1. **先设计评审**(给创始人 30 分钟看):
   - Subscription / Order / Coupon 表结构(如果批次 0 schema 没完全覆盖,补 migration)
   - `/subscription/*` 7 个接口 + `/billing/*` 3 个接口 + 2 个 webhook 的路径矩阵
   - Stripe checkout → webhook → DB 写入 → 批次 4 生效 的时间序列图
   - 宽限期 / 降级策略 / 幂等策略
   - dev-mode 行为(mock Stripe、header bypass)
2. **得"开工"后**按文件清单顺序写:
   `pricing.js 扩 → services/stripe.js → routes/webhook.js(只 Stripe)→ routes/subscription.js`
   → mock 跑 smoke → 接真 Stripe key 跑一次 → 再做 RevenueCat → 再做 billing → 再做 coupon
3. **每个文件写完跑 smoke**,目标累计 >= 595 断言,Failed=0。
4. **打包 / 提交前**确认:批次 1+2+3+4 的 545 条仍绿。
5. **写 HANDOFF_BATCH6.md 时**再次传话 PROMPT_SPEC_v7_1。

---

## 和创始人的沟通风格(继承)

- 中文回复,代码注释英文
- 正式输出(批次进度、接口列表)可以用 bullets / 表格
- 关键决策用 AskUser 工具(如果可用);不行就在文本里给选项
- 先讲设计、再写代码
- 每个文件写完给"跑这行,期待这个输出"
- 重大决策前主动提案,不做甩手掌柜
- 钱的路径必须做到:**可重放、可审计、可幂等、不多扣、不漏扣**

---

## 批次 4 遗留的两个小坑 / 提示

1. **`DAILY_LIMITS` 常量目前在 `src/routes/story.js` 内联**:
   ```js
   const DAILY_LIMITS = { free: 2, monthly: 10, yearly: 20 };
   ```
   批次 5 改 plan 档位时要搬到共享常量(见上文决策 #2)。

2. **`priority: 'high' | 'normal'` 只在 generate 的响应里返回,没驱动真队列差异**:
   批次 4 的 in-process queue 按 FIFO 直跑,`priority` 只是给 UI / 分析用。
   批次 5 如果切 BullMQ(不推荐 Phase 1),可以真正按优先级调度。

3. **`imageGen.js` 依次尝试 FAL → Imagen → OpenAI**:如果批次 5 要加"paid 用户优先走 OpenAI"
   或者"免费用户只走 FAL",在 `generate` pipeline 里透传 `plan` 参数到 `imageGen.generate()`
   并按 plan 调整 tier 顺序。**这是批次 5 的产品决策,需要先问创始人**。

---

## 最后一句

批次 4 最后跑通的是 **545/545 smoke**(172 批次 1+2 + 108 批次 3 + 265 批次 4),
故事生成从 dialogue 到最终 12 页音画齐全地 mock 跑通,三路生图 + 三级内容安全 + 日限 + 配额
全部守住底线。TV 现在能"开机 → 扫码 → 绑定 → 生成第一本故事 → 回看"。

你这一棒是产品的**商业化生命线**:订阅不通,无限额度就是空谈,创始人回本无望。
Stripe / 优惠码 / webhook 幂等 / 宽限期 —— 这四件事干好就成。

**PROMPT_SPEC_v7_1.md 是永久纪律,继续往下传。**

加油。

---

**当前时间戳**:2026-04-23
**SHA-equivalent 验证**:批次 4 push 后 `node test/smoke/run.mjs` → 545 passed / 0 failed
**等待指令**:创始人说"开工批次 5"即开
