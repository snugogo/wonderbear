# 实际接口形态记录

> **目的**:每个批次完成后,后端窗口在这里追加该批次实现的**真实接口形态**
> (curl 命令 + 响应 JSON 实例),供 TV / H5 窗口联调前比对。
> **维护规则**:每完成一个批次,在对应章节填充内容,push 到 GitHub。
> **创始人决策来源**:TV 窗口 Q3 决策(2026-04-22)
> **检查方**:TV / H5 联调前 `git pull` 拉本文档,跟 `API_CONTRACT.md` 比对差异

---

## 批次 0+1:基础设施 + 响应信封

### `GET /api/health`

**curl**:
```bash
curl -s http://localhost:3000/api/health | jq
```

**Response 200**(全部上游配齐):
```json
{
  "code": 0,
  "data": {
    "status": "ok",
    "version": "0.1.0",
    "services": {
      "db": "ok",
      "redis": "ok",
      "openai": "ok",
      "gemini": "ok",
      "fal": "ok",
      "elevenlabs": "ok",
      "resend": "ok",
      "stripe": "ok",
      "paypal": "ok",
      "speech": "ok"
    },
    "serverTime": "2026-04-22T10:00:00.000Z"
  },
  "requestId": "req_abc123def456"
}
```

**Response 503**(infra 故障):
```json
{
  "code": 0,
  "data": {
    "status": "degraded",
    "version": "0.1.0",
    "services": {
      "db": "error",
      "redis": "ok",
      ...
    },
    "serverTime": "2026-04-22T10:00:00.000Z"
  },
  "requestId": "req_xyz"
}
```
HTTP 状态码:503,LB 会摘除该实例。

### 通用响应信封(所有 1xx-9xx 错误)

**成功(任何接口)**:
```json
{ "code": 0, "data": {...}, "requestId": "req_..." }
```

**业务失败(任何接口)**:
```json
{
  "code": 30004,
  "message": "故事额度用完了,订阅解锁无限故事",
  "messageEn": "Free quota exhausted, subscribe for unlimited",
  "messagePl": "Wyczerpany darmowy limit, subskrybuj dla nielimitowanych",
  "messageRo": "Limita gratuită epuizată, abonați-vă pentru nelimitat",
  "requestId": "req_...",
  "details": { "storiesLeft": 0 },
  "actions": [{"label": "升级", "labelEn": "Upgrade", "url": "/sub"}]
}
```
HTTP 状态码:**业务失败也是 200**(per §1.2),客户端只判 `code`。

---

## 批次 2:认证模块(已完成 2026-04-22)

**smoke**:`node test/smoke/run.mjs` → Passed: 172 / Failed: 0

**dev-mode 邮件**:未配置 `RESEND_API_KEY` 时,验证码通过两个渠道打印:
1. `request.log.warn({ mailer:'dev-mode', to, code, locale, purpose, subject, messageId }, '[DEV MAIL] 📧 ...')` — 结构化
2. `console.log` 横幅(无论 logger 被重定向与否都可见):
```
========================================
📧 DEV MAIL (Resend key NOT configured)
To:      mom@example.com
Code:    823461
Locale:  zh  |  Purpose: register
Subject: WonderBear 注册验证码
========================================
```
创始人本地从日志里 grep `Code:` 或 `DEV MAIL` 拿到 6 位码。

---

### 4.1 `POST /api/auth/send-code`

**curl(成功)**:
```bash
curl -s -X POST http://localhost:3000/api/auth/send-code \
  -H 'Content-Type: application/json' \
  -d '{"email":"mom@example.com","purpose":"register","locale":"zh"}' | jq
```

**Response 200**:
```json
{
  "code": 0,
  "data": { "expiresIn": 300, "nextRetryAfter": 60 },
  "requestId": "req_abc123def456"
}
```

