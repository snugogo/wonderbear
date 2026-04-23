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

## 批次 3:设备 + 孩子 + 家长模块(已完成 2026-04-23)

**smoke**:`node test/smoke/run.mjs` → Passed: 280 / Failed: 0(批次 1+2+3 累计)

**路由清单**(全部实现):
- 设备:`register / status / bind / unbind / heartbeat / ack-command / active-child(GET+POST) / :id/reboot / list / refresh-token`
- 孩子:`POST / PATCH :id / DELETE :id / GET /list / GET /:id`
- 家长:`GET /me / PATCH /me`

**关键决策**(与批次 2 的交接点):
- `/api/auth/register` 只建 Parent,`device: null`,不扣额度。
- `/api/device/bind` 执行"首次绑定发 6 本 + 记录绑定"的核心事务。`activated_unbound → bound` 时 `storiesLeft = 6`;`unbound_transferable → bound` 时 `storiesLeft` 保留不变(额度跟设备走,不跟账户走)。
- 1 parent 最多 4 device、1 parent 最多 4 child(超出分别返回 20008 / 30010)。
- `/api/device/:id/reboot` 写 Redis `device:commands:<deviceCuid>` list(TTL 300s),`/api/device/heartbeat` 读取后随响应返回,`/api/device/ack-command/:id` 从 list 中 `lrem` 删除。
- `/api/device/active-child` 的 POST 同时接受 parent token(必须带 `deviceId`)和 device token(`deviceId` 从 token 推断)。
- `/api/parent/me` 的 `activated` 字段 = `devices.length > 0`(派生,非数据库字段)。
- `/api/device/unbind` 要求二次校验:`confirmCode` 必须是此前由 `/api/auth/send-code` 发送的 `purpose='login'` 邮箱验证码。

---

### 5.1 `POST /api/device/register`

**说明**:TV 首次开机 + 激活码写入后调用。无需鉴权。如果同一 `deviceId` 已经注册过(例如出厂重置重开),返回一个新 token 并保留原 status。同一激活码被另一台设备抢用返回 20004。

**curl**:
```bash
curl -s -X POST http://localhost:3000/api/device/register \
  -H 'Content-Type: application/json' \
  -d '{
    "deviceId": "GP15-SN-A1B2C3D4",
    "activationCode": "WB12345",
    "hwFingerprint": "ab:cd:ef:12:34:56",
    "model": "GP15",
    "firmwareVer": "1.0.0",
    "osVersion": "Android 11",
    "batchCode": "batch-2026-04"
  }' | jq
```

**Response 200(新设备)**:
```json
{
  "code": 0,
  "data": {
    "deviceToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "device": {
      "id": "cm_dev_abc123",
      "deviceId": "GP15-SN-A1B2C3D4",
      "status": "activated_unbound",
      "boundAt": null,
      "storiesLeft": 0
    },
    "oemConfig": null,
    "tokenExpiresAt": "2026-05-23T00:59:00.000Z"
  },
  "requestId": "req_..."
}
```
- `storiesLeft: 0` 此时尚未发,`/api/device/bind` 首次绑定时发 6。
- `oemConfig: null` 表示走 WonderBear 默认品牌;OEM 激活码批次会在这里返回完整 `{ oemId, brandName, logoUrl, colors, menus, assetBundleUrl, h5BaseUrl }`。

**错误示例**:
- `deviceId` 格式不符(`^[A-Za-z0-9_-]{8,128}$`):`{"code":20007,"message":"设备 ID 格式错误"}`
- 激活码格式不符(`^[A-Za-z0-9]{6,12}$`):`{"code":20002}`
- 激活码不存在 / 已吊销:`{"code":20002,"details":{"reason":"revoked"}}`
- 激活码已被别的设备用掉:`{"code":20004,"message":"激活码已被使用"}`
- 设备已被禁用:`{"code":20006,"message":"设备已被禁用,请联系客服"}`

---

### 5.2 `GET /api/device/status`

**认证**:`Authorization: Bearer <deviceToken>`

**curl**:
```bash
curl -s http://localhost:3000/api/device/status \
  -H 'Authorization: Bearer eyJhbGci...' | jq
```

**Response 200**:
```json
{
  "code": 0,
  "data": {
    "status": "activated_unbound",
    "parent": null,
    "activeChild": null
  },
  "requestId": "req_..."
}
```

设备已绑定后:
```json
{
  "code": 0,
  "data": {
    "status": "bound",
    "parent": { "id": "cm_par_xxx", "email": "mom@example.com", "locale": "zh" },
    "activeChild": {
      "id": "cm_chd_xxx",
      "parentId": "cm_par_xxx",
      "name": "Luna",
      "age": 5,
      "primaryLang": "zh",
      "secondLang": "en",
      ...
    }
  }
}
```

**错误**:无 token → `10001`;用 parent token → `10006`。

---

### 5.3 `POST /api/device/bind`

**认证**:`Authorization: Bearer <parentToken>`

