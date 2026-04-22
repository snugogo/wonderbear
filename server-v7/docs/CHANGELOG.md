# Changelog

> 所有跨窗口协议变更、文档版本变化按时间倒序记录。最新的在最上面。

---

## 2026-04-23 · 批次 3 完成 — 设备 + 孩子 + 家长模块

**来源**:批次 3 开发窗口

**优先级**:P0(解锁批次 4 故事生成的所有"某个 child / 某个 device"上下文)

**新增代码**(3 个 routes 文件 + 1 个 smoke 扩展 + 1 个 e2e 脚本):

```
src/routes/
├── device.js     ✅ 10 个接口(register / status / bind / unbind / heartbeat /
│                    ack-command / active-child(GET+POST) / :id/reboot / list /
│                    refresh-token)
├── child.js      ✅ 5 个接口(POST / PATCH / DELETE / list / :id)
└── parent.js     ✅ 2 个接口(GET /me / PATCH /me)

test/smoke/
└── batch3.mjs    ✅ 108 条批次 3 断言,run.mjs 末尾 dynamic import

scripts/
└── verify-e2e.sh ✅ 活环境端到端:register → send-code → parent register →
                     bind → list → heartbeat → parent/me(7 步)
```

**smoke 累计**:`Passed: 280 / Failed: 0`(批次 1 的 72 + 批次 2 的 100 + 批次 3 的 108)。

**关键决策**:

1. **"register 只建 Parent,bind 才扣额度"单一入口**(与批次 2 对齐):
   `/api/device/bind` 检测 `device.status === 'activated_unbound'` 则首次绑定,
   `storiesLeft = 6` 且 `activatedQuota: true`;其他状态(如 `unbound_transferable`)
   保留原 `storiesLeft`,`activatedQuota: false`。避免批次 2 / 批次 3 双重计数。

2. **6 本免费额度随设备走**(创始人 Phase 1 产品定义):
   - `/api/device/unbind` 不清空 `storiesLeft`,仅改 status + 解开 parentId/activeChildId
   - 设备被另一个 parent 重新绑时继承原剩余额度,不再发 6 本
   - 激活码同步 `status = 'transferred'`

3. **命令队列**:`/api/device/:id/reboot` 用 Redis list (`device:commands:<deviceCuid>`) + TTL 300s。
   心跳拉取,`/api/device/ack-command/:id` 通过 `lrem` 消费。没 ack 的命令下次心跳还会被返回。
   未来批次 6 的固件 OTA / 推送消息走同一队列,`type` 字段扩展枚举即可。

4. **`/api/device/active-child`(POST) 双 token**:device token 自带 deviceId,body 只要
   `childId`;parent token 要同时带 `{ deviceId, childId }`。`/api/child/:id` GET 同样支持
   双 token,device token 只能读自己的 activeChild(防越权)。

5. **`/api/device/unbind` 需二次校验**:`confirmCode` 必须是此前 `/api/auth/send-code
   { purpose: 'login' }` 发给 parent 邮箱的 6 位码(复用登录验证码基础设施,不新建 purpose)。

6. **Parent.activated 是派生字段**:数据库没有独立列;`/api/auth/register`、`/api/auth/login-code`、
   `/api/auth/login-password`、`/api/parent/me` 每次都现算 `devices.length > 0`。

7. **Child 限制**:1 parent ≤ 4 child、`age ∈ [3, 8]`、`primaryLang/secondLang` 白名单
   `[zh, en, pl, ro]`(+secondLang 允许 'none')。软删除规则:先清空所有
   `Device.activeChildId` 引用再删 Child(stories 因 schema cascade 清除)。

8. **deviceId / activationCode 格式**(统一校验工具):
   - deviceId:`^[A-Za-z0-9_-]{8,128}$`
   - activationCode:`^[A-Za-z0-9]{6,12}$`

**文档同步**:
- `docs/spec/API_ACTUAL_FORMAT.md` 批次 3 章节全填 —— 17 个接口的 curl + JSON 实例
- TV / H5 联调清单挂在同文件末尾(激活三步流程 + token 互换规则 + 额度继承机制)

**批次 4 必须传话**:LLM + 生图 prompt 走 `docs/spec/PROMPT_SPEC_v7_1.md` 的 v7.1 版
(不是 v7 完整交付包里的旧版 §10)。这条传达链由每个 HANDOFF_BATCH<N>.md 继续传给后续窗口。

---

## 2026-04-22 · 批次 2 完成 — 认证模块 + Resend dev-mode

**来源**:批次 2 开发窗口

**优先级**:P0(解锁所有需要 parent/device token 的后续批次)

**新增代码**(7 个源文件 + 4 份邮件模板):

