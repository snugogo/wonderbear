# SERVER 窗口交接 — 批次 3 接手包

> **接手对象**:开新窗口跑 WonderBear server-v7 批次 3 的 Claude
> **创建时间**:2026-04-22
> **上一窗口完成度**:批次 0 + 批次 1 + 批次 2 全部跑通,172/172 smoke 全绿,代码 push GitHub
> **GitHub repo**:https://github.com/snugogo/wonderbear

---

## ⚠️ 重要传话:批次 4 用 PROMPT_SPEC_v7_1

**这条不影响批次 3 的开发,但你写给批次 4 的下一份 HANDOFF_BATCH4.md 必须再次提醒**:

> 批次 4 实现 `/api/story/*` 故事生成时,LLM prompt + 生图 prompt
> **全部以 `docs/spec/PROMPT_SPEC_v7_1.md` 为准**,不要用 v7 完整交付包里那份旧版 §10。
> v7.1 相对 v7.0 改了风格后缀("投影仪优化"方向)、饱和度、笔触清晰度。
> 文档已随代码 push 到 GitHub repo,批次 4 窗口能在 `docs/spec/` 看到。

**把这条话继续传给批次 4/5/6/7 的每一份 HANDOFF。** 创始人要求。

---

## 你接手时,立刻读这几份(按顺序)

所有规范文档都在 repo 里。

| 顺序 | 文档 | 路径(repo 内) | 时长 |
|---|---|---|---|
| 1 | **本交接包** | `docs/handoff/HANDOFF_BATCH3.md` | 5 分钟 |
| 2 | **API_CONTRACT.md §五 (Device) + §1.3 (Token)** | `docs/spec/API_CONTRACT.md` | 20 分钟 |
| 3 | **CHANGELOG.md** 最近 2-3 条(批次 2 决策有若干) | `docs/CHANGELOG.md` | 5 分钟 |
| 4 | `docs/README.md`(docs 索引) | `docs/README.md` | 2 分钟 |

可选:`docs/spec/REFACTOR_MAPPING_v7.md` 的批次 3 对应条目。

---

## 项目当前状态

### 已完成代码(26 个源文件,5 份文档,1 个 smoke 测试)

```
server-v7/
├── prisma/schema.prisma            ✅ 12 张表齐
├── src/
│   ├── app.js                      ✅ 6 个插件按序注册 + 2 个路由模块
│   ├── server.js                   ✅ 优雅关停
│   ├── config/env.js               ✅ 8 组 ENV_GROUPS
│   ├── plugins/
│   │   ├── prisma.js               ✅
│   │   ├── redis.js                ✅
│   │   ├── requestId.js            ✅
│   │   ├── responseEnvelope.js     ✅
│   │   ├── errorHandler.js         ✅
│   │   └── auth.js                 ✅ 批次 2:@fastify/jwt + 三个 authenticator
│   ├── utils/
│   │   ├── errorCodes.js           ✅ 47 个码 × 4 语言
│   │   ├── response.js             ✅ BizError + ok/fail
│   │   ├── locale.js               ✅
│   │   ├── password.js             ✅ 批次 2:bcryptjs 轮数 12
│   │   ├── jwt.js                  ✅ 批次 2:三类 token
│   │   ├── verifyCode.js           ✅ 批次 2:验证码 + Redis + 限流
│   │   └── mailer.js               ✅ 批次 2:Resend + dev-mode
│   ├── routes/
│   │   ├── health.js               ✅
│   │   └── auth.js                 ✅ 批次 2:6 个接口
│   └── templates/
│       └── verify-code.{zh,en,pl,ro}.html  ✅ 批次 2
└── test/smoke/run.mjs              ✅ 172 断言全绿
```

### 批次 3 你的范围

按 REFACTOR_MAPPING §五 + API_CONTRACT §五:

```
src/
├── utils/
│   └── deviceId.js?         ⏳ 可选:硬件 ID 格式校验 / 激活码校验工具
├── plugins/
│   └── (auth 已有 authenticateDevice) — 不用新加
└── routes/
    ├── device.js            ⏳ 核心:10 个接口
    │   ├── POST /api/device/register           (§5.1)
    │   ├── GET  /api/device/status             (§5.2)
    │   ├── POST /api/device/bind               (§5.3) — 扣 6 本额度在这里
    │   ├── POST /api/device/unbind             (§5.4)
    │   ├── POST /api/device/heartbeat          (§5.5)
    │   ├── POST /api/device/ack-command/:id    (§5.6)
    │   ├── GET  /api/device/active-child       (§5.7)
    │   ├── POST /api/device/active-child       (§5.8)
    │   ├── POST /api/device/:id/reboot         (§5.9)
    │   └── GET  /api/device/list               (§5.10)
    ├── child.js             ⏳ 5 个接口 (§6.1-6.5)
    └── parent.js            ⏳ 2 个接口 (§6bis.1-6bis.2)
```

另外建议批次 3 写:
- **`scripts/verify-e2e.sh`**:本地 docker compose up 后跑端到端(register 拿 code → register → bind → list devices)。HANDOFF_BATCH2 建议 100 行内,批次 2 没做,留给批次 3(设备上线后链路才完整)。

---

## 批次 2 已经做了的关键决策(你在批次 3 要对齐)

### 1. register 不做设备绑定,由 /api/device/bind 扣额度

**这是批次 2 跟批次 3 交接的最关键一条**:
- `/api/auth/register` 只创建 Parent 记录,收到的 `deviceId`/`activationCode` 只做类型校验,
  **不查 ActivationCode 表、不写 Device 表、不扣额度**。
- Response 里 `device: null`,`parent.activated: false`。
- H5 主流程是:register 成功 → 立刻调 `/api/device/bind { deviceId, activationCode }` →
  你的 `/api/device/bind` 做所有设备相关的事:查激活码、写 Device、**首次绑定时 `storiesLeft = 6`**、
  返回 `activatedQuota: true`。

**为什么这样切**:扣额度的逻辑只在一个地方实现,减少双重计数 / 竞态。代码职责清晰。

### 2. Parent.activated 字段的意义

- API_CONTRACT §4.2 里的 `parent.activated: boolean` = "是否有至少 1 台绑定设备(= 是否领取过 6 本免费额度)"。
- 批次 2 的 register / login 接口都这么算:`parent.devices.length > 0`。
- 你在批次 3 写 `/api/device/bind` 成功时,response 的 `parent.activated` 应该同步翻成 true。
- 在 Parent 表上没有独立的 `activated` 字段(派生字段,从 Device 关系推出)。

### 3. Token 三类已就位

批次 2 已在 `src/utils/jwt.js` 导出:
- `signParentToken(fastify, parentId)` → 7d
- `signDeviceToken(fastify, deviceId)` → 30d(批次 3 的 `/api/device/register` 直接用)
- `signSellerToken(fastify, sellerId)` → 1d(批次 7)

批次 2 在 `src/plugins/auth.js` 已装饰:
- `fastify.authenticateParent` — onRequest 钩子
- `fastify.authenticateDevice` — **你批次 3 会大量用这个**
- `fastify.authenticateSeller`
- `fastify.revokeToken(token, ttlSeconds)` — logout / unbind confirm 可用

用法:
```js
fastify.post('/api/device/status',
  { onRequest: [fastify.authenticateDevice] },
  async (request) => {
    const { sub: deviceId } = request.auth; // 已注入
    // ...
  }
);
```

### 4. Redis key 前缀规范

批次 2 定的前缀(你批次 3 新增的请继续用 `device:` 前缀):
```
auth:verify:*           — 验证码、冷却、小时限额
auth:blacklist:*        — token 黑名单
device:commands:*       — 建议:设备命令队列(§5.9 reboot 写入,§5.5 heartbeat 拉取)
device:heartbeat:*      — 可选:最近心跳时间缓存
```

### 5. 错误码已有的,你不要新加同类

- 设备相关 2xxxx 已有 8 个码(20001-20008),API_CONTRACT §2.2 已列全。
- 你有新的设备场景错误需求 → 在 errorCodes.js 追加 + API_CONTRACT §二 追加 + CHANGELOG 追加一笔。不要私自加码。

### 6. "throw BizError + return 裸对象"范式

批次 2 的 `routes/auth.js` 是 6 个接口的活教材。照抄风格:
- 永远不自己写 `{code:0, data:..., requestId}`。
- 失败路径一律 `throw new BizError(ErrorCodes.XXX, { details, actions })`。
- 成功直接 `return { ... }`,onSend 钩子自动包。
- 需要校验身份:`{ onRequest: [fastify.authenticateXXX] }`。