**curl**:
```bash
curl -s -X POST http://localhost:3000/api/device/bind \
  -H 'Authorization: Bearer eyJhbGci...' \
  -H 'Content-Type: application/json' \
  -d '{"deviceId":"GP15-SN-A1B2C3D4","activationCode":"WB12345"}' | jq
```

**Response 200(首次绑定)**:
```json
{
  "code": 0,
  "data": {
    "device": {
      "id": "cm_dev_abc",
      "deviceId": "GP15-SN-A1B2C3D4",
      "status": "bound",
      "boundAt": "2026-04-23T01:10:33.221Z",
      "storiesLeft": 6,
      "oemConfig": null
    },
    "activatedQuota": true
  },
  "requestId": "req_..."
}
```

**Response 200(重新绑定一台之前被 unbind 过的设备 —— 额度保留不变)**:
```json
{
  "code": 0,
  "data": {
    "device": { "status": "bound", "storiesLeft": 4, ... },
    "activatedQuota": false
  }
}
```

**错误**:
- 不带 parent token:`10001`
- 设备不存在:`20005`
- 激活码不匹配(deviceId 对,但 code 不对):`20002`
- 已绑给别的账户:`20003`(可带 `"forceOverride": true` 覆盖,慎用)
- 账户已满 4 台:`20008`
- 设备被禁用:`20006`

---

### 5.4 `POST /api/device/unbind`

**认证**:`Authorization: Bearer <parentToken>` + 必须先调 `/api/auth/send-code { purpose: 'login' }` 拿 6 位验证码。

**curl**:
```bash
# 步骤 1: 发验证码
curl -X POST http://localhost:3000/api/auth/send-code \
  -H 'Content-Type: application/json' \
  -d '{"email":"mom@example.com","purpose":"login","locale":"zh"}'
# 步骤 2: 用验证码解绑
curl -s -X POST http://localhost:3000/api/device/unbind \
  -H 'Authorization: Bearer eyJhbGci...' \
  -H 'Content-Type: application/json' \
  -d '{"deviceId":"GP15-SN-A1B2C3D4","confirmCode":"654321"}' | jq
```

**Response 200**:
```json
{
  "code": 0,
  "data": {
    "deviceId": "GP15-SN-A1B2C3D4",
    "status": "unbound_transferable"
  },
  "requestId": "req_..."
}
```

**服务端行为**:
- `Device.parentId = null`、`Device.activeChildId = null`、`Device.status = 'unbound_transferable'`
- `ActivationCode.status = 'transferred'`(设备下次被其他账户绑上去,无需新激活码,用原码即可)
- `Device.storiesLeft` **保留**(额度跟设备走)

**错误**:缺 `confirmCode` → `90001`;验证码错或过期 → `10002`;设备不在此 parent 名下 → `20005`。

---

### 5.5 `POST /api/device/heartbeat`

**认证**:`Authorization: Bearer <deviceToken>`,每 5 分钟一次。

**curl**:
```bash
curl -s -X POST http://localhost:3000/api/device/heartbeat \
  -H 'Authorization: Bearer eyJhbGci...' \
  -H 'Content-Type: application/json' \
  -d '{
    "currentScreen": "home",
    "memoryUsageMb": 128,
    "firmwareVer": "1.0.0",
    "networkType": "wifi"
  }' | jq
```

**Response 200(无命令)**:
```json
{
  "code": 0,
  "data": {
    "pendingCommands": [],
    "serverTime": "2026-04-23T01:15:00.000Z"
  },
  "requestId": "req_..."
}
```

**Response 200(有 reboot 待执行)**:
```json
{
  "code": 0,
  "data": {
    "pendingCommands": [
      {
        "id": "cmd_1745371234567_a1b2c3d4e",
        "type": "reboot",
        "issuedAt": "2026-04-23T01:14:30.123Z",
        "expiresAt": "2026-04-23T01:19:30.123Z"
      }
    ],
    "serverTime": "2026-04-23T01:15:00.000Z"
  }
}
```

**服务端行为**:写入 `Device.lastSeenAt = now()`,读取 Redis `device:commands:<cuid>` 的全部未 ack 命令随响应返回。

---

### 5.6 `POST /api/device/ack-command/:id`

**认证**:`Authorization: Bearer <deviceToken>`

**curl**:
```bash
curl -s -X POST http://localhost:3000/api/device/ack-command/cmd_1745371234567_a1b2c3d4e \
  -H 'Authorization: Bearer eyJhbGci...' \
  -H 'Content-Type: application/json' \
  -d '{"result":"ok"}' | jq
```

**Response 200**:
```json
{ "code": 0, "data": null, "requestId": "req_..." }
```

**服务端行为**:从 `device:commands:<cuid>` list 中删除对应 JSON 条目。`result` / `error` 字段写入 request log 供排查。

---

### 5.7 `GET /api/device/active-child`

**认证**:`Authorization: Bearer <deviceToken>`

**curl**:
```bash
curl -s http://localhost:3000/api/device/active-child \
  -H 'Authorization: Bearer eyJhbGci...' | jq
```

