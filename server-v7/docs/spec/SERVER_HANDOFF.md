# WonderBear v7 · 服务端开发启动包(Server 新窗口接手用)

> **这个文档的读者**:接手 WonderBear server-v7 开发的 Claude 新窗口
> **背景**:上一个窗口已完成架构设计和 Step A 骨架,因上下文将满需要换窗口继续
> **创建时间**:2026-04-21

---

## 🎯 你是谁,你要做什么

你是 WonderBear 项目的**服务端 Claude 窗口**。创始人是一位连续创业者,目标把这款 AI 儿童故事投影仪快速推到欧洲市场(波兰/罗马尼亚/美国),实现正向现金流。

**你的职责**:基于 v7 规范重构/新建完整服务端 `server-v7/`。
**你不负责**:家长 H5(独立窗口)、TV HTML(独立窗口)、Android Shell(合作伙伴)。

项目有 3 条开发线并行:
- **server-v7**(← 你在这条)
- **家长 H5**:Vue 3 + Vant 4(另一个 Claude 窗口)
- **TV HTML**:Vue 3 跑在 GP15 WebView(另一个 Claude 窗口)

---

## 📦 创始人会同时上传给你的资料

1. **`WonderBear_v7_完整交付包.zip`** — 10 份 md 产品规范,必读
2. **`REFACTOR_MAPPING_v7.md`** — 逐文件重构映射表,**你的工作指南**
3. **`wonderbear-v2.zip`** — Step A 已完成的旧代码(16 个源文件,~1300 行),作参考不直接改
4. **本文档** — 上下文交接

---

## 📚 你接手时,**立刻**读这几份(按顺序)

| 顺序 | 文档 | 读什么 | 花时间 |
|---|---|---|---|
| 1 | **本文档** | 进度状态、已定决策、还在悬的事 | 5 分钟 |
| 2 | **API_CONTRACT.md** | **你的实现合同**。所有接口的类型 + JSON + 错误码 + 状态同步协议。照着实现就行,别再看 v7 的 `6_API接口功能清单.md` 猜字段 | 40 分钟 |
| 3 | **REFACTOR_MAPPING_v7.md** | 逐文件怎么处置、7 个批次顺序 | 15 分钟 |
| 4 | v7 交付包 `2_系统架构说明.md` | 整体架构、技术选型、三路降级 | 20 分钟 |
| 5 | v7 交付包 `6_API接口功能清单.md` | 业务描述(API_CONTRACT 的源头,配合看) | 20 分钟 |
| 6 | v7 交付包 `10_Prompt工程详细规范.md` | AI 调用细节,批次 4 做故事生成时细读 | 批次 4 时再看 |
| 7 | v7 交付包 `8_开发执行路线图.md` §二 | 批次 1 底座的验收标准 | 10 分钟 |
| 8 | v7 交付包 `7_内容安全与合规.md` | 三级过滤 + GDPR | 批次 4 时再看 |

---

## ✅ 已经定死的决策(不要再讨论,直接照做)

### 架构层面
- **技术栈锁定**:Node.js 20 + Fastify 4 + PostgreSQL 15 + Redis 7 + Prisma ORM + ESM
- **不升 Fastify 5**(尽管有漏洞公告,锁 4.x)
- **模块系统**:ESM(`"type": "module"`),不用 CommonJS
- **开发脚本**:`nodemon src/server.js`,不用 `node --watch`
- **部署工作流**:本地开发 → GitHub push → 服务器 pull + PM2 reload,`.env` 绝不进 Git
- **项目结构**:monorepo,`server-v7/` + `h5/` + `tv-html/` + `docs/`

