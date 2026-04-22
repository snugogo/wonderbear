# SERVER 窗口交接 — 批次 4 接手包

> **接手对象**:开新窗口跑 WonderBear server-v7 批次 4 的 Claude
> **创建时间**:2026-04-23
> **上一窗口完成度**:批次 0+1+2+3 全部跑通,280/280 smoke 全绿,代码 push GitHub
> **GitHub repo**:https://github.com/snugogo/wonderbear

---

## ⚠️⚠️⚠️ 批次 4 最重要的一条纪律

**本批次实现 `/api/story/*` 故事生成时,LLM prompt + 生图 prompt 全部以**
**`docs/spec/PROMPT_SPEC_v7_1.md` 为准,不要用 v7 完整交付包里那份旧版 §10。**

v7.1 相对 v7.0 改了:
- 风格后缀(**"投影仪优化"方向** —— 高饱和、厚线描、低动态范围)
- 颜色饱和度档位
- 笔触清晰度 / 合成构图约束

文档已随代码 push 到 GitHub。批次 4 窗口开工前:
1. 先读 `docs/spec/PROMPT_SPEC_v7_1.md` 整份
2. 对照代码里即将写的 prompt 模板,一条条比对
3. **不确定就问创始人**,不要拿 v7.0 的段落兜底

**继续把这条话传给批次 5/6/7 的每一份 HANDOFF。** 创始人明确要求。

---

## 你接手时,立刻读这几份(按顺序)

| 顺序 | 文档 | 路径(repo 内) | 时长 |
|---|---|---|---|
| 1 | **本交接包** | `docs/handoff/HANDOFF_BATCH4.md` | 5 分钟 |
| 2 | **API_CONTRACT.md §七 (Story)** | `docs/spec/API_CONTRACT.md` | 30 分钟 |
| 3 | **API_CONTRACT_PATCH_v3.md** — dialogue/turn 带 audioBase64 | `docs/spec/API_CONTRACT_PATCH_v3.md` | 10 分钟 |
| 4 | **PROMPT_SPEC_v7_1.md** — prompt 工厂(整份) | `docs/spec/PROMPT_SPEC_v7_1.md` | 40 分钟 |
| 5 | **API_ACTUAL_FORMAT.md §批次 3** — 批次 3 真实接口形态 | `docs/spec/API_ACTUAL_FORMAT.md` | 15 分钟 |
| 6 | **CHANGELOG.md 2026-04-23 条目**(批次 3 决策) | `docs/CHANGELOG.md` | 5 分钟 |

---

## 项目当前状态

### 已完成代码(35 个源文件,6 份文档,1 个 smoke 测试)

```
server-v7/
├── prisma/schema.prisma                  ✅ 12 张表齐
├── src/
│   ├── app.js                            ✅ 5 个路由模块挂载
│   ├── server.js                         ✅ 优雅关停
│   ├── config/env.js                     ✅
│   ├── plugins/*                         ✅ 6 个(含 auth)
│   ├── utils/*                           ✅ 7 个
│   ├── routes/
│   │   ├── health.js                     ✅
│   │   ├── auth.js                       ✅ 批次 2:6 个接口
│   │   ├── device.js                     ✅ 批次 3:10 个接口
│   │   ├── child.js                      ✅ 批次 3:5 个接口
│   │   └── parent.js                     ✅ 批次 3:2 个接口
│   └── templates/verify-code.*.html      ✅ 4 份
├── test/smoke/
│   ├── run.mjs                           ✅ 172 条(批次 1+2)
│   └── batch3.mjs                        ✅ 108 条(批次 3)
└── scripts/
    ├── check-keys.sh                     ✅
    └── verify-e2e.sh                     ✅ 批次 3 新增
```

### 批次 4 你的范围

按 REFACTOR_MAPPING §七 + API_CONTRACT §七:

```
src/
├── utils/
│   ├── contentSafety.js   ⏳ 内容安全三级过滤(调 Gemini content filter 或本地正则)
│   ├── pricing.js         ⏳ 成本统计(每页 LLM + 图像 + TTS cents)
│   └── storyPrompt.js     ⏳ Prompt 工厂(严格对齐 PROMPT_SPEC_v7_1.md)
├── services/
│   ├── llm.js             ⏳ OpenAI/Gemini 封装,gpt-4o 生成 12 页剧本
│   ├── imageGen.js        ⏳ 三路兜底:OpenAI → Gemini → fal
│   ├── tts.js             ⏳ ElevenLabs 封装
│   └── asr.js             ⏳ OpenAI Whisper /speech
├── queues/
│   └── storyJob.js        ⏳ BullMQ / 简单队列,12 页生成流水线
└── routes/
    ├── story.js           ⏳ 5 个接口
    │   ├── POST /api/story/dialogue/start
    │   ├── POST /api/story/dialogue/:id/turn       ← audioBase64 patch v3
    │   ├── POST /api/story/generate
    │   ├── GET  /api/story/:id/status
    │   └── GET  /api/story/:id
    └── story-library.js   ⏳ list / favorite / delete(§7.7-7.9)
```