**Response 200**:
```json
{
  "code": 0,
  "data": {
    "activeChild": { "id":"cm_chd_a", "name":"Luna", "age":5, ... },
    "allChildren": [
      { "id":"cm_chd_a", "name":"Luna", "age":5, ... },
      { "id":"cm_chd_b", "name":"Sol",  "age":7, ... }
    ]
  },
  "requestId": "req_..."
}
```

---

### 5.8 `POST /api/device/active-child`

**认证**:接受 parent **或** device token。
- device token:`deviceId` 从 token 推断,body 只要 `{ childId }`
- parent token:body 必须同时给 `{ deviceId, childId }`

**curl(device token)**:
```bash
curl -s -X POST http://localhost:3000/api/device/active-child \
  -H 'Authorization: Bearer <deviceToken>' \
  -H 'Content-Type: application/json' \
  -d '{"childId":"cm_chd_a"}' | jq
```

**curl(parent token)**:
```bash
curl -s -X POST http://localhost:3000/api/device/active-child \
  -H 'Authorization: Bearer <parentToken>' \
  -H 'Content-Type: application/json' \
  -d '{"deviceId":"GP15-SN-A1B2C3D4","childId":"cm_chd_a"}' | jq
```

**Response 200**:
```json
{
  "code": 0,
  "data": { "activeChild": { "id":"cm_chd_a", "name":"Luna", ... } },
  "requestId": "req_..."
}
```

**错误**:parent token 未带 `deviceId` → `90001`;child 不属于此 parent → `30009`。

---

### 5.9 `POST /api/device/:id/reboot`

**认证**:`Authorization: Bearer <parentToken>`

**参数**:`:id` 是设备的 **cuid**(`Device.id`),不是 `deviceId`。可以从 `GET /api/device/list` 拿到。

**curl**:
```bash
curl -s -X POST http://localhost:3000/api/device/cm_dev_abc/reboot \
  -H 'Authorization: Bearer eyJhbGci...' | jq
```

**Response 200**:
```json
{
  "code": 0,
  "data": {
    "commandId": "cmd_1745371234567_a1b2c3d4e",
    "queuedAt": "2026-04-23T01:14:30.123Z",
    "willExecuteWithin": 300
  },
  "requestId": "req_..."
}
```

`willExecuteWithin` 秒 = 命令在 Redis 的 TTL(默认 300s / 5 分钟,与心跳周期对齐)。若期间 TV 没心跳,命令静默过期。

**错误**:设备不在此 parent 名下 → `20005`。

---

### 5.10 `GET /api/device/list`

**认证**:`Authorization: Bearer <parentToken>`

**curl**:
```bash
curl -s http://localhost:3000/api/device/list \
  -H 'Authorization: Bearer eyJhbGci...' | jq
```

**Response 200**:
```json
{
  "code": 0,
  "data": {
    "items": [
      {
        "id": "cm_dev_abc",
        "deviceId": "GP15-SN-A1B2C3D4",
        "status": "bound",
        "boundAt": "2026-04-23T01:10:33.221Z",
        "lastSeenAt": "2026-04-23T01:15:00.000Z",
        "storiesLeft": 6,
        "model": "GP15",
        "firmwareVer": "1.0.0",
        "online": true
      }
    ]
  },
  "requestId": "req_..."
}
```

`online` 派生:`lastSeenAt` 距今 ≤ 10 分钟视为在线。

---

### 5.x `POST /api/device/refresh-token`

**认证**:`Authorization: Bearer <deviceToken>`(即将过期或已刷新策略都走这里)。

**Response 200**:
```json
{
  "code": 0,
  "data": {
    "deviceToken": "eyJhbGci...NEW...",
    "expiresAt": "2026-05-23T01:20:00.000Z"
  },
  "requestId": "req_..."
}
```

---

### 6.1 `POST /api/child`

**认证**:`Authorization: Bearer <parentToken>`

**curl**:
```bash
curl -s -X POST http://localhost:3000/api/child \
  -H 'Authorization: Bearer eyJhbGci...' \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Bella",
    "age": 4,
    "gender": "female",
    "avatar": "avatar_bear_crown",
    "primaryLang": "zh",
    "secondLang": "en",
    "birthday": "2022-03-15"
  }' | jq
```

**Response 201**:
```json
{
  "code": 0,
  "data": {
    "child": {
      "id": "cm_chd_abc",
      "parentId": "cm_par_xyz",
      "name": "Bella",
      "age": 4,
      "gender": "female",
      "avatar": "avatar_bear_crown",
      "primaryLang": "zh",
      "secondLang": "en",
      "birthday": "2022-03-15",
      "coins": 0,
      "voiceId": null,
      "createdAt": "2026-04-23T01:20:00.000Z",
      "updatedAt": "2026-04-23T01:20:00.000Z"
    }
  },
  "requestId": "req_..."
}
```

