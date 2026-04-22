# SERVER 窗口交接 — 批次 2 接手包

> **接手对象**:开新窗口跑 WonderBear server-v7 批次 2 的 Claude
> **创建时间**:2026-04-21,2026-04-22 更新(权威文档已收入 repo)
> **上一窗口完成度**:批次 0 + 批次 1 全部跑通,72/72 smoke 全绿,代码 push GitHub
> **GitHub repo**:https://github.com/snugogo/wonderbear

---

## 你接手时,**立刻**读这几份(按顺序)

所有规范文档**都在 repo 里**(`docs/spec/`),不需要创始人额外上传。

| 顺序 | 文档 | 路径(repo 内) | 时长 |
|---|---|---|---|
| 1 | **本交接包** | `docs/handoff/HANDOFF_BATCH2.md` | 5 分钟 |
| 2 | **API_CONTRACT.md §一/§二/§四** | `docs/spec/API_CONTRACT.md` | 25 分钟 |
| 3 | **CHANGELOG.md** | `docs/CHANGELOG.md`(协议变更历史) | 5 分钟 |
| 4 | docs/README.md(docs 索引) | `docs/README.md` | 2 分钟 |

不需要读 SERVER_HANDOFF.md / REFACTOR_MAPPING_v7.md / v7 §6 — 决策已全消化进代码,
但需要时这些都在 `docs/spec/`。

---

## 项目当前状态(快速扫描)

### 已完成代码(20 个源文件,4 个文档,1 个测试)

```
server-v7/
├── prisma/schema.prisma            ✅ 12 张表全部齐
├── src/
│   ├── app.js                      ✅ 5 个插件按顺序注册
│   ├── server.js                   ✅ 优雅关停
│   ├── config/env.js               ✅ 8 组 ENV_GROUPS + validateEnvGroup
│   ├── plugins/
│   │   ├── prisma.js               ✅
│   │   ├── redis.js                ✅
│   │   ├── requestId.js            ✅ 批次 1:生成 req_xxx + 解析 locale
│   │   ├── responseEnvelope.js     ✅ 批次 1:onSend 自动包装 v7 envelope
│   │   └── errorHandler.js         ✅ 批次 1:BizError + 5xx 兜底
│   ├── utils/
│   │   ├── errorCodes.js           ✅ 批次 1:36 个码 + 4 语言消息
│   │   ├── response.js             ✅ 批次 1:BizError 类 + ok()/fail()
│   │   └── locale.js               ✅ 批次 1:body > Accept-Language > 'en'
│   └── routes/health.js            ✅ 9 个上游 ping + db/redis
└── test/smoke/run.mjs              ✅ 72 断言全绿
```

### 还没做(批次 2 你的范围)

按 REFACTOR_MAPPING §五 + API_CONTRACT §四:

```
src/
├── utils/
│   ├── password.js          ⏳ 复用 Step A,bcrypt 轮数 10 → 12
│   ├── jwt.js               ⏳ 复用 Step A,加 'seller' token type
│   ├── verifyCode.js        ⏳ 新:6 位数字生成 + Redis 存取 + 3 次错锁
│   └── mailer.js            ⏳ 新:Resend 封装,4 语言模板
├── plugins/
│   └── auth.js              ⏳ 新:JWT 中间件,parent/device/seller 三类 token
├── routes/
│   └── auth.js              ⏳ 核心:6 个接口
│       ├── POST /api/auth/send-code
│       ├── POST /api/auth/register
│       ├── POST /api/auth/login-code
│       ├── POST /api/auth/login-password
│       ├── POST /api/auth/refresh
│       └── POST /api/auth/logout
└── templates/                ⏳ 新:邮件 HTML 模板
    ├── verify-code.zh.html
    ├── verify-code.en.html
    ├── verify-code.pl.html
    └── verify-code.ro.html
```

---

## 上一窗口已经做的关键决策(不要再重新讨论)

### 批次 1 沉淀的设计模式 — 路由代码长这样