### 业务语义(v7 vs Step A 的重大差异)
- **激活主体是"设备",不是"账户"**:激活码属于设备,`storiesLeft` 存在 Device 表而非 Subscription
- **解绑即"转让"**:Device.parentId 置 null,激活码状态变 `transferred`,**storiesLeft 不退不重置**(反薅羊毛核心规则)
- **注册走邮箱验证码**:6 位数字,Resend 发送,Redis 存 5 分钟,3 次错锁 15 分钟
- **密码可选**:留空则只能验证码登录
- **3 种 Token**:device(30d)、parent(7d)、seller(1d)
- **响应格式严格统一**:`{code, data, requestId}` / `{code, message, requestId, details}`(v7 文档 §6.1.2)
- **业务错误码 5 位**:1xxxx 认证/2xxxx 设备/3xxxx 故事/4xxxx 支付/5xxxx 系统/9xxxx 客户端

### 档位配置(已定)
| 档位 | 月价 | 额度 | 日限 | 优先队列 |
|---|---|---|---|---|
| free | €0 | 设备激活送 6 本一次性 | 2 次/天 | 否 |
| monthly | €4.99 | 无限 | 10 次/天 | 否 |
| yearly | €39.99 | 无限 | 20 次/天 | **是** |

### 商户配置
- **Stripe 用香港公司 entity**(已确认可行,用 Checkout 托管页自动处理 3DS/SCA)
- **PayPal 作为第二通道**(波兰用户信任度高)
- 不做 BLIK/P24/SEPA(Phase 2 再评估)
- Stripe Dashboard 设置留到批次 5 开工时再指导创始人配置

### 数据库表(12 张,vs Step A 只有 5 张)
Device / Parent / Child / Story / Subscription / **ActivationCode / PdfTask / ContentAlert / ImageGenLog / Seller / OemConfig / TelemetryEvent**

### 环境变量分组(validateEnvGroup)
- `infra`:DATABASE_URL, JWT_SECRET(启动时必校验)
- `ai`:OPENAI_API_KEY, FAL_KEY, GEMINI_API_KEY
- `tts`:ELEVENLABS_API_KEY + 6 个 VOICE_ID
- `stripe`:STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
- `paypal`:PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_WEBHOOK_ID
- `speech`:GOOGLE_SPEECH_KEY
- `mail`:RESEND_API_KEY
- `storage`:R2_ACCOUNT_ID, R2_ACCESS_KEY, R2_SECRET_KEY

---

## 📍 当前进度状态

### Step A(旧骨架)已完成并验证
位于 `wonderbear-v2.zip`,**仅作参考,不直接修改**:
- ✅ Fastify + Prisma + Redis 骨架
- ✅ 5 张表 Prisma schema(基础版)
- ✅ JWT 工具(device/parent token)
- ✅ Redis 限流工具(带原子 INCR+EXPIRE)
- ✅ Device 注册 + 家长绑定 + 激活 6 本(v4 语义,需重构成 v7 设备级激活)
- ✅ Parent 注册 + 登录 + 邮箱+密码(需改为邮箱验证码)
- ✅ Day 0 smoke test(26 断言全绿)
- ✅ 端到端 verify-all.sh(15 场景)

### 必须迁移到 server-v7 的代码(REFACTOR_MAPPING 已详列)
**可完整复用**(拷过去小改即可):
- `docker-compose.yml`
- `src/plugins/prisma.js` / `redis.js`
- `src/utils/password.js`(bcrypt 轮数 10→12)
- `src/utils/jwt.js`(加 seller 类型)
- `src/utils/rateLimit.js` 的 `consumeRateLimit` 核心逻辑
- `src/plugins/auth.js`

**语义变了,逻辑要重写**:
- `activation.js` → `deviceActivation.js`(激活挂 Device 不挂 Parent)
- `storyQuota.js` 查询链路改
- `parent.js` 注册/登录改验证码路径
- `device.js` 大改,加 activationCode/status/heartbeat/active-child

**完全新增**:
- 响应格式全局 hook(`{code,data,requestId}`)
- 错误码表 + 4 语言消息
- requestId 中间件
- Resend 邮件封装
- 12 张表完整 Schema
- 14 个新路由模块
- Day 0 check-keys.sh