**校验规则 / 错误**:
- `name` 空 → `90001`;`name.length > 20` → `90002`
- `age` 不在 `[3, 8]` → `90002 { field:'age', min:3, max:8 }`
- `gender` 不在 `[male, female, prefer_not_say]` → `90002`
- `primaryLang` 不在 `[zh, en, pl, ro]` → `90002`
- `secondLang` 不在 `[zh, en, pl, ro, none]` → `90002`
- `birthday` 不是合法日期 → `90002 { format:'YYYY-MM-DD' }`
- 已有 4 个孩子:`30010`

---

### 6.2 `PATCH /api/child/:id`

**认证**:`Authorization: Bearer <parentToken>`

**curl**:
```bash
curl -s -X PATCH http://localhost:3000/api/child/cm_chd_abc \
  -H 'Authorization: Bearer eyJhbGci...' \
  -H 'Content-Type: application/json' \
  -d '{"age":5,"avatar":"avatar_bear_pilot","voiceId":"voice_alto"}' | jq
```

**Response 200**:`{ "code": 0, "data": { "child": {...更新后...} } }`

**错误**:child 不属于此 parent 或不存在 → `30009`。

---

### 6.3 `DELETE /api/child/:id`

**认证**:`Authorization: Bearer <parentToken>`

**Response 200**:
```json
{ "code": 0, "data": { "deleted": true }, "requestId": "req_..." }
```

**服务端行为**:
1. 清空所有 `Device.activeChildId` 对此 child 的引用
2. 删除 Child 记录(stories 因 `onDelete: Cascade` 一并清除 —— 未来若改成软删留 story,需改 schema)

---

### 6.4 `GET /api/child/list`

**认证**:`Authorization: Bearer <parentToken>`

**Response 200**:
```json
{
  "code": 0,
  "data": {
    "items": [ {...child...}, {...child...} ],
    "total": 2,
    "maxAllowed": 4
  },
  "requestId": "req_..."
}
```

`items` 按 `createdAt` 升序。

---

### 6.5 `GET /api/child/:id`

**认证**:接受 parent **或** device token。
- parent token:必须是该 child 的 parent
- device token:child 必须是该设备的 `activeChild`(防越权读)

**Response 200**:
```json
{
  "code": 0,
  "data": {
    "child": { ... },
    "storiesCount": 3,
    "lastStoryAt": "2026-04-22T20:15:00.000Z"
  },
  "requestId": "req_..."
}
```

---

### 6bis.1 `GET /api/parent/me`

**认证**:`Authorization: Bearer <parentToken>`

**Response 200**:
```json
{
  "code": 0,
  "data": {
    "parent": {
      "id": "cm_par_xyz",
      "email": "mom@example.com",
      "locale": "zh",
      "activated": true,
      "playBgm": true,
      "createdAt": "2026-04-22T10:00:00.000Z",
      "subscription": {
        "plan": "monthly",
        "status": "active",
        "expiresAt": "2026-05-22T00:00:00.000Z",
        "pdfExportsLeft": 2
      },
      "devicesCount": 1,
      "childrenCount": 2
    },
    "devices": [ {...device summary...} ],
    "children": [ {...child...}, {...child...} ]
  },
  "requestId": "req_..."
}
```

`parent.activated` 派生自 `devices.length > 0`。

---

### 6bis.2 `PATCH /api/parent/me`

**认证**:`Authorization: Bearer <parentToken>`

**支持字段**:`locale`、`playBgm`、`password`(改密码时 `currentPassword` 必填)。

**curl(改密码)**:
```bash
curl -s -X PATCH http://localhost:3000/api/parent/me \
  -H 'Authorization: Bearer eyJhbGci...' \
  -H 'Content-Type: application/json' \
  -d '{"currentPassword":"OldPw123","password":"NewStrongPw99"}' | jq
```

**Response 200**:`{ "code": 0, "data": { "parent": {...更新后...} } }`

**错误**:
- 缺 `currentPassword`:`90001`
- `currentPassword` 错 / 账户无密码:`10007`(反枚举,不泄露"账户无密码")
- 新密码弱:`10009 { reason }`
- `locale` 不合法:`90002`
- `playBgm` 非布尔:`90002`

---

### 批次 3 对 TV / H5 的联调检查清单

1. **三步激活**:TV `register`(拿 deviceToken)→ H5 扫码 + parent `register` + `login-code`(拿 parentToken)→ H5 调 `/api/device/bind`(首次:发 6 本额度 + `activatedQuota:true`)。
2. **两种 token 共存**:`/api/device/active-child`(POST)和 `/api/child/:id`(GET)同时接受 parent 和 device token;其他设备端点要求 device token,其他家长端点要求 parent token(错配返回 `10006`)。
3. **6 本免费额度的继承规则**:激活 → 未绑:0;首次绑:6;解绑(`unbound_transferable`):保留(例如还剩 4);重新被任意 parent 绑:继承原数(不重新发 6)。
4. **命令队列**:`/reboot` 写 Redis + TTL 300s;设备 5 分钟一次心跳拉取;设备必须 `ack-command/:id` 显式消费,否则下次心跳还会返回。
5. **Child 限制**:1 parent ≤ 4 child;`age ∈ [3, 8]`;`primaryLang/secondLang` 走固定白名单。
6. **parent.activated** 字段不是数据库列,服务端每次请求时现算(`devices.length > 0`)。
7. **`PATCH /api/parent/me` 改密码**:必须带 `currentPassword`,无密码账户走这条路径报 `10007`(与登录一致)。