**Prompt 对齐清单**(PROMPT_SPEC_v7_1.md 章节号):
- §2 对话生成 system prompt → 批次 4 `storyPrompt.buildDialogueSystem()`
- §3 剧本扩写 prompt → `storyPrompt.buildStoryExpansion()`
- §4 生图 prompt 模板(每页) → `storyPrompt.buildImagePrompt(pageNum, character)`
- §5 封面图 prompt → `storyPrompt.buildCoverPrompt()`
- **§6 投影仪优化后缀**(v7.1 新增) → 追加在所有生图 prompt 末尾的 suffix,**不要漏**

---

## 批次 3 已经做了的关键决策(你在批次 4 要对齐)

### 1. `Device.storiesLeft` 扣减时机

- **发**:`/api/device/bind` 首次绑定时发 6(`activated_unbound → bound`)
- **扣**:批次 4 里 `/api/story/generate` 成功启动 story job 时扣 1(建议乐观扣 —— 生成失败可以在 job 里加回来)
- **订阅用户跳过扣减**:`Subscription.status === 'active'` 的 parent 旗下设备 `storiesLeft` 不检查不扣
- **额度耗尽**:抛 `QUOTA_EXHAUSTED (30004)`,`details.storiesLeft = 0`,带 `actions: [{ url: '/sub', labelEn: 'Upgrade' }]`

### 2. Story.deviceId 用字符串 `Device.deviceId`,不是 cuid

schema 里 `Story.deviceId` 是字符串 FK 指向 `Device.deviceId` —— 这样 TV 自报 deviceId 就能查
到自己的 story,不用回查 cuid。批次 4 新建 Story 时记得写 `deviceId: device.deviceId`
(不是 `device.id`)。

### 3. Child / Device 鉴权模式可复用

批次 3 的 `child.js` 里实现了"同时接受 parent 和 device token"的 `/api/child/:id` 模式,
批次 4 的 `/api/story/:id` 可以参考(TV 设备取故事、H5 家长看故事,两条路径都要通)。

### 4. 错误码已有的,不要新加同类

故事相关 3xxxx 已有 12 个码(30001-30012),API_CONTRACT §2.2 和 `src/utils/errorCodes.js`
已定义齐全:
- 30001 STORY_GEN_FAILED、30002 IMAGE_GEN_ALL_FAILED、30003 TTS_FAILED
- 30004 QUOTA_EXHAUSTED、30005 DAILY_LIMIT_REACHED、30006 CONTENT_SAFETY_BLOCKED
- 30007 STORY_NOT_FOUND、30008 STORY_NOT_READY
- 30009 CHILD_NOT_FOUND(批次 3 已用)、30010 MAX_CHILDREN_REACHED(批次 3 已用)
- 30011 ASR_FAILED、30012 DIALOGUE_ROUND_OVERFLOW

要加新码 → 先跟创始人确认 + 在 errorCodes.js / API_CONTRACT §二 / CHANGELOG 同步追加。

### 5. Redis 前缀规范(新增请用 `story:` / `dialog:`)

批次 3 已占用:
```
auth:verify:*        — 验证码、冷却、小时限额
auth:blacklist:*     — token 黑名单
device:commands:*    — 设备命令队列
device:heartbeat:*   — (预留)
```

批次 4 建议:
```
story:job:*          — 生成 job 状态/进度(辅助,主存在 Postgres)
dialog:session:*     — dialogue 会话(start 返回的 sessionId → TTL 10min)
rate:story-gen:*     — 按 deviceId / parentId 限流
```

### 6. "throw BizError + return 裸对象"范式

照抄批次 3 的 `routes/device.js` 风格:
- 永远不自己写 `{ code: 0, data: ..., requestId }`
- 失败路径一律 `throw new BizError(ErrorCodes.XXX, { details, actions })`
- 成功直接 `return { ... }`,onSend 钩子自动包
- 需要校验身份:`{ onRequest: [fastify.authenticateXXX] }`

---

## 还悬着的事

### 1. Resend 域名验证(与批次 2 相同)

`MAIL_FROM=noreply@wonderbear.app` 必须在 Resend 后台完成域名验证才能真发邮件。
批次 4 本身不发邮件,但 `/api/device/unbind` 走邮件验证码,批次 4 的集成测试期间
创始人要注意这个路径的联调。dev-mode 不受影响。

### 2. 真实 key 的集成测试

批次 4 是第一批**需要真实上游 key** 的:
- `OPENAI_API_KEY`(LLM + DALL-E + Whisper)
- `GOOGLE_API_KEY`(Gemini 文生图兜底 + content filter)
- `FAL_API_KEY`(fal.ai 文生图三路兜底)
- `ELEVENLABS_API_KEY`(TTS)