```
src/
├── utils/
│   ├── password.js          ✅ bcryptjs 轮数 12 + 强度校验
│   ├── jwt.js               ✅ parent(7d)/device(30d)/seller(1d) 签发 + type 校验 + sha256 黑名单哈希
│   ├── verifyCode.js        ✅ 6 位数字 + Redis key 布局 + 3 次错锁 + 60s 冷却 + 每小时 3 次上限
│   └── mailer.js            ✅ Resend 封装;无 key 时 dev-mode(打日志 + console 横幅)
├── plugins/
│   └── auth.js              ✅ @fastify/jwt + 三个 authenticator 装饰器 + revokeToken
├── routes/
│   └── auth.js              ✅ 6 个接口全实现
└── templates/
    ├── verify-code.zh.html  ✅
    ├── verify-code.en.html  ✅
    ├── verify-code.pl.html  ✅
    └── verify-code.ro.html  ✅
```

**关键决策(供后续批次对齐)**:

1. **Resend dev-mode**(创始人 2026-04-22 决策):`RESEND_API_KEY` 未配置时不真发邮件,
   模板仍完整渲染,验证码通过两个渠道打印:
   - `logger.warn`(结构化,包含 to/code/locale/purpose)
   - `console.log` 醒目横幅(四行带边框)
   本地测试创始人从日志读码。配了 key 则走 Resend,失败抛 `EMAIL_SEND_FAILED (50005)`。

2. **密码可选账户登录失败统一 10007**(创始人决策):
   - 邮箱不存在 → `PASSWORD_WRONG (10007)`
   - 账户 `passwordHash = null`(只验证码登录的账户)走 login-password → `PASSWORD_WRONG (10007)`
   - 防邮箱枚举,不暴露"这个邮箱是否注册过"或"是否设置了密码"。

3. **refresh 策略**(创始人答 Q2):签名通过 + 不在黑名单即可刷新,不做"距 exp X 分钟"的窗口约束。

4. **批次 2 register 不做设备绑定**(创始人答 Q3):
   - Schema 接受 `deviceId` / `activationCode` 字段(类型校验),但不查不写。
   - Response 返回 `device: null`。
   - H5 主流程是 register 成功后立刻调 `/api/device/bind`(批次 3),扣 6 本额度的逻辑
     **只在 `/api/device/bind` 里实现一处**,避免批次 2 / 批次 3 重复实现。

5. **反爆破(密码登录)**:5 次错误 → `lockedUntil = now + 15min`,`failedLoginCount` 重置为 0
   (让解锁后有新的 5 次)。已锁账户即使输对密码也直接 `ACCOUNT_LOCKED (10008)`,
   `details.unlockAt` 返回 ISO 时间戳。

6. **Token 黑名单(logout)**:key = `auth:blacklist:${sha256(token)}`,value=`"1"`,
   TTL = token 剩余有效期。认证器先验签 → 查黑名单 → 查 type,命中黑名单直接 `TOKEN_REVOKED (10010)`。

**Redis key 布局**(所有后续批次使用同一套):

```
auth:verify:{email}:{purpose}       "{code}:{attemptsLeft}"   TTL 300
auth:verify:cooldown:{email}        "1"                       TTL 60
auth:verify:hourly:{email}          <int counter>              TTL 3600
auth:blacklist:{sha256(token)}      "1"                       TTL = exp - now
```

**验收**:`node test/smoke/run.mjs` → **172 passed / 0 failed**(批次 1 的 72 条仍绿 + 批次 2 新增 100 条)。

**白名单守住**:
- 不修改 Prisma schema(Parent 表 `failedLoginCount` / `lockedUntil` 字段批次 0 已建)。
- 不修改任何已有接口字段。
- 不修改错误码表(第 11 个 10xxxx 码 `TOKEN_REVOKED` 在批次 1 就已登记,批次 2 只是首次使用)。

**非阻塞遗留**:
- `scripts/verify-e2e.sh` 本地端到端验证脚本 → 批次 3 写(那时设备绑定上线,链路才完整)。
- 真实 Resend 发信测试 → 需要创始人在 Resend 后台完成 `wonderbear.app` 域名验证后再做。

**API_ACTUAL_FORMAT 合规**:按 2026-04-22 联调验证机制(TV 窗口提出),
批次 2 的 6 个 `/api/auth/*` 接口的真实 curl 命令 + response JSON 实例 +
主要错误码触发示例,已补录到 `docs/spec/API_ACTUAL_FORMAT.md` §四(认证模块)。

---

## 2026-04-22 · v3 · dialogue/turn 增加 audioBase64 字段

**来源**:TV 窗口 Q2 决策(创始人确认)

**优先级**:P0(批次 4 实现 dialogue 时必须按这个走)

**详细 patch**:`docs/spec/API_CONTRACT_PATCH_v3.md`