---

## 批次 4:故事生成模块(已完成 2026-04-23)

**smoke**:`node test/smoke/run.mjs` → **Passed: 395 / Failed: 0**(批次 1 72 + 批次 2 100 + 批次 3 108 + 批次 4 115)

**新增代码**(2 utils + 4 services + 1 queue + 2 routes + 1 plugin + 1 smoke 扩展):

```
src/utils/
├── storyPrompt.js       Prompt 工厂 + imagePromptSanitizer(PROMPT_SPEC v7.1 权威版)
│                        STYLE_SUFFIXES default = "vibrant saturated colors,
│                        high contrast, projection-display optimized, ..."
│                        SAFE_REPLACEMENTS 含 v7.1 禁用词(aged paper/sepia/...)
└── contentSafety.js     三级过滤 ok|warn|blocked + 中英关键词字典 + unintelligible

src/services/
├── llm.js               Gemini 2.0 Flash + `USE_MOCK_AI=1` mock 回退
│                        generateDialogueTurn / generateStoryJson(12 页)
├── imageGen.js          3 路降级 FAL → Imagen → OpenAI → placeholder
│                        每次尝试调用 onAttempt(写 ImageGenLog)
├── tts.js               ElevenLabs Multilingual v2 + sha256 缓存
│                        无 key/USE_MOCK_AI → mock://tts/<hash>.mp3
└── asr.js               OpenAI Whisper + mock;buffer < 4 字节 throw

src/queues/
└── storyJob.js          createStoryQueue(prisma) — 高/普通两个 FIFO lane
                         pipeline: queue → llm → image → tts → assembly → done
                         runNextUntilEmpty() 给 smoke 同步驱动

src/plugins/
└── storyQueue.js        fastify.decorate('storyQueue', createStoryQueue(prisma))

src/routes/
├── story.js             9 个接口:dialogue/start, dialogue/:id/turn(patch v3),
│                        generate, :id/status, :id, list, :id/favorite,
│                        :id/play-stat, DELETE :id
└── tts.js               POST /api/tts/synthesize(50/小时/设备)+ GET /api/tts/voices

test/smoke/
└── batch4.mjs           115 条批次 4 断言,run.mjs 末尾 dynamic import
```

**关键决策**:

1. **Prompt 工厂走 v7.1 版**(创始人多次强调):风格后缀用 `IMAGE_STYLE_SUFFIX` 环境变量,默认值是
   "vibrant saturated colors, bright cheerful children's book illustration, clean crisp watercolor style,
   vivid warm palette, luminous glowing colors, high contrast, professional storybook art,
   projection-display optimized, Miyazaki-inspired color richness, clear outlines"。
   `FORBIDDEN_STYLE_WORDS` 双重保险,即使 LLM 误输出 `aged paper` / `muted tones` / `sepia`
   也会被 sanitizer 删除。

2. **三路生图降级顺序按 PROMPT_SPEC §6.1**:`FAL → Imagen → OpenAI`(最便宜/宽松到最贵/最严),
   三路都挂 → placeholder + ContentAlert + `Story.failureCode=30002`。
   每次尝试写 `ImageGenLog`,供后续 3 路调优。

3. **Sanitizer 三通道差异化**(PROMPT_SPEC §4.5):
   - `fal`/`imagen`:只做 basic replace,不做组合检测/激进改写
   - `openai`:basic replace + `DANGEROUS_COMBOS_OPENAI` 命中后 `aggressiveRewrite`(整句改户外白天)

4. **Queue 选型:in-process**(创始人"不要过度工程"):高/普通两个 FIFO lane,
   yearly 订阅 → high 优先;Phase 1 < 1 QPS 足够;切 BullMQ 放 Phase 2。

5. **LLM 成功才扣额度**(保守策略):`Device.storiesLeft -= 1` 由 storyJob 在 LLM stage
   成功后用 `updateMany({ id, storiesLeft: { gt: 0 } })` 执行,仅对非订阅者。图像/TTS
   阶段失败 **不回滚**(LLM 已算账,内容已成形)。订阅 `status === 'active'` 全程跳过检查。

6. **日限计数**(Redis `rate:story-gen:<deviceId>:<YYYY-MM-DD>`,TTL 24h):
   非订阅者 3 本/天,超限 → `30005 DAILY_LIMIT_REACHED`。值在 generate 入队前乐观加一,
   失败不回退(防止刷接口)。订阅者跳过。

7. **Dialogue session**(Redis `dialog:session:<id>`,TTL 30min):存完整 rounds[],generate 触发后
   `del(dialogueKey)` 一次性消费。

8. **audioBase64 patch v3**:`POST /api/story/dialogue/:id/turn` 支持二选一字段,同时传则
   audioBase64 胜出,内部调 `asr.transcribeBuffer` → 得 text → 走原对话流程;response 增加
   `recognizedText` 字段(仅 audioBase64 路径返回)。ASR 失败 → `30011 ASR_FAILED`。