```js
// 你写新路由时直接用这个范式:
import { ok, BizError } from '../utils/response.js';
import { ErrorCodes } from '../utils/errorCodes.js';

api.post('/api/auth/send-code', async (request, reply) => {
  const { email, purpose, locale } = request.body;

  if (!isValidEmail(email)) {
    throw new BizError(ErrorCodes.EMAIL_INVALID);  // 自动转 v7 错误信封
  }

  // ... 业务逻辑

  return { expiresIn: 300, nextRetryAfter: 60 };  // 自动包成 {code:0, data:..., requestId}
  // 或者:return ok({ expiresIn: 300, nextRetryAfter: 60 });  // 同效
});
```

**不要再手写** `{code:0, data, requestId}`。**不要手 catch**,直接 throw BizError。

### 三种 token 的 sub 字段

按 API_CONTRACT §1.3:

```ts
{ sub: deviceId | parentId | sellerId, type: 'device'|'parent'|'seller', iat, exp }
```

TTL:device=30d, parent=7d, seller=1d。批次 2 主要做 parent,device 在批次 3 复用同一个 jwt 工具。

### 验证码 Redis key 格式(写死在 verifyCode.js)

```
Key:   auth:verify:${email}:${purpose}    (purpose='register'|'login')
Value: ${code}:${attemptsLeft}             例如 "823461:3"
TTL:   300 秒
```

发送限流另一组 key(冷却 60s + 每小时 3 次):

```
Key: auth:verify:cooldown:${email}     TTL 60
Key: auth:verify:hourly:${email}       TTL 3600,值是计数(INCR)
```

### 密码登录的反爆破

按 Parent 表的 `failedLoginCount` + `lockedUntil` 字段(已建好):
- 错 5 次 → `lockedUntil = now + 15min`,返回 ACCOUNT_LOCKED (10008)
- 成功登录 → 清零 failedLoginCount
- **邮箱不存在也返回 PASSWORD_WRONG (10007)** 而非 EMAIL_NOT_FOUND,防枚举

### 注册接口的设备绑定(API_CONTRACT §4.2)

注册时如果带了 `deviceId` + `activationCode`,要顺带绑定。**这是 H5 主流程**(扫 TV 的 QR 进来直接绑设备)。

注意 §14.5(协议变更 v2):URL 里 H5 收到的是短名 `device`/`code`,但 H5 提交到 `/api/auth/register` 时会**自动转成长名** `deviceId`/`activationCode`。**服务端只接受长名**,不要做兼容。

### 响应里 parentToken 怎么发

```js
const token = await fastify.jwt.sign(
  { sub: parent.id, type: 'parent' },
  { expiresIn: '7d' }
);
return ok({ parentToken: token, parent: { id, email, locale, ... } });
```

---

## 还悬着的事(建议你主动提醒创始人)

### Resend 域名验证(影响批次 2 能否发邮件)

`MAIL_FROM=noreply@wonderbear.app` 必须在 Resend 后台先 **Add Domain → 添加 DNS 记录 → 等验证通过**。如果创始人的 wonderbear.app 域名还没在 Resend 上验证,批次 2 跑不到真发邮件那一步。

**你应该问**:`wonderbear.app` 在 Resend 验证状态如何?还是用 Resend 默认的 `onboarding@resend.dev`(测试用,有发送量限制)?

### 第二件事:批次 2 完成后的本地 e2e 测试

批次 1 全是 `.inject()` 测试,跑得快但不是真 HTTP。批次 2 加了真发邮件(Resend),建议补一个 `scripts/verify-e2e.sh`,创始人本地 docker compose up 之后能跑端到端验证(发码 → 收码 → 注册 → 登录 → 拿 token)。**这个脚本你写到 100 行内即可**,不用 over-engineer。

### 第三件事:GitHub repo 状态

仓库地址 https://github.com/snugogo/wonderbear,monorepo 结构。创始人**可能已经初始化了**(上次他答 Q1 给的就是 repo 地址),也可能还在准备。**你不用主动催**,但批次 2 完成时再次给打包 zip + 提醒 push。

### 第四件事:批次 4 用的 prompt 工程文档

**这条不影响批次 2,但批次 2 完成时你要把它写进给批次 3/4 的下一份 HANDOFF**:

`docs/spec/PROMPT_SPEC_v7_1.md` 是 prompt 工程的**权威版本**(已随代码 in-repo)。
批次 4 实现 `/api/story/*` 故事生成时,LLM prompt + 生图 prompt
全部以这份为准,**不要去翻 v7 完整交付包里的旧版 §10**。

详见 `docs/CHANGELOG.md`。

---

## 容器环境备忘

- 工作区 `/home/claude/wonderbear/server-v7/`
- Step A 参考代码 `/home/claude/wonderbear/stepA-ref/wonderbear/`(`utils/password.js` `utils/jwt.js` `plugins/auth.js` 都在那里,直接抄修)
- v7 文档 `/home/claude/wonderbear/v7-spec/WonderBear_v7_完整交付包_10份/`
- node_modules 已装,Prisma client 已 generate
- 没有真 PG/Redis,smoke test 用 mock 跑
- zip 输出 `/mnt/user-data/outputs/wonderbear-server-v7-batch2.zip`
- present_files 工具给用户下载

---

## 批次 2 开工建议节奏

1. **先讲设计**(给创始人 15 分钟看):
   - 6 个接口的字段对照(从 API_CONTRACT §4.1-4.6 抄表)
   - Resend 模板设计(变量占位、渲染、4 语言)
   - 反爆破策略(5 次 → 15 分钟锁)
   - 密码可选的 UX 细节(只验证码登录的账户怎么走 login-password?返回 PASSWORD_WRONG 还是 PASSWORD_NOT_SET?上一窗口决策建议:复用 PASSWORD_WRONG 防枚举)
2. **得"开工"指令后**按文件清单顺序写
3. **每个文件写完跑一次 smoke 增量补充测试**
4. **打包前**确认:`node test/smoke/run.mjs` 仍 100% 绿(批次 1 的 72 断言不能因为你改了 app.js 注册新路由就坏)

---

## 和创始人沟通风格(继承自上轮)

- 中文回复,代码注释英文
- 一般聊天不堆表格 bullets,正式输出(批次进度、接口列表)可以用
- 有决策让他选 → 用 `ask_user_input_v0` 工具
- 上下文到 60% 提醒他考虑换窗口
- 先讲设计、再写代码;每个文件给"跑这行,期待这个输出"
- 输出 zip 给他下载,不要只贴代码片段
- 重大决策前主动提案,不做甩手掌柜

### 第五件事:协议补充 v3(dialogue/turn 接 audioBase64)

**这条直接影响批次 4,但批次 2 完成时你写 HANDOFF_BATCH3/4 必须明确传下去**:

`docs/spec/API_CONTRACT_PATCH_v3.md` 描述了 dialogue/turn 增加 audioBase64 字段的协议补充。
**批次 4 实现时必须按 patch v3 走**(代码示例已写好,直接抄)。
TV 端会用 audioBase64 路径,不再单独调 /api/asr/upload。

### 第六件事:硬性新规则 — 每批次必须更新 API_ACTUAL_FORMAT.md

**从批次 2 开始,这是验收硬指标**:

完成本批次实现后,**必须**在 `docs/spec/API_ACTUAL_FORMAT.md` 对应章节追加:
- 每个新接口的 curl 示例
- 真实 response JSON 实例(在你本地跑测试拿到的)
- 主要错误码触发示例(怎么构造请求触发 10001/20001/etc)

**目的**:TV / H5 窗口联调前拉这份文档跟 API_CONTRACT 比对,提前发现差异。

**不写就不算批次完成**。这是创始人 + TV 窗口共同确认的规则(见 CHANGELOG)。

---

## 最后一句

上一窗口最后跑通的是 72/72 smoke,health + envelope + errorCode + locale + BizError 全链路稳。你在这个基础上做认证模块,只要遵循"throw BizError + return bare data"的范式,代码会非常干净。Resend 那边等创始人确认域名状态再开真 send 流程。

加油。

---

**当前时间戳**:2026-04-21
**SHA-equivalent 验证**:批次 1 zip 内 `node test/smoke/run.mjs` → 72 passed / 0 failed
**等待指令**:创始人说"开工批次 2"即开