---

## 还悬着的事

### 1. Resend 域名验证(影响不了批次 3,但批次 2 已提)

`MAIL_FROM=noreply@wonderbear.app` 必须在 Resend 后台完成域名验证,批次 2 的真发邮件路径才能跑。
**创始人什么时候验证完,就能在本地配 `RESEND_API_KEY` 测真 send**。批次 2 的 dev-mode 不受影响。

### 2. scripts/verify-e2e.sh

批次 2 没写(没有真设备表,链路不完整)。批次 3 写,100 行内,覆盖:
1. docker compose up(pg + redis)
2. prisma migrate deploy
3. 起 server
4. curl send-code → 从 server 日志 grep 验证码
5. curl register → 拿 parentToken
6. curl device/bind → 拿 device + 确认 activatedQuota=true
7. curl device/list → 确认设备在列
8. 清理

### 3. GitHub repo 状态

批次 2 结束时 push 到 https://github.com/snugogo/wonderbear 的 main 分支。你接手时 `git pull` 一下即可。

### 4. 必须更新 API_ACTUAL_FORMAT.md(TV 窗口定的硬规则)

`docs/spec/API_ACTUAL_FORMAT.md` 是每批次完成后必须填充的"真实接口形态记录"(TV 窗口 Q3 决策,2026-04-22)。
批次 2 已填完 §"批次 2"(认证模块)。**批次 3 完成后,你必须填对应章节,不写就不算完成。**
每个接口要附:curl 命令 + success response JSON 实例 + 主要错误码触发示例。

### 5. 批次 4 用 PROMPT_SPEC_v7_1(再说一遍)

见本文件顶部 ⚠️ 部分。**你的下一份 HANDOFF_BATCH4.md 必须再提醒一次。**

---

## 容器 / 环境备忘

- Step A 参考代码在仓库中**不存在**(批次 2 窗口没有拿到 Step A zip,但 API_CONTRACT 契约本身已完整,不需要参考 Step A)。批次 3 你只参考 `docs/spec/API_CONTRACT.md §五`,不要去找 Step A。
- `node_modules` 创始人本地已装,CI 要重装用 `npm install`。
- Prisma client 已 `npx prisma generate`(schema 里 12 张表 type 都有)。
- 没有真 PG / Redis 时 smoke 用 mock 跑,全绿。
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
- 预期:**Passed: 172 / Failed: 0**(批次 2 留下的基线)。

---

## 批次 3 开工建议节奏

1. **先讲设计**(给创始人 15 分钟看):
   - 10 个设备接口 + 5 个孩子接口 + 2 个家长接口 = 17 个接口的字段对照
   - Device 状态机 5 个状态转换图(§十三 + §5.3/§5.4)
   - `bind` 的"首次 vs 重新"分支:`activated_unbound` → 发 6 本额度;`unbound_transferable` → 继承原 `storiesLeft`
   - `heartbeat` 的命令队列设计(Redis list vs hash)
   - `active-child` 双 token 支持(parent 或 device 都能调)
2. **得"开工"后**按文件清单顺序写:
   先 `routes/device.js` 骨架(register + status + list)→ 扩充 smoke → 再补 bind/unbind → 扩充 smoke → 再补 heartbeat/command → 最后孩子 + 家长。
3. **每个文件写完跑 smoke**,目标累计 >= 250 断言,Failed=0。
4. **打包 / 提交前**确认:批次 1 的 72 条 + 批次 2 的 100 条仍绿(共 172)。
5. **写 HANDOFF_BATCH4.md 时**再次传话 PROMPT_SPEC_v7_1。

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

批次 2 最后跑通的是 172/172 smoke,认证模块 + Resend dev-mode + JWT 黑名单 + 反爆破全链路稳。
你在这个基础上做设备模块,用批次 2 的 `routes/auth.js` 当风格模板,会很顺。
如果卡在"register 返回 device: null 怎么跟契约对齐" — 看 CHANGELOG 2026-04-22 批次 2 条目第 1 条。

加油。

---

**当前时间戳**:2026-04-22
**SHA-equivalent 验证**:批次 2 push 后 `node test/smoke/run.mjs` → 172 passed / 0 failed
**等待指令**:创始人说"开工批次 3"即开