9. **路由注册顺序**:所有 9 个 story 接口集中在 `routes/story.js`(Fastify 路由树 literal
   `/api/story/list` 自动优先于 `/api/story/:id`,无需拆文件)。

10. **双 token 路由**:`GET /api/story/:id`、`POST /api/story/:id/favorite`、
    `DELETE /api/story/:id`、`GET /api/story/list` 接受 parent+device,
    device 只能看自己 deviceId 名下故事,parent 只能看自己 children 名下故事。
    其他人的 storyId → `30007 STORY_NOT_FOUND`(不暴露存在性)。

11. **Mock 模式**:`USE_MOCK_AI=1` 或相关 API key 未配置时,所有上游服务走确定性 mock,
    smoke 可离线跑。真实 key 存在时自动禁用 mock(防止 prod 降级)。TTS mock 输出
    `https://mock.wonderbear.app/tts/<16-char sha256>.mp3`,图片 mock 编码 seed+pageNum+provider。

**Redis key 布局**(批次 4 新增):

```
dialog:session:<dialogueId>              JSON,TTL 1800s  (rounds[] + summary)
rate:story-gen:<deviceId>:<YYYY-MM-DD>   INT, TTL 86400s (日限计数)
rate:tts:<deviceId>:<hour-bucket>        INT, TTL 3600s  (TTS 50/小时限流)
```

**错误码触发一览**:

| 场景 | code | 备注 |
|---|---|---|
| 无 Bearer / 过期 | 10001 | |
| parent token 访问 /dialogue/start | 10006 | device 专属接口 |
| childId 不在 parent 名下 | 30009 | |
| 对话超过 totalRounds | 30012 | age≤4:5 轮 / ≥5:7 轮 |
| 内容安全 level=blocked | 30006 | 同步写 ContentAlert |
| storiesLeft=0 且 free 档 | 30004 | `details.storiesLeft:0` + actions 升级 |
| 日限超 free=2 / monthly=10 / yearly=20 | 30005 | `details.plan/limit/used` |
| ASR 失败 / 空音频 | 90002 | Whisper 失败走 30011 |
| `status !== 'completed'` 访问 `/api/story/:id` | 30008 | `details.status/stage` |
| 别家故事 / 不存在 | 30007 | 不区分两种情况(防枚举) |
| 全 3 路生图挂 | 30002 | `ImageGenLog` 保留每次尝试 |

---

### 典型接口示例

#### 7.2 `POST /api/story/dialogue/start`

**curl**:
```bash
curl -s -X POST http://localhost:3000/api/story/dialogue/start \
  -H "Authorization: Bearer <deviceToken>" \
  -H "Content-Type: application/json" \
  -d '{"childId":"cm_abc123","targetLang":"zh","learningLang":"en"}' | jq
```

**Response 200(成功)**:
```json
{
  "code": 0,
  "data": {
    "dialogueId": "dlg_lw2qx9_a1b2c3",
    "roundCount": 7,
    "firstQuestion": {
      "text": "今晚故事的主角是谁呀?",
      "textLearning": "Who is the hero of tonight's story?",
      "ttsUrl": null
    }
  },
  "requestId": "req_..."
}
```

#### 7.3 `POST /api/story/dialogue/:id/turn` — 文本路径

**curl**:
```bash
curl -s -X POST http://localhost:3000/api/story/dialogue/dlg_lw2qx9_a1b2c3/turn \
  -H "Authorization: Bearer <deviceToken>" \
  -H "Content-Type: application/json" \
  -d '{"round":1,"userInput":"一只小狐狸","locale":"zh"}' | jq
```

**Response 200(非最后一轮)**:
```json
{
  "code": 0,
  "data": {
    "done": false,
    "nextQuestion": {
      "round": 2,
      "text": "他住在什么样的地方?",
      "textLearning": "Where does the hero live?",
      "ttsUrl": null
    },
    "summary": null,
    "safetyLevel": "ok",
    "safetyReplacement": null
  },
  "requestId": "req_..."
}
```

#### 7.3 `POST /api/story/dialogue/:id/turn` — audioBase64 路径(patch v3)

**Request body**:
```json
{
  "round": 1,
  "audioBase64": "<Base64-encoded MP3/WAV/OGG bytes>",
  "audioMimeType": "audio/mpeg",
  "locale": "zh"
}
```

**Response 200**(增加 `recognizedText`):
```json
{
  "code": 0,
  "data": {
    "done": false,
    "nextQuestion": { "round": 2, "text": "...", "textLearning": null, "ttsUrl": null },
    "summary": null,
    "safetyLevel": "ok",
    "safetyReplacement": null,
    "recognizedText": "小狐狸和小女孩在阳光下的草地上玩耍。"
  },
  "requestId": "req_..."
}
```