**错误示例**:
- 邮箱格式错:`{"code":10003,"message":"邮箱格式不正确","messageEn":"Invalid email format",...}`
- purpose 非 `register|login`:`{"code":90002,"message":"Invalid parameter","details":{"field":"purpose","expected":["register","login"]}}`
- 60 秒内重发:
```json
{
  "code": 90003,
  "message": "请求太频繁了,请稍后再试",
  "messageEn": "Rate limit exceeded",
  "requestId": "req_...",
  "details": { "reason": "cooldown", "nextRetryAfter": 47, "limit": 1, "windowSeconds": 60 }
}
```
- 1 小时内超 3 次:`details.reason="hourly"`, `details.limit=3`, `details.windowSeconds=3600`

---

### 4.2 `POST /api/auth/register`

**批次 2 约束**:`deviceId` / `activationCode` 字段接受类型校验但**不做绑定**;响应中 `device: null`。
H5 主流程应紧接着调 `/api/device/bind`(批次 3)完成设备绑定 + 6 本额度发放。

**curl(成功)**:
```bash
curl -s -X POST http://localhost:3000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{
    "email":"mom@example.com",
    "code":"823461",
    "password":"Parent2026",
    "deviceId":"tv_gp15_abc123",
    "activationCode":"AC12XYZ",
    "locale":"zh"
  }' | jq
```

**Response 200**(success):
```json
{
  "code": 0,
  "data": {
    "parentToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjbV9hYmMiLCJ0eXBlIjoicGFyZW50IiwiaWF0IjoxNzE0MDAwMDAwLCJleHAiOjE3MTQ2MDQ4MDB9.signature",
    "parent": {
      "id": "cm_abc123",
      "email": "mom@example.com",
      "locale": "zh",
      "createdAt": "2026-04-22T10:15:22.123Z",
      "activated": false
    },
    "device": null,
    "tokenExpiresAt": "2026-04-29T10:15:22.123Z"
  },
  "requestId": "req_..."
}
```

**错误示例**:
- 验证码错(过期):`{"code":10004,"messageEn":"Verification code expired"}`
- 验证码错(还有剩余次数):`{"code":10002,"messageEn":"Verification code invalid","details":{"attemptsLeft":2}}`
- 邮箱已注册:`{"code":10005,"messageEn":"Email already registered, please log in"}`
- 密码弱:`{"code":10009,"messageEn":"Password must be at least 8 chars with letter and number","details":{"reason":"missing digit"}}`

---

### 4.3 `POST /api/auth/login-code`

**curl**:
```bash
curl -s -X POST http://localhost:3000/api/auth/login-code \
  -H 'Content-Type: application/json' \
  -d '{"email":"mom@example.com","code":"823461"}' | jq
```

**Response 200**:
```json
{
  "code": 0,
  "data": {
    "parentToken": "eyJhbGci...",
    "parent": {
      "id": "cm_abc123",
      "email": "mom@example.com",
      "locale": "zh",
      "activated": false,
      "subscription": null
    },
    "tokenExpiresAt": "2026-04-29T..."
  },
  "requestId": "req_..."
}
```

订阅非空时:
```json
"subscription": {
  "plan": "monthly",
  "status": "active",
  "expiresAt": "2026-05-22T10:00:00.000Z",
  "pdfExportsLeft": 2
}
```

**错误示例**:
- 邮箱不存在(反枚举):`{"code":10007,"messageEn":"Wrong email or password"}` — **不是 10005**
- 验证码错:`{"code":10002,"details":{"attemptsLeft":2}}`
- 验证码过期:`{"code":10004}`

---

### 4.4 `POST /api/auth/login-password`

**curl**:
```bash
curl -s -X POST http://localhost:3000/api/auth/login-password \
  -H 'Content-Type: application/json' \
  -d '{"email":"mom@example.com","password":"Parent2026"}' | jq
```

**Response 200**:结构同 `/api/auth/login-code`。

**错误示例**:
- 账户不存在 / 密码空 / 密码错(统一反枚举):`{"code":10007,"messageEn":"Wrong email or password","details":{"attemptsLeft":4}}`
- 只验证码登录的账户(`passwordHash=null`)走密码登录:同上 10007(**不返回 PASSWORD_NOT_SET**)
- 累计 5 次错 → 锁定:
```json
{
  "code": 10008,
  "messageEn": "Too many failed attempts, try again in 15 minutes or use code login",
  "details": { "unlockAt": "2026-04-22T10:30:00.000Z" }
}
```
- 锁定期内即使输对密码:仍然 10008(锁定优先于密码校验)