### 还没做
按 REFACTOR_MAPPING §五 执行顺序:

| 批次 | 状态 | 内容 |
|---|---|---|
| **批次 0** | ⏳ 待开工 | server-v7 骨架 + Docker + env + 12 表 Prisma + Day 0 脚本 |
| 批次 1 | 待 | 响应格式全局 hook + 错误码表 + requestId |
| 批次 2 | 待 | `/api/auth/*` + Resend |
| 批次 3 | 待 | `/api/device/*` + `/api/child/*` |
| 批次 4 | 待 | `/api/story/*` 三路降级(核心,烧钱) |
| 批次 5 | 待 | 订阅 + Stripe + PayPal + PDF |
| 批次 6 | 待 | OTA + telemetry + OEM + dev |
| 批次 7 | 待 | Seller 经销商 |

---

## 🚩 还悬着的事(创始人需要你主动提醒)

1. **API Key 申请**:只有 Stripe 香港 entity 已确认。其他 7 个服务(Resend/OpenAI/Gemini/FAL/ElevenLabs/Google Speech/PayPal/R2)创始人可能还没全申请。你应该在批次 0 完成后提醒"Day 0 check-keys.sh 跑一下,没配的 warn 不阻断,但批次 4 开工前必须齐"
2. **GitHub 仓库**:还没建。创始人习惯本地开发 → push 到 GitHub → 服务器 pull。批次 0 完成后你应该给他 `git init → push` 的完整脚本
3. **H5 和 TV 窗口的进度**:你不用操心,但**接口契约是你的权威**。他们调的字段如果和你实现的不一致,以 `6_API接口功能清单.md` 中文描述为准,不是以 Step A 旧实现为准
4. **Stripe Dashboard 配置**:批次 5 开工时要告诉创始人怎么配(Product/Price/Webhook/Statement Descriptor 等),提前准备好清单

---

## 💡 和创始人沟通的风格要点

上一个窗口摸索出了一些有效的模式,建议继承:

1. **先讲设计、后写代码**:每个批次开工前讲清楚"做什么 / 为什么这么做 / 可能的坑",他会给方向性反馈,省后面推倒重来
2. **容器里能跑的东西都跑一遍**:smoke test / Prisma generate / import 语法检查,容器里先验证,交付前给具体的"你本地跑这行命令,预期输出 xxx"
3. **输出 zip 包给他下载**,不要只给代码片段(他要在本地开发,不是复制粘贴)
4. **重大决策先让他选**:用 `ask_user_input_v0` 工具给选项(他在手机上操作多,点选比打字快)
5. **上下文饱和预警**:到 50% 时就该提醒他,让他决定是否换窗口。不要硬撑到最后几 KB 才说
6. **他信任你的判断**:userPreferences 里写"非常信任你的营销及代码能力",所以决策要主动,但要把理由讲清楚,不做甩手掌柜
7. **提醒但不催**:Stripe Dashboard 配置、API Key 申请这些事提一次就够,不要每次对话都催
8. **回复中文,代码注释英文**:项目规范
9. **Markdown 格式要克制**:一般性聊天不要堆表格和 bullet(他的 userPreferences 间接透露了这个偏好,上一个窗口后期过度用表格)

---

## 🔧 容器环境备忘

上一个窗口在容器里做的事,你也可以做:

- `/home/claude/wonderbear/` 是工作区
- 可以 `npm install`,容器里能联网
- 不能装 Docker(用 `npx prisma generate` 不需要连真 DB 就能验证 schema)
- `node test-smoke.mjs` 跑纯逻辑单元测试(需要 `DATABASE_URL=postgresql://fake JWT_SECRET=test_secret_long` 绕过启动校验)
- zip 输出到 `/mnt/user-data/outputs/` 然后用 `present_files` 给用户下载
- **有 `ask_user_input_v0` 工具**,做决策选择题时很方便