**Response 200**(内容安全 blocked):
```json
{
  "code": 30006,
  "message": "熊熊不太明白这个故事哦,换个话题吧",
  "messageEn": "Let's try a different story",
  "messagePl": "Spróbujmy innej historii",
  "messageRo": "Să încercăm o poveste diferită",
  "requestId": "req_...",
  "details": {
    "safetyReplacement": "熊熊不太明白这个故事哦,换个话题吧。"
  }
}
```

#### 7.4 `POST /api/story/generate`

**curl**:
```bash
curl -s -i -X POST http://localhost:3000/api/story/generate \
  -H "Authorization: Bearer <deviceToken>" \
  -H "Content-Type: application/json" \
  -d '{"dialogueId":"dlg_lw2qx9_a1b2c3","childId":"cm_abc123"}'
```

**Response 202**:
```json
{
  "code": 0,
  "data": {
    "storyId": "sty_lw2qxa_xyz789",
    "status": "queued",
    "estimatedDurationSec": 75,
    "priority": "normal"
  },
  "requestId": "req_..."
}
```

**Response 200(额度耗尽)**:
```json
{
  "code": 30004,
  "message": "故事额度用完了,订阅解锁无限故事",
  "messageEn": "Free quota exhausted, subscribe for unlimited",
  "requestId": "req_...",
  "details": { "storiesLeft": 0, "plan": "free" },
  "actions": [ { "label": "升级订阅", "labelEn": "Upgrade", "url": "/subscribe" } ]
}
```

**Response 200(日限耗尽)**:
```json
{
  "code": 30005,
  "message": "今天的生成次数用完了,明天再试吧",
  "messageEn": "Daily limit reached, try again tomorrow",
  "requestId": "req_...",
  "details": { "plan": "free", "limit": 2, "used": 2 }
}
```

#### 7.5 `GET /api/story/:id/status`

**curl**:
```bash
curl -s http://localhost:3000/api/story/sty_lw2qxa_xyz789/status \
  -H "Authorization: Bearer <deviceToken>" | jq
```

**Response 200(生成中)**:
```json
{
  "code": 0,
  "data": {
    "storyId": "sty_lw2qxa_xyz789",
    "status": "generating",
    "progress": { "stage": "image", "pagesGenerated": 7, "totalPages": 12, "percent": 58 },
    "error": null,
    "completedAt": null
  },
  "requestId": "req_..."
}
```

**Response 200(完成)**:
```json
{
  "code": 0,
  "data": {
    "storyId": "sty_lw2qxa_xyz789",
    "status": "completed",
    "progress": { "stage": "done", "pagesGenerated": 12, "totalPages": 12, "percent": 100 },
    "error": null,
    "completedAt": "2026-04-23T08:12:45.123Z"
  },
  "requestId": "req_..."
}
```

**Response 200(失败)**:
```json
{
  "code": 0,
  "data": {
    "storyId": "sty_lw2qxa_xyz789",
    "status": "failed",
    "progress": { "stage": "image", "pagesGenerated": 0, "totalPages": 12, "percent": 0 },
    "error": { "code": 30002, "message": "Image generation unavailable", "retriable": true },
    "completedAt": null
  },
  "requestId": "req_..."
}
```

#### 7.6 `GET /api/story/:id`

**curl**(device token):
```bash
curl -s http://localhost:3000/api/story/sty_lw2qxa_xyz789 \
  -H "Authorization: Bearer <deviceToken>" | jq
```

**Response 200**(completed;以 device token 请求时包含 `downloaded`):
```json
{
  "code": 0,
  "data": {
    "story": {
      "id": "sty_lw2qxa_xyz789",
      "childId": "cm_abc123",
      "title": "草地上的小熊故事",
      "titleLearning": null,
      "coverUrl": "mock://placeholder/cover/happy.webp",
      "coverUrlHd": "mock://placeholder/cover/happy.hd.png",
      "pages": [
        {
          "pageNum": 1,
          "imageUrl": "mock://placeholder/page/happy.webp",
          "imageUrlHd": "mock://placeholder/page/happy.hd.png",
          "text": "第 1 页,小朋友在草地上发现了一个新的奇迹。",
          "textLearning": "On page 1, our little friend discovers a new wonder in the meadow.",
          "ttsUrl": "mock://tts/abc12345def.mp3",
          "ttsUrlLearning": "mock://tts/ef56gh78ij.mp3",
          "durationMs": 800
        }
      ],
      "dialogue": {
        "summary": { "mainCharacter": "小狐狸", "scene": "草地", "conflict": "..." },
        "rounds": [ { "q": "round 1", "a": "一只小狐狸" } ]
      },
      "metadata": { "primaryLang": "zh", "learningLang": "en", "provider": "mock" },
      "status": "completed",
      "isPublic": false,
      "favorited": false,
      "playCount": 0,
      "downloaded": false,
      "createdAt": "2026-04-23T08:11:00.000Z",
      "completedAt": "2026-04-23T08:12:45.123Z"
    }
  },
  "requestId": "req_..."
}
```

以 parent token 请求时 `story` 字段不含 `downloaded`。

#### 7.7 `GET /api/story/list`