**变更**:`POST /api/story/dialogue/:id/turn` 增加可选字段:
- request 加 `audioBase64?: string` + `audioMimeType?: string`
- response 加 `recognizedText?: string`
- 二选一原则:userInput / audioBase64 至少传一个,优先 audioBase64

**目的**:TV 投影仪儿童产品,7 轮对话累计省 1+ 秒延迟,产品体验改善显著。

**白名单守住**:接口字段名仅新增、不删除、不重命名。`/api/asr/upload` 接口保留不动。

**给批次 4 窗口接手包的 todo**:服务端实现 dialogue/turn 时,按 patch v3 走;
代码示例已写在 patch 文档末尾。

---

## 2026-04-22 · 联调验证机制(API_ACTUAL_FORMAT)

**来源**:TV 窗口 Q3 决策(创始人确认)

**优先级**:P1(从批次 2 开始执行)

**新文档**:`docs/spec/API_ACTUAL_FORMAT.md`

**机制**:每个后端批次完成后,**必须**在 API_ACTUAL_FORMAT.md 对应章节追加:
- 实际 curl 命令
- 真实 response JSON 实例
- 主要错误码触发示例

**目的**:TV / H5 联调前 git pull 拉这份文档,跟 API_CONTRACT.md 比对,
任何差异先手动适配,避免联调到一半发现字段名不对。

**给所有未来批次窗口的硬规则**:不写就不算批次完成。

---

## 2026-04-22 · 权威文档统一收编进 repo

**来源**:创始人决策——"版本太多了,太乱了"

**优先级**:P0(影响所有未来批次窗口的工作流)

**变更**:把项目的 3 份核心文档放进 `docs/spec/`,以后**版本以 GitHub 上为准**:

- `docs/spec/API_CONTRACT.md` — 三端共用的接口契约
- `docs/spec/SERVER_HANDOFF.md` — 服务端项目初始上下文
- `docs/spec/REFACTOR_MAPPING_v7.md` — 7 个批次路线图

**新窗口接手新批次的工作流变化**:

```
旧:创始人手动上传 4 份资料 → 新窗口读
新:创始人给 GitHub 链接 → 新窗口拉 repo → 自动看到所有规范
```

创始人只需上传:
- 当前批次的 `HANDOFF_BATCH{N}.md`(虽然在 repo 里也有,但贴方便)
- 任何新出现的协议补充(然后它们会被收进 repo)

**白名单守住**:不修改任何代码、不修改任何接口字段。仅文档归位。

---

## 2026-04-22 · Prompt 工程文档 v7.1 已纳入 repo

**来源**:创始人在 server-v7 窗口确认

**优先级**:P1(批次 4 开工时使用)

**说明**:`docs/spec/PROMPT_SPEC_v7_1.md` 是 prompt 工程的**权威版本**。

v7.1 相对 v7.0 的关键改动(创始人验证过出图效果):
- 风格后缀从"水彩纸张纹理"改为"投影仪优化方向"
- 颜色更饱和鲜艳,对比度更高,适配 100-200 流明低亮度投影
- 笔触更干净

**批次 4 实现 `/api/story/*` 故事生成时,LLM prompt + 生图 prompt
全部以 `docs/spec/PROMPT_SPEC_v7_1.md` 为准**,不要用 v7 完整交付包里那份旧版。

文档已随代码 push 到 GitHub repo,任何接手批次 4 的窗口
都能在 `docs/spec/` 目录看到。

---

## 2026-04-21 · v2 · OemConfig.h5BaseUrl

**来源**:`TO_SERVER_hash_route.md` v2(对齐 `H5_HANDOFF.md §96`)

**优先级**:P0

**变更**:`prisma/schema.prisma` 的 `OemConfig` 表新增字段:

```prisma
h5BaseUrl   String   @default("https://h5.wonderbear.app")
```

**目的**:TV 端激活页生成扫码绑定 URL,格式锁为
`{h5BaseUrl}/#/register?device={deviceId}&code={activationCode}`,
不同 OEM 走自己的 H5 域名。

**关键约定**(写入代码注释):URL 参数用短名 `device`/`code`,
但所有 API 请求体仍用长名 `deviceId`/`activationCode`,服务端永远只接受长名。

**未做**(标为非阻塞):
- API_CONTRACT.md §11.1 OemConfig 类型定义增补 `h5BaseUrl` —— patch 在 `docs/spec/API_CONTRACT_PATCH_v2.md`
- API_CONTRACT.md §14.5 新章节 —— 同上
- `GET /api/dev/qr-preview` —— 标"可选,非阻塞",计入批次 6 的 `/api/dev/*` 待办

**白名单守住**:接口字段名、错误码、Token 结构、其他 11 张表 —— 零修改。

**验证**:`npx prisma validate` 通过、`npx prisma generate` 成功、
`node test/smoke/run.mjs` 25/25 绿(批次 0 当时的 smoke 数)。