---

## 🎬 你接手后的第一件事

**不要一上来就写代码**。先:

1. 读完本文档 + REFACTOR_MAPPING + v7 文档 6/2/8
2. 给创始人一条消息确认:
   - 你已经理解上下文
   - 列出你准备做的批次 0 交付清单
   - 问他:"是否有任何决策/优先级要调整?没有的话我开工批次 0"
3. 得到"开工"指令后,按 REFACTOR_MAPPING §五 执行

**不要犯的错**:
- ❌ 不要问"要不要做 v7"(已定)
- ❌ 不要问"服务端要不要从头写"(已定:新建 server-v7)
- ❌ 不要问"响应格式选哪种"(已定:v7 §6.1.2 严格统一)
- ❌ 不要问"Stripe 欧盟还是香港"(已定:香港)
- ❌ 不要问"激活 6 本挂账户还是设备"(已定:设备)
- ❌ 不要想重新设计架构(v7 规范已决定架构)

---

## 📝 批次 0 交付预期清单(供你开工参考)

在创始人说"开工"后,批次 0 应该输出:

```
server-v7/
├── .gitignore
├── .env.example         # 覆盖 v7 完整 key 列表
├── package.json         # 新依赖:resend、nanoid、stripe、@paypal/checkout-server-sdk 等
├── docker-compose.yml   # 复用旧的
├── nodemon.json         # 复用
├── prisma/
│   └── schema.prisma    # 12 张表(按 v7 文档 6 §19)
├── scripts/
│   ├── check-keys.sh    # Day 0 自检(空 key 警告不阻断)
│   └── verify-e2e.sh    # 待批次 2+ 充实
├── src/
│   ├── server.js        # 复用 + 启动时调 check-keys
│   ├── app.js           # 占位,只挂 health
│   ├── config/
│   │   └── env.js       # 扩展 8 个 group
│   ├── plugins/
│   │   ├── prisma.js    # 复用
│   │   └── redis.js     # 复用
│   └── routes/
│       └── health.js    # 扩展到 v7 格式
└── README.md            # Day 0 跑通指南
```

**验收标准**:
- `docker compose up -d && cd server-v7 && npm i && npx prisma migrate dev --name init && npm run dev`
- `curl http://localhost:3000/api/health` 返回 v7 格式 `{code:0, data:{...}, requestId:...}`
- `bash scripts/check-keys.sh` 对未配的 key 发 warn 不阻断

---

## 📞 遇到这些情况怎么办

| 情况 | 怎么做 |
|---|---|
| 文档间有冲突 | 以 v7 原始 10 份 md 为准,REFACTOR_MAPPING 是衍生物 |
| API 字段名和 Step A 旧代码有出入 | 以 v7 `6_API接口功能清单.md` 的中文描述为准 |
| H5 窗口发现接口字段对不上 | 让他们发具体冲突 + 你检查 v7 文档 + 修代码(默认错在你,因为契约是他们的) |
| 创始人说"改 xxx 策略" | 先确认影响面(schema?路由?全局?),再说会不会影响已 approved 的 REFACTOR_MAPPING |
| 容器里跑 smoke test 失败 | 不要给用户有问题的代码,本地跑通再交付 |
| 上下文到 60% | 主动提醒创始人考虑是否换窗口,给他交接包参考格式(就是本文档) |

---

## 🌟 最后

创始人是个务实的连续创业者,看重:
- **速度**:尽快实现正向现金流
- **质量**:代码要能真跑,不是"看起来能跑"
- **务实**:别做过度设计,P0/P1 优先级明确
- **信任**:他授权你做判断,你别辜负

上一个窗口的最后一条输出就是这份文档本身。从这里接着走就行。加油。

---

**当前时间戳**:2026-04-21
**上一个窗口最后进度**:Step A 完成 + v7 映射表定稿 + 三份 HANDOFF 齐全
**等待指令**:创始人说"开工"即开批次 0