**curl**(按最新排序,默认 limit=20):
```bash
curl -s "http://localhost:3000/api/story/list?sort=newest&onlyFavorited=true" \
  -H "Authorization: Bearer <parentToken>" | jq
```

**Response 200**:
```json
{
  "code": 0,
  "data": {
    "items": [
      {
        "id": "sty_lw2qxa_xyz789",
        "title": "草地上的小熊故事",
        "coverUrl": "mock://placeholder/cover/happy.webp",
        "createdAt": "2026-04-23T08:11:00.000Z",
        "playCount": 0,
        "favorited": true,
        "primaryLang": "zh"
      }
    ],
    "nextCursor": null,
    "total": 1
  },
  "requestId": "req_..."
}
```

#### 7.8 `POST /api/story/:id/favorite`

```bash
curl -s -X POST http://localhost:3000/api/story/sty_.../favorite \
  -H "Authorization: Bearer <deviceToken|parentToken>" \
  -H "Content-Type: application/json" \
  -d '{"favorited":true}'
```

```json
{ "code": 0, "data": { "storyId": "sty_...", "favorited": true }, "requestId": "..." }
```

#### 7.9 `DELETE /api/story/:id`

```bash
curl -s -X DELETE http://localhost:3000/api/story/sty_... \
  -H "Authorization: Bearer <deviceToken|parentToken>"
```

```json
{ "code": 0, "data": { "deleted": true }, "requestId": "..." }
```

#### 7.10 `POST /api/story/:id/play-stat`

```bash
curl -s -X POST http://localhost:3000/api/story/sty_.../play-stat \
  -H "Authorization: Bearer <deviceToken>" \
  -H "Content-Type: application/json" \
  -d '{"event":"complete","timestamp":"2026-04-23T08:20:00.000Z"}'
```

```json
{ "code": 0, "data": null, "requestId": "..." }
```

`event: 'complete'` 触发 `Story.playCount += 1`。所有 event 同步写 `TelemetryEvent` 行
(type=`story_played`)。

---

#### 8.1 `POST /api/tts/synthesize`(50/小时/设备)

```bash
curl -s -X POST http://localhost:3000/api/tts/synthesize \
  -H "Authorization: Bearer $DEV_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"从前,有一只小熊...","lang":"zh","speed":1.0}'
```

```json
{
  "code": 0,
  "data": {
    "audioUrl": "https://mock.wonderbear.app/tts/4a7e2b9d1f0c3a6e.mp3",
    "durationMs": 1600,
    "cached": false
  },
  "requestId": "..."
}
```

相同 `text+lang+voiceId+speed` 第二次调用 `cached: true`(sha256 内存缓存)。
`text` > 500 字符 → `90002`;`speed` 超出 `[0.7, 1.3]` → `90002`;限流超 50/小时 → `90003 RATE_LIMITED`(`details.limit=50 windowSeconds=3600`)。

#### 8.2 `GET /api/tts/voices`

```json
{
  "code": 0,
  "data": {
    "voices": [
      { "id": "voice_default_en", "lang": "en", "name": "Warm Narrator (EN)", "gender": "female" },
      { "id": "voice_default_zh", "lang": "zh", "name": "暖声旁白",            "gender": "female" },
      { "id": "voice_default_pl", "lang": "pl", "name": "Ciepła Narratorka",  "gender": "female" },
      { "id": "voice_default_ro", "lang": "ro", "name": "Naratoare Caldă",    "gender": "female" }
    ]
  },
  "requestId": "..."
}
```

---

### 批次 4 对 TV / H5 的联调检查清单

1. **dev-mode**:未配 `OPENAI_API_KEY / GEMINI_API_KEY / FAL_KEY / ELEVENLABS_API_KEY` 时,
   `llm/imageGen/tts/asr` 全部返回 `mock://` 占位符或 canned JSON;TV 能拿到完整 12 页故事 shape,
   只是图/声走占位。联调时先用 mock 跑通消息流,再切真 key 跑 `verify-e2e.sh`(批次 4 扩展中)。
2. **prompt 风格后缀**:生图时 `IMAGE_STYLE_SUFFIX`(`.env`)优先于代码默认值。
   如果创始人在出图看到"发灰/纸感"再次回归,检查 .env 是否漂移到 v7.0 旧版。
3. **audioBase64 与 /api/asr/upload 二选一**:批次 4 保留 `/api/asr/upload` 不动(批次 6 扩);
   dialogue 内嵌 ASR 路径省一次往返,TV 端推荐直接走 base64。
4. **双 token 读 story/list**:device token 默认按 `device.activeChildId` 过滤;
   parent token 默认按 `parent.children` 全量聚合;`childId` query 可显式收窄。
5. **生成超时**:TV 端轮询 `/status` 每 2 秒,120 秒未 `completed` → UI 切文案并给"继续等 / 放弃"。
   `DELETE /api/story/:id` 可清理进行中的任务(job 不真中断,但 Story 行删除)。
6. **收藏 / 删除路径双 token**:parent H5 和 TV 家长入口都能改;server 侧用 auth.type + 归属关系校验。

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