建议:
- smoke 测试仍跑 mock,保证 CI 环境 0 依赖
- 真 key 走本地跑 `verify-e2e.sh`(批次 4 要扩充,新增 `/api/story/generate → 轮询 status` 步骤)
- 成本监控:`ImageGenLog.costCents` 每次写,`Story.genCostCents` 在 job 结束时汇总

### 3. Batch 4 要扩的 smoke

批次 3 smoke 累计 280 条。批次 4 建议 +60 条,目标 **340/0**:
- prompt 工厂返回结构(字段齐全、v7.1 suffix 存在)
- dialogue start / turn / generate 正常路径
- dialogue turn 走 audioBase64 路径(patch v3)
- 内容安全 3 级命中 → 30006
- 限流命中 → 30005 DAILY_LIMIT_REACHED
- 额度耗尽 → 30004
- 三路生图兜底触发顺序
- story/:id 权限边界(别家的 story 不可读)

### 4. 批次 5/6/7 用 PROMPT_SPEC_v7_1(再说一遍)

**你写给批次 5 的 HANDOFF_BATCH5.md 顶部,必须再贴一次本文件顶部那段 ⚠️ 警示。**

---

## 容器 / 环境备忘

- `node_modules` 已装,新增依赖可能需要:
  - `openai`(如果批次 4 选用官方 SDK)
  - `@google/generative-ai`
  - `elevenlabs`
  - `bullmq` + `ioredis`(或维持简单的 setTimeout 队列)
  - `@fal-ai/serverless-client`
- Prisma client 已 `npx prisma generate`,无需再跑
- 没真 PG / Redis 时 smoke 用 mock 跑,全绿
- 跑 smoke:
  ```
  # POSIX
  DATABASE_URL=postgresql://fake:fake@localhost:5432/fake \
  JWT_SECRET=smoke_test_jwt_secret_at_least_32_bytes_long_abc123 \
  NODE_ENV=development \
  node test/smoke/run.mjs

  # Windows PowerShell
  $env:DATABASE_URL="postgresql://fake:fake@localhost:5432/fake"
  $env:JWT_SECRET="smoke_test_jwt_secret_at_least_32_bytes_long_abc123"
  $env:NODE_ENV="development"
  node test/smoke/run.mjs
  ```
- 预期:**Passed: 280 / Failed: 0**(批次 3 基线)。

---

## 批次 4 开工建议节奏

1. **先讲设计**(给创始人 30 分钟看):
   - dialogue / generate / status 三步串讲 + sessionId 生命周期图
   - 三路生图兜底的超时 / 重试矩阵(按 PROMPT_SPEC_v7_1 §7 的建议参数)
   - 队列选型:BullMQ vs 简单 in-process —— Phase 1 流量 < 1 QPS,**建议 in-process**,
     Phase 2 再换 BullMQ(创始人 2026-04-22 明确说过"不要过度工程")
   - 成本追踪颗粒度:per-page per-provider(写 ImageGenLog),汇总到 Story.genCostCents
2. **得"开工"后**按文件清单顺序写:
   先 `storyPrompt.js` + 内容安全 → `llm.js`(纯函数,先不接网络)→ mock 模式跑通
   dialogue → 再接真 LLM → 扩 smoke → 再做生图/TTS → 扩 smoke → 最后 job 串起来
3. **每个文件写完跑 smoke**,目标累计 >= 340 断言,Failed=0。
4. **打包 / 提交前**确认:批次 1+2+3 的 280 条仍绿。
5. **写 HANDOFF_BATCH5.md 时**再次传话 PROMPT_SPEC_v7_1。

---

## 和创始人的沟通风格(继承)

- 中文回复,代码注释英文
- 正式输出(批次进度、接口列表)可以用 bullets / 表格
- 关键决策用 AskUser 工具(如果可用);不行就在文本里给选项
- 先讲设计、再写代码
- 每个文件写完给"跑这行,期待这个输出"
- 重大决策前主动提案,不做甩手掌柜

---

## 最后一句

批次 3 最后跑通的是 280/280 smoke(172 批次 1+2 + 108 批次 3),设备 + 孩子 + 家长三个模块
一次性全部对齐契约上线。`scripts/verify-e2e.sh` 跑通后,TV 第一次端到端"开机 → 扫码 →
绑定 → 得 6 本"的链路就完整了。

你这一棒是产品的**灵魂**:故事生成走不通,整套流程就没意义。
Prompt 对齐 v7.1、三路兜底稳、成本透明、内容安全守住底线 —— 这四件事干好就成。

加油。

---

**当前时间戳**:2026-04-23
**SHA-equivalent 验证**:批次 3 push 后 `node test/smoke/run.mjs` → 280 passed / 0 failed
**等待指令**:创始人说"开工批次 4"即开