---

### 4.5 `POST /api/auth/refresh`

**curl**:
```bash
curl -s -X POST http://localhost:3000/api/auth/refresh \
  -H 'Authorization: Bearer eyJhbGci...' | jq
```

**Response 200**:
```json
{
  "code": 0,
  "data": {
    "parentToken": "eyJhbGci...NEW...",
    "expiresAt": "2026-04-29T10:15:22.123Z"
  },
  "requestId": "req_..."
}
```

**策略**(批次 2 决策 Q2):签名通过 + 不在黑名单即可刷新,无"距 exp X 分钟"窗口约束。

**错误示例**:
- 无 Authorization header:`{"code":10001,"messageEn":"Session expired, please log in again"}` + HTTP **401**
- Bearer 但 token 过期 / 签名错:同上 10001 + HTTP 401
- Token 已 logout(被黑名单):`{"code":10010,"messageEn":"Session revoked, please log in again"}` + HTTP 401
- 用 device token 访问:`{"code":10006,"messageEn":"Invalid credential type"}` + HTTP 401

---

### 4.6 `POST /api/auth/logout`

**curl**:
```bash
curl -s -X POST http://localhost:3000/api/auth/logout \
  -H 'Authorization: Bearer eyJhbGci...' | jq
```

**Response 200**:
```json
{ "code": 0, "data": null, "requestId": "req_..." }
```

**服务端行为**:Token 的 `sha256` 写入 Redis `auth:blacklist:{hash}`,TTL = `exp - now`。
同一 token 再用于任何 parent 端点 → `10010 TOKEN_REVOKED`。

---

### 批次 2 对 TV / H5 的联调检查清单

1. **Response envelope**:所有接口都包 `{code, data, requestId}`,业务错误也是 HTTP 200。
2. **parentToken 格式**:标准 JWT(3 段 `.` 分隔),HS256 签名,payload = `{sub, type:'parent', iat, exp}`。
3. **10007 反枚举**:邮箱不存在、账户无密码、密码错 —— 三种场景客户端看到的错误码完全一致。
4. **10001 vs 10010**:token 过期/无效都是 10001(HTTP 401);已登出是 10010(HTTP 401)。前端要区分 toast 文案。
5. **Dev-mode 验证码**:联调环境如没配 Resend,客户端开发者从 server 日志拿 code,不走邮箱。

---

## 批次 3:设备 + 孩子模块(待实现后填充)

> **后端实现完批次 3 后,在这里追加**:
> - POST /api/device/register
> - GET  /api/device/status
> - POST /api/device/bind
> - POST /api/device/unbind
> - POST /api/device/heartbeat
> - GET  /api/device/active-child
> - POST /api/child
> - PATCH /api/child/:id
> - GET  /api/child/list

TODO

---

## 批次 4:故事生成模块(待实现后填充)

> **后端实现完批次 4 后,在这里追加**:
> - POST /api/story/dialogue/start
> - POST /api/story/dialogue/:id/turn  ← **注意 v3 patch:增加 audioBase64 字段**
> - POST /api/story/generate
> - GET  /api/story/:id/status
> - GET  /api/story/:id
>
> 重要:dialogue/turn 必须按 `API_CONTRACT_PATCH_v3.md` 实现 audioBase64 路径
> 重要:LLM + 生图 prompt 必须按 `PROMPT_SPEC_v7_1.md` 实现

TODO

---

## 批次 5:订阅 + 支付(待实现后填充)

TODO

---

## 批次 6:OEM + OTA + telemetry(待实现后填充)

TODO

---

## 批次 7:经销商 Console(待实现后填充)

TODO

---

## 维护规范

每个批次完成后,后端窗口在 `docs/CHANGELOG.md` 追加一条记录,
**同时**在本文件的对应章节填充实际接口示例。

如果实现时发现契约有问题(必须改字段),在 `docs/spec/API_CONTRACT_PATCH_v{N}.md`
追加新 patch,本文件记录改后的实际形态。
