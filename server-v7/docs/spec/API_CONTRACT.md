# WonderBear v7 · API 接口契约规范

> **这是三个开发窗口(server-v7 / H5 / TV HTML)的唯一权威接口契约**
> 字段名、类型、JSON 结构、错误码以本文件为准
> v7 文档 `6_API接口功能清单.md` 是业务描述,本文件是**技术合同**
>
> **创建时间**:2026-04-21
> **版本**:v1.0
> **Phase 1 MVP 范围**:~40 个核心接口
> **维护规则**:任何一方发现歧义或缺漏,先发消息给创始人,创始人定夺后本文件追加,三边同步

---

## 目录

- [一、通用约定](#一通用约定)
- [二、错误码完整表](#二错误码完整表)
- [三、健康检查](#三健康检查-apihealth)
- [四、认证模块](#四认证模块-apiauth)
- [五、设备模块](#五设备模块-apidevice)
- [六、孩子档案](#六孩子档案-apichild)
- [七、故事模块](#七故事模块-apistory)
- [八、TTS / ASR](#八tts--asr)
- [九、订阅 + 支付](#九订阅--支付)
- [十、PDF 导出](#十pdf-导出)
- [十一、OEM / OTA / 遥测](#十一oem--ota--遥测)
- [十二、开发工具](#十二开发工具-apidev)
- [十三、类型别名总表](#十三类型别名总表)
- [十四、状态同步协议](#十四状态同步协议)

---

## 一、通用约定

### 1.1 协议和基址

- 协议:**HTTPS**(生产),HTTP(开发)
- Base URL:
  - Dev: `http://localhost:3000`
  - Prod: `https://api.wonderbear.app`
- 所有路径都带 `/api` 前缀,例如 `POST https://api.wonderbear.app/api/auth/send-code`
- 编码:UTF-8
- Content-Type: `application/json`(除 ASR 上传是 `multipart/form-data`)

### 1.2 统一响应格式

**所有 HTTP 200 响应 body 都遵循下列结构**(错误通过 `code !== 0` 表达,不用 4xx/5xx 状态码区分业务错误):

#### 成功

```json
{
  "code": 0,
  "data": {},
  "requestId": "req_abc123"
}
```

字段说明:
- `code: 0` — 成功
- `data: object` — 业务数据,具体结构见每个接口的 Response 定义
- `requestId: string` — 服务端生成的请求唯一标识,格式 `req_<12 位 nanoid>`,客户端遇错时附上便于排查

#### 失败

```json
{
  "code": 30004,
  "message": "这周的故事额度用完了",
  "messageEn": "Weekly story quota used up",
  "messagePl": "...",
  "messageRo": "...",
  "requestId": "req_abc123",
  "details": { "storiesLeft": 0 },
  "actions": [
    { "label": "升级订阅", "labelEn": "Upgrade", "url": "/subscribe" }
  ]
}
```

字段说明:
- `code: number` — 业务错误码,5 位(见 §二)
- `message`, `messageEn`, `messagePl`, `messageRo` — 多语言用户可见消息。**三种情况**:
  - 服务端按 request body 的 `locale` 字段返回对应语言到 `message`,其他三种语言也一并返回(前端可能用不到,但保留灵活性)
  - 如果请求没有 `locale`,`message` 是英语
  - 开发工具类错误(9xxxx)只返回 `message`(英语),不做多语言
- `details?: object` — 可选,额外上下文(如剩余额度、重试时间等)
- `actions?: Action[]` — 可选,引导用户的下一步操作按钮

`Action` 类型:
```ts
interface Action {
  label: string;          // 中文
  labelEn: string;        // 英文
  labelPl?: string;
  labelRo?: string;
  url: string;            // H5 相对路径或绝对 URL
  kind?: 'primary' | 'secondary' | 'danger';
}
```

#### HTTP 状态码使用规则

| HTTP Code | 何时使用 |
|---|---|
| **200** | 业务成功**或**业务失败(`code !== 0`) — **99% 的情况** |
| 400 | 请求 body 连 JSON 都解析不了 / schema 校验彻底失败(Fastify 自动返回) |
| 401 | Token 彻底无效/缺失(走 Fastify jwt 中间件) |
| 500 | 未捕获的服务端异常(兜底,正常不应该出现) |
| 502 | 上游依赖(OpenAI/Gemini/FAL/Stripe 等)返回异常 |

**业务层面的"无权限"、"额度不够"、"资源不存在"一律用 200 + `code !== 0`**,便于前端统一拦截器处理。

### 1.3 鉴权

- Header:`Authorization: Bearer <token>`
- Token 三种,payload 通过 `type` 字段区分:

```ts
interface JwtPayload {
  sub: string;                            // deviceId | parentId | sellerId
  type: 'device' | 'parent' | 'seller';
  iat: number;                            // 签发时间戳(秒)
  exp: number;                            // 过期时间戳(秒)
}
```

| Token 类型 | TTL | 使用方 | 签发接口 |
|---|---|---|---|
| `device` | 30 天 | TV 端 Shell + WebView | `POST /api/device/register` |
| `parent` | 7 天 | 家长 H5 | `POST /api/auth/login-code` / `login-password` / `register` |
| `seller` | 1 天 | 经销商 Console | `POST /api/seller/login` |

**Token 被后端用错类型使用** → `code: 10006`(见 §二)

**Token 过期** → `code: 10001`,前端应该自动调 `/api/auth/refresh` 或 `/api/device/refresh-token`,刷新失败跳登录页

### 1.4 Request ID

- 客户端**可选**在 header 传 `X-Request-Id: <任意字符串>`,服务端会把它记录到日志
- 服务端无论客户端传不传,都在响应 body 的 `requestId` 字段返回唯一 ID
- Response header 也会附带 `X-Request-Id` 方便 CDN/反代日志串联

### 1.5 幂等性

- 所有 `GET` 天然幂等
- 有副作用的 `POST` 接口,需要幂等性时客户端传 `Idempotency-Key: <uuid>` header,服务端 5 分钟内同 key 同 body 直接返回上次结果
- 支付类接口(Stripe/PayPal)依赖对方平台的幂等,不在我们这一层处理

### 1.6 速率限制

- 未登录请求:60 次/分钟 per IP
- 已登录请求:300 次/分钟 per 用户(parent/device/seller)
- 故事生成:2 次/天(free)/ 10 次/天(monthly)/ 20 次/天(yearly) per device
- 验证码发送:3 次/小时 per email,60 秒冷却

超限返回:

```json
{
  "code": 90003,
  "message": "请求太频繁了,请稍后再试",
  "requestId": "...",
  "details": { "retryAfterSeconds": 45, "limit": 60, "windowSeconds": 60 }
}
```

响应 header:
- `X-RateLimit-Limit: 60`
- `X-RateLimit-Remaining: 0`
- `X-RateLimit-Reset: 1745234567` (UTC 秒)
- `Retry-After: 45`

### 1.7 字段命名和类型约定

- **字段命名**:camelCase(`storiesLeft` 而非 `stories_left`)
- **时间**:ISO 8601 字符串,UTC(`"2026-04-21T13:45:22.000Z"`)——**不用 unix 时间戳**,除非特殊说明(如 rate limit reset)
- **金额**:用分(cents)存,`priceEurCents: 499` 表示 €4.99 — 避免浮点精度问题
- **ID**:所有主键用 cuid 格式字符串(`"ckxl2..."` 或 `"cm..."`),deviceId 可由硬件生成(8-128 字符字母/数字/`_`/`-`)
- **可选字段**:TypeScript 里用 `field?: T`,JSON 里**要么返回 `null` 要么不返回 key** — 后端实现统一用 `null`(H5/TV 两边 `obj.field ?? defaultValue` 就能同时处理两种情况)
- **枚举**:字符串字面量,低位下划线分隔(`"activated_unbound"`)
- **布尔**:永远是 `true/false`,不用 0/1

### 1.8 分页

列表接口统一用 cursor 分页(避免 offset 在并发写入下错漏):

**请求**:
```ts
interface PaginationRequest {
  cursor?: string;   // 上次返回的 nextCursor
  limit?: number;    // 默认 20,最大 100
}
```

**响应 data 里**:
```ts
interface PaginatedData<T> {
  items: T[];
  nextCursor: string | null;  // null 表示已到最后一页
  total?: number;              // 可选,有些接口返回总数(性能损耗,按需)
}
```

---

## 二、错误码完整表

**规则**:5 位数字,第 1 位表示分类。分类内没写满的码号预留,允许后续扩展。

### 2.1 1xxxx — 认证 / 授权

| Code | 常量名 | HTTP | message(zh) | messageEn | 触发场景 |
|---|---|---|---|---|---|
| 10001 | `TOKEN_EXPIRED` | 200 | 登录已过期,请重新登录 | Session expired, please log in again | JWT 已过期 |
| 10002 | `VERIFY_CODE_INVALID` | 200 | 验证码错误 | Verification code invalid | 6 位码和 Redis 不匹配 |
| 10003 | `EMAIL_INVALID` | 200 | 邮箱格式不正确 | Invalid email format | 邮箱不符合 RFC5322 |
| 10004 | `VERIFY_CODE_EXPIRED` | 200 | 验证码已过期,请重新发送 | Verification code expired | 5 分钟有效期过 |
| 10005 | `EMAIL_ALREADY_REGISTERED` | 200 | 邮箱已注册,请直接登录 | Email already registered, please log in | register 时邮箱已存在 |
| 10006 | `TOKEN_TYPE_MISMATCH` | 200 | 无效的凭据类型 | Invalid credential type | 用 device token 访问 parent 接口等 |
| 10007 | `PASSWORD_WRONG` | 200 | 邮箱或密码错误 | Wrong email or password | 密码登录失败(**邮箱不存在也返回此码,防枚举**) |
| 10008 | `ACCOUNT_LOCKED` | 200 | 登录失败次数过多,请 15 分钟后重试或用验证码登录 | Too many failed attempts, try again in 15 minutes or use code login | 5 次密码错误 |
| 10009 | `PASSWORD_TOO_WEAK` | 200 | 密码至少 8 位,包含字母和数字 | Password must be at least 8 chars with letter and number | 注册时密码校验 |
| 10010 | `TOKEN_REVOKED` | 200 | 登录已失效,请重新登录 | Session revoked, please log in again | token 在 Redis 黑名单(已登出) |

### 2.2 2xxxx — 设备 / 激活

| Code | 常量名 | HTTP | message(zh) | messageEn | 触发场景 |
|---|---|---|---|---|---|
| 20001 | `DEVICE_NOT_ACTIVATED` | 200 | 设备未激活,请用激活码激活 | Device not activated | Device token 但状态未 activated |
| 20002 | `ACTIVATION_CODE_INVALID` | 200 | 激活码无效 | Activation code invalid | 码不存在或校验位错 |
| 20003 | `DEVICE_BOUND_TO_OTHER` | 200 | 该设备已绑定其他账户 | Device already bound to another account | 家长绑定被占设备 |
| 20004 | `ACTIVATION_CODE_USED` | 200 | 激活码已被使用 | Activation code already used | ActivationCode.status='used' 但被新设备尝试 |
| 20005 | `DEVICE_NOT_FOUND` | 200 | 设备不存在 | Device not found | deviceId 查不到 |
| 20006 | `DEVICE_DISABLED` | 200 | 设备已被禁用,请联系客服 | Device disabled, contact support | 设备状态=disabled |
| 20007 | `DEVICE_ID_FORMAT_INVALID` | 200 | 设备 ID 格式错误 | Invalid deviceId format | 8-128 字符正则不通过 |
| 20008 | `MAX_DEVICES_REACHED` | 200 | 账户最多绑定 4 台设备 | Account device limit reached (max 4) | 绑定超限 |

### 2.3 3xxxx — 故事 / 内容

| Code | 常量名 | HTTP | message(zh) | messageEn | 触发场景 |
|---|---|---|---|---|---|
| 30001 | `STORY_GEN_FAILED` | 200 | 故事生成失败,请重试 | Story generation failed, please retry | LLM / 生图 3 次重试后仍失败 |
| 30002 | `IMAGE_GEN_ALL_FAILED` | 200 | 插图生成失败,请稍后再试 | Image generation unavailable | 三路降级链全挂 |
| 30003 | `TTS_FAILED` | 200 | 语音合成失败 | TTS synthesis failed | ElevenLabs 故障 |
| 30004 | `QUOTA_EXHAUSTED` | 200 | 故事额度用完了,订阅解锁无限故事 | Free quota exhausted, subscribe for unlimited | storiesLeft=0 且 free 档 |
| 30005 | `DAILY_LIMIT_REACHED` | 200 | 今天的生成次数用完了,明天再试吧 | Daily limit reached, try again tomorrow | 按档位日限 2/10/20 超出 |
| 30006 | `CONTENT_SAFETY_BLOCKED` | 200 | 熊熊不太明白这个故事哦,换个话题吧 | Let's try a different story | 三级过滤 Level 3 拦截 |
| 30007 | `STORY_NOT_FOUND` | 200 | 故事不存在 | Story not found | storyId 查不到 |
| 30008 | `STORY_NOT_READY` | 200 | 故事还在生成中 | Story still generating | status ≠ completed 时获取完整故事 |
| 30009 | `CHILD_NOT_FOUND` | 200 | 孩子不存在 | Child not found | |
| 30010 | `MAX_CHILDREN_REACHED` | 200 | 最多添加 4 个孩子 | Max 4 children allowed | 第 5 个 |
| 30011 | `ASR_FAILED` | 200 | 没听清楚,再说一次好吗? | Could not understand, please try again | Google Speech 失败或静音 |
| 30012 | `DIALOGUE_ROUND_OVERFLOW` | 200 | 对话轮次已满 | Dialogue round limit reached | 第 8 轮及以后 |

### 2.4 4xxxx — 支付 / 订阅

| Code | 常量名 | HTTP | message(zh) | messageEn | 触发场景 |
|---|---|---|---|---|---|
| 40001 | `STRIPE_PAYMENT_FAILED` | 200 | 支付失败,请检查卡信息 | Payment failed, check card details | Stripe 返回 card_declined 等 |
| 40002 | `PAYPAL_PAYMENT_FAILED` | 200 | PayPal 支付失败 | PayPal payment failed | PayPal capture 失败 |
| 40003 | `SUBSCRIPTION_ALREADY_ACTIVE` | 200 | 已有有效订阅 | Active subscription exists | 重复订阅 |
| 40004 | `SUBSCRIPTION_NOT_FOUND` | 200 | 订阅不存在 | Subscription not found | 取消时找不到 |
| 40005 | `PDF_QUOTA_EXHAUSTED` | 200 | 本月 PDF 导出次数用完了 | Monthly PDF export quota used | pdfExportsLeft=0 |
| 40006 | `PDF_LOCKED_FOR_FREE` | 200 | 订阅后可导出 PDF 绘本 | Subscribe to export PDF albums | 免费用户导 PDF |
| 40007 | `WEBHOOK_SIGNATURE_INVALID` | 200 | — | Invalid webhook signature | Stripe/PayPal webhook 签名校验失败(仅内部) |

### 2.5 5xxxx — 服务端 / 上游

| Code | 常量名 | HTTP | message(zh) | messageEn | 触发场景 |
|---|---|---|---|---|---|
| 50001 | `INTERNAL_ERROR` | 200 | 服务暂时不可用,请稍后重试 | Service temporarily unavailable | 未捕获异常兜底 |
| 50002 | `UPSTREAM_UNAVAILABLE` | 200 | 服务暂时不可用,请稍后重试 | Upstream service unavailable | OpenAI/Gemini/FAL/Stripe 全挂 |
| 50003 | `DB_UNAVAILABLE` | 200 | 服务暂时不可用 | Database unavailable | Prisma 连接失败 |
| 50004 | `REDIS_UNAVAILABLE` | 200 | 服务暂时不可用 | Redis unavailable | Redis 挂 |
| 50005 | `EMAIL_SEND_FAILED` | 200 | 邮件发送失败,请稍后重试 | Email send failed | Resend 挂 |

### 2.6 9xxxx — 客户端请求错误

| Code | 常量名 | HTTP | message(zh) | messageEn | 触发场景 |
|---|---|---|---|---|---|
| 90001 | `PARAM_MISSING` | 200 | 参数缺失 | Missing parameter | required 字段没传 |
| 90002 | `PARAM_INVALID` | 200 | 参数格式错误 | Invalid parameter | 类型/格式不对 |
| 90003 | `RATE_LIMITED` | 200 | 请求太频繁了,请稍后再试 | Rate limit exceeded | 超速 |
| 90004 | `IDEMPOTENCY_CONFLICT` | 200 | 操作冲突,请重试 | Idempotency conflict | 同 key 不同 body |
| 90005 | `METHOD_NOT_ALLOWED` | 200 | 请求方法不允许 | Method not allowed | Fastify 兜底 |

---

## 三、健康检查 `/api/health`

### 3.1 `GET /api/health`

**鉴权**:无

**Response 200**(全部正常):
```json
{
  "code": 0,
  "data": {
    "status": "ok",
    "version": "1.0.0",
    "services": {
      "db": "ok",
      "redis": "ok",
      "openai": "ok",
      "gemini": "ok",
      "fal": "ok",
      "elevenlabs": "ok",
      "stripe": "ok",
      "paypal": "ok",
      "resend": "ok"
    },
    "serverTime": "2026-04-21T13:45:22.000Z"
  },
  "requestId": "req_abc123"
}
```

**Response 200**(某服务 degraded):
```json
{
  "code": 0,
  "data": {
    "status": "degraded",
    "version": "1.0.0",
    "services": {
      "db": "ok",
      "redis": "ok",
      "openai": "error",
      "gemini": "ok",
      "...": "..."
    },
    "serverTime": "..."
  },
  "requestId": "..."
}
```

**服务状态枚举**:`"ok"` | `"error"` | `"skipped"`(未配 key)

**判断逻辑**:
- db/redis 任一 error → 整体 `degraded`,返回 HTTP **503**(负载均衡探活会踢掉)
- 上游 AI/支付 error → 整体 `degraded`,但 HTTP **200**(负载均衡不踢,只是告警)
- 都 ok → HTTP 200

---

## 四、认证模块 `/api/auth`

### 4.1 `POST /api/auth/send-code`

发送邮箱验证码。

**鉴权**:无

**限流**:3 次/小时 per email,60 秒冷却

**Request**:
```ts
interface SendCodeRequest {
  email: string;              // RFC5322, 最长 254,会 trim + lowercase
  purpose: 'register' | 'login';
  locale: 'zh' | 'en' | 'pl' | 'ro';
}
```

**Response 200**:
```json
{
  "code": 0,
  "data": {
    "expiresIn": 300,
    "nextRetryAfter": 60
  },
  "requestId": "req_abc123"
}
```

```ts
interface SendCodeResponse {
  expiresIn: number;          // 验证码有效期(秒),固定 300
  nextRetryAfter: number;     // 下次可重发的秒数,固定 60
}
```

**可能的错误码**:`10003`(邮箱格式)、`90003`(冷却中,`details.nextRetryAfter` 告诉还剩多少秒)、`50005`(Resend 故障)

**服务端实现要点**:
- 6 位数字验证码(不包含字母,防混淆)
- 存 Redis key `auth:verify:${email}:${purpose}`,value=`${code}:${attemptsLeft}`,TTL 300
- 每次发送都重置 code 和 attemptsLeft=3
- Resend 模板按 `locale` 选,4 份模板预置在 `src/templates/verify-code.{zh,en,pl,ro}.html`

### 4.2 `POST /api/auth/register`

家长注册(结合设备绑定)。

**鉴权**:无

**Request**:
```ts
interface RegisterRequest {
  email: string;
  code: string;                  // 6 位验证码
  password?: string | null;      // 可选,8+ 位,留空则只能用验证码登录
  deviceId: string;              // TV 扫码时 URL 带过来
  activationCode: string;        // 同上
  locale: 'zh' | 'en' | 'pl' | 'ro';
  forceOverride?: boolean;       // 默认 false,设备已绑其他家长时要强制覆盖
}
```

**Response 200**:
```json
{
  "code": 0,
  "data": {
    "parentToken": "eyJhbGciOi...",
    "parent": {
      "id": "cm123...",
      "email": "mom@example.com",
      "locale": "pl",
      "createdAt": "2026-04-21T13:45:22.000Z",
      "activated": true
    },
    "device": {
      "id": "cm456...",
      "deviceId": "tv_gp15_abc123xyz",
      "status": "bound",
      "boundAt": "2026-04-21T13:45:22.000Z",
      "storiesLeft": 6
    }
  },
  "requestId": "..."
}
```

```ts
interface RegisterResponse {
  parentToken: string;
  parent: {
    id: string;
    email: string;
    locale: Locale;
    createdAt: string;
    activated: boolean;            // true 表示已成功绑定设备,有 6 本额度
  };
  device: {
    id: string;                     // DB 主键 cuid
    deviceId: string;               // 硬件 ID
    status: DeviceStatus;
    boundAt: string;
    storiesLeft: number;            // 免费额度余量
  };
}
```

**可能的错误码**:`10002`(验证码错)、`10004`(过期)、`10005`(邮箱已注册)、`10009`(密码弱)、`20002`(激活码错)、`20003`(设备已被他人绑且 forceOverride=false)、`20004`(激活码已用于其他设备)

### 4.3 `POST /api/auth/login-code`

验证码登录。

**Request**:
```ts
interface LoginCodeRequest {
  email: string;
  code: string;
}
```

**Response 200**:
```ts
interface LoginResponse {
  parentToken: string;
  parent: {
    id: string;
    email: string;
    locale: Locale;
    activated: boolean;
    subscription: SubscriptionSummary | null;
  };
}

interface SubscriptionSummary {
  plan: 'free' | 'monthly' | 'yearly';
  status: 'free' | 'active' | 'canceled' | 'expired';
  expiresAt: string | null;
  pdfExportsLeft: number;
}
```

**可能错误**:`10002`、`10004`、`10007`(邮箱不存在,**返回密码错误码防枚举**)

### 4.4 `POST /api/auth/login-password`

密码登录。

**限流**:15 分钟内 5 次失败 → `code: 10008` 锁定

**Request**:
```ts
interface LoginPasswordRequest {
  email: string;
  password: string;
}
```

**Response 200**:同 `LoginCodeResponse`

**可能错误**:`10007`(统一错码,防枚举)、`10008`(锁定,`details.unlockAt` 给解锁时间)

### 4.5 `POST /api/auth/refresh`

刷新 Token。

**鉴权**:需旧 Token(未过期状态)

**Request**:空

**Response 200**:
```ts
interface RefreshResponse {
  parentToken: string;
  expiresAt: string;   // 新 token 过期时间
}
```

**可能错误**:`10001`(旧 token 已过期,只能重新登录)

### 4.6 `POST /api/auth/logout`

登出。

**鉴权**:parentToken

**Request**:空

**Response 200**:
```json
{ "code": 0, "data": null, "requestId": "..." }
```

**服务端行为**:Token 加入 Redis 黑名单 `auth:blacklist:${token_hash}`,TTL = 剩余有效期

---

## 五、设备模块 `/api/device`

### 5.1 `POST /api/device/register`

TV 首次启动时调,带激活码完成激活。

**鉴权**:无(首次注册用激活码作为凭据)

**Request**:
```ts
interface DeviceRegisterRequest {
  deviceId: string;              // 硬件生成的唯一 ID,8-128 字符
  activationCode: string;        // 预装的激活码,6-12 位字母数字
  hwFingerprint?: string;        // 硬件指纹(可选,用于防伪)
  model: 'GP15' | string;
  firmwareVer: string;           // 如 "1.0.0"
  osVersion: string;             // 如 "Android 11"
  batchCode?: string | null;     // 批次号(可选)
}
```

**Response 200**:
```ts
interface DeviceRegisterResponse {
  deviceToken: string;
  device: {
    id: string;                         // DB 主键
    deviceId: string;
    status: DeviceStatus;                // 见 §十三
    boundAt: string | null;              // 未绑家长时为 null
    storiesLeft: number;                 // 6(首次激活)或更少(已用过)
  };
  oemConfig: OemConfig | null;           // 见 §十一
}
```

**可能错误**:`20002`(激活码无效)、`20004`(激活码已被其他设备用)、`20007`(deviceId 格式错)、`20006`(设备状态 disabled)

**业务规则**:
- 激活码第一次使用 → ActivationCode.status 从 `issued` → `activated`,设置 `usedByDeviceId`
- 同一 deviceId 再次调(比如 TV 重置)→ 返回 fresh token,status 不变
- 激活后设备状态 = `activated_unbound`(未绑家长)或 `bound`(已绑)

### 5.2 `GET /api/device/status`

TV 端轮询激活 / 绑定状态。

**鉴权**:deviceToken

**限流**:**不限**(TV 激活页每 3 秒调一次)

**Request**:无

**Response 200**:
```ts
interface DeviceStatusResponse {
  status: DeviceStatus;
  parent: {
    id: string;
    email: string;
    locale: Locale;
  } | null;
  activeChild: Child | null;             // 见 §六
}
```

**TV 端轮询策略**:
- 激活页 / 绑定等待页:每 3 秒
- 首页:每 60 秒
- 当 `status` 变化时触发相应跳转(unbound → bound 跳进首页)

### 5.3 `POST /api/device/bind`

家长 H5 绑定设备。

**鉴权**:parentToken

**Request**:
```ts
interface DeviceBindRequest {
  deviceId: string;
  activationCode: string;
  forceOverride?: boolean;       // 默认 false
}
```

**Response 200**:
```ts
interface DeviceBindResponse {
  device: {
    id: string;
    deviceId: string;
    status: 'bound';
    boundAt: string;
    storiesLeft: number;
    oemConfig: OemConfig | null;
  };
  activatedQuota: boolean;       // true 表示这是首次绑定,激活了 6 本额度
}
```

**可能错误**:`20002`、`20003`(已被他人绑定,需 `forceOverride=true`)、`20008`(家长已绑满 4 台)

**业务规则**:
- Device.status=`activated_unbound` 的设备首次绑家长:激活 6 本额度(`activatedQuota=true`)
- Device.status=`unbound_transferable`(从其他家长解绑过来)的再次绑:**不重新激活**(`activatedQuota=false`),`storiesLeft` 继承原值

### 5.4 `POST /api/device/unbind`

家长 H5 解绑设备(= 转让)。

**鉴权**:parentToken

**Request**:
```ts
interface DeviceUnbindRequest {
  deviceId: string;
  confirmCode: string;            // 二次确认:密码或 6 位邮件验证码
}
```

**Response 200**:
```json
{ "code": 0, "data": { "deviceId": "...", "status": "unbound_transferable" }, "requestId": "..." }
```

**业务规则**:
- Device.parentId=null, Device.activeChildId=null, Device.status=`unbound_transferable`
- 关联的 ActivationCode.status 改为 `transferred`
- **storiesLeft 保持原值不变**(反薅羊毛)

### 5.5 `POST /api/device/heartbeat`

TV 端每 5 分钟上报状态。

**鉴权**:deviceToken

**Request**:
```ts
interface HeartbeatRequest {
  currentScreen?: string;          // 如 "home" | "story_body"
  memoryUsageMb?: number;
  firmwareVer?: string;            // 若变化了,服务端更新 Device.firmwareVer
  networkType?: 'wifi' | 'ethernet';
}
```

**Response 200**:
```ts
interface HeartbeatResponse {
  pendingCommands: PendingCommand[];        // 家长从 H5 下发的命令
  serverTime: string;
}

interface PendingCommand {
  id: string;
  type: 'reboot' | 'clear_cache' | 'unbind' | 'ota_check';
  issuedAt: string;
  expiresAt: string;
  params?: Record<string, unknown>;
}
```

TV 端拿到命令应立即执行,执行完调 `POST /api/device/ack-command/:id` 标记完成。

### 5.6 `POST /api/device/ack-command/:id`

**鉴权**:deviceToken

**Request**:
```ts
interface AckCommandRequest {
  result: 'success' | 'failed';
  error?: string;
}
```

**Response 200**:
```json
{ "code": 0, "data": null, "requestId": "..." }
```

### 5.7 `GET /api/device/active-child`

**鉴权**:deviceToken

**Response 200**:
```ts
interface ActiveChildResponse {
  activeChild: Child | null;
  allChildren: Child[];           // 家长下所有孩子(切换弹窗用)
}
```

### 5.8 `POST /api/device/active-child`

家长 H5 切换当前活跃孩子,或者 TV 端切孩子弹窗使用。

**鉴权**:parentToken **或** deviceToken

**Request**:
```ts
interface SetActiveChildRequest {
  deviceId: string;               // parentToken 调用时必传;deviceToken 调用时从 token 解析
  childId: string;
}
```

**Response 200**:
```ts
interface SetActiveChildResponse {
  activeChild: Child;
}
```

### 5.9 `POST /api/device/:id/reboot`

家长一键重启。

**鉴权**:parentToken

**Response 200**:
```ts
interface RebootResponse {
  commandId: string;
  queuedAt: string;
  willExecuteWithin: number;      // 秒,最多 5 分钟(等下次心跳)
}
```

**行为**:命令入 Redis 队列,TV 下次 heartbeat 时拉取并执行。

### 5.10 `GET /api/device/list`

家长 H5 我的设备页。

**鉴权**:parentToken

**Response 200**:
```ts
interface DeviceListResponse {
  items: DeviceSummary[];
}

interface DeviceSummary {
  id: string;
  deviceId: string;
  status: DeviceStatus;
  boundAt: string;
  lastSeenAt: string | null;
  storiesLeft: number;
  model: string;
  firmwareVer: string;
  online: boolean;                 // lastSeenAt 距今 < 10 分钟
}
```

---

## 六、孩子档案 `/api/child`

### 6.1 `POST /api/child`

创建孩子。

**鉴权**:parentToken

**Request**:
```ts
interface CreateChildRequest {
  name: string;                   // 最长 20,允许 emoji
  age: number;                    // 3-8
  gender?: 'male' | 'female' | 'prefer_not_say' | null;
  avatar: string;                 // 20 个预设中的一个,如 "avatar_cat_01"
  primaryLang: Locale;
  secondLang?: Locale | 'none';   // 学习的第二语言
  birthday?: string | null;       // ISO date "2020-05-14"
}
```

**Response 201**:
```ts
interface CreateChildResponse {
  child: Child;
}
```

**可能错误**:`30010`(已有 4 个)、`90002`(age 超范围)

### 6.2 `PATCH /api/child/:id`

更新孩子。

**鉴权**:parentToken

**Request**:同 `CreateChildRequest` 所有字段都可选

**Response 200**:
```ts
interface UpdateChildResponse {
  child: Child;
}
```

### 6.3 `DELETE /api/child/:id`

删除孩子(软删除,故事仍然保留但关联解除)。

**鉴权**:parentToken

**Response 200**:
```json
{ "code": 0, "data": { "deleted": true }, "requestId": "..." }
```

**可能错误**:`30009`

### 6.4 `GET /api/child/list`

**鉴权**:parentToken

**Response 200**:
```ts
interface ChildListResponse {
  items: Child[];
  total: number;                   // 当前孩子数(用于判断是否达到 4 上限)
  maxAllowed: 4;
}
```

### 6.5 `GET /api/child/:id`

**鉴权**:parentToken **或** deviceToken(deviceToken 只能查 activeChildId)

**Response 200**:
```ts
interface ChildDetailResponse {
  child: Child;
  storiesCount: number;            // 这个孩子的故事总数
  lastStoryAt: string | null;
}
```

---

## 六 bis、家长档案 `/api/parent`

### 6bis.1 `GET /api/parent/me`

**鉴权**:parentToken

**Response 200**:
```ts
interface ParentMeResponse {
  parent: Parent;                  // 见 §十三
  devices: DeviceSummary[];
  children: Child[];
}
```

### 6bis.2 `PATCH /api/parent/me`

修改家长自己的设置。

**鉴权**:parentToken

**Request**(所有字段可选,只更新提供的):
```ts
interface UpdateParentRequest {
  locale?: Locale;                 // UI 语言
  playBgm?: boolean;               // TV 全局 BGM 开关
  password?: string;               // 修改密码(8+ 位)
  currentPassword?: string;        // 修改密码时必传,验证旧密码
}
```

**Response 200**:
```ts
interface UpdateParentResponse {
  parent: Parent;
}
```

**可能错误**:`10007`(currentPassword 错)、`10009`(新密码弱)

---


## 七、故事模块 `/api/story`

> **这是产品的心脏**。对话、生成、播放、管理全在这里。整个链路异步化,客户端通过轮询拿状态。

### 7.1 故事生成流程概览

```
TV 端流程:
1. 用户进"创作小屋" → POST /api/story/dialogue/start   → 得到 dialogueId
2. 每轮对话       → POST /api/story/dialogue/:id/turn → 得到下一个问题
3. 对话结束      → POST /api/story/generate           → 得到 storyId (status=generating)
4. 轮询生成进度  → GET  /api/story/:id/status         → 每 2 秒,直到 status=completed
5. 拿完整故事    → GET  /api/story/:id                → 12 页 + 双语文本 + 图片 URL
6. 预取 TTS     → POST /api/tts/synthesize * 12      → 并行请求
7. 播放时上报统计 → POST /api/story/:id/play-stat     → 每页播放完
```

### 7.2 `POST /api/story/dialogue/start`

开始一轮新的故事对话。

**鉴权**:deviceToken

**Request**:
```ts
interface StartDialogueRequest {
  childId: string;                      // 当前孩子
  targetLang?: Locale;                  // 可选,默认读 child.primaryLang
  learningLang?: Locale | 'none';       // 可选,默认读 child.secondLang
}
```

**Response 200**:
```ts
interface StartDialogueResponse {
  dialogueId: string;                   // 用于后续每轮
  roundCount: 5 | 7;                     // 按年龄自适应
  firstQuestion: {
    text: string;                        // 主语言
    textLearning?: string | null;        // 学习语言(如有)
    ttsUrl?: string | null;              // 预生成的 TTS 音频 URL
  };
}
```

**业务规则**:
- 3-4 岁 → 5 轮,5-8 岁 → 7 轮
- 创建 Redis key `dialogue:${dialogueId}`,TTL 30 分钟,存累积对话
- `firstQuestion` 固定是 "今晚故事的主角是谁呀?" 的本地化版

**可能错误**:`30004`(额度)、`30005`(日限)、`30009`(childId 无效)、`30006`(内容安全,不太可能在 start)

### 7.3 `POST /api/story/dialogue/:id/turn`

推进一轮对话。**v7.2 起 (2026-04-29) 走 co-creation 协议** —— 见 `PROMPT_SPEC_v7_2.md`。

**鉴权**:deviceToken

**Request** (与 patch v3 一致, 字段不变):
```ts
interface DialogueTurnRequest {
  round: number;                        // 当前是第几轮,1-based
  userInput?: string;                   // 文本输入 (与 audioBase64 二选一)
  audioBase64?: string;                 // 音频 base64 (server 跑 ASR)
  audioMimeType?: string;               // audioBase64 提供时必传
  skipRemaining?: boolean;              // true 则提前结束(4 轮后允许)
  locale?: Locale;                      // 用于本地化兜底
}
```

**Response 200** (v7.2 扩展):
```ts
interface DialogueTurnResponse {
  done: boolean;                         // true = 对话结束 (LLM 主动 done OR 硬上限 OR empty 死循环 OR skipRemaining)
  nextQuestion: {                        // done=false 时必非空 (server 兜底保证)
    round: number;
    text: string;
    textLearning?: string | null;
    ttsUrl?: string | null;
  } | null;
  summary: {                             // done=true 时返回, 兼容 7.4 generate 输入
    mainCharacter: string;
    scene: string;
    conflict: string;
    outline?: string[];                  // v7.2: 与 storyOutline.paragraphs 同
  } | null;
  safetyLevel: 'ok' | 'warn' | 'blocked';
  safetyReplacement?: string | null;
  recognizedText?: string;               // patch v3: server-side ASR 结果回显

  // -------- v7.2 新增字段 ----------
  mode?: 'cheerleader' | 'storyteller' | null;  // server-judge 自适应模式
  lastTurnSummary?: string | null;       // ≤30 字, "child added X about Y"
  arcUpdate?: {                          // 本轮孩子贡献了哪一步骨架
    setting?: string;
    character?: string;
    goal?: string;
    obstacle?: string;
    climax?: string;
    resolution?: string;
  } | null;
  storyOutline?: {                       // done=true 时驱动 TV StoryPreviewScreen
    paragraphs: string[];                // 3-5 段, ≤60 字 / 段
  } | null;
  _provider?: string | null;             // 'gemini-v7_2' | 'default-bank' | 'mock'
}
```

**business rules** (v7.2):
- `roundCount` 是硬上限 (3-4 岁 = 5, 5-8 岁 = 7), 不是目标; LLM 可主动 `done=true` 提前结束
- 当连续 3 轮 user reply `vocabulary='empty'` 时, server 强制 `done=true` 防止死循环
- LLM Gemini retry 2 次仍失败则走 default-bank fallback, 永不返回空 `nextQuestion`
- `done=true` 时 server 必返回 `storyOutline.paragraphs` (LLM 没产或缺失走默认 outline 兜底)

**可能错误**:`30006`(blocked 时)、`30011`(ASR 文本为空或乱码)、`30012`(round > 7)

### 7.3b `POST /api/story/dialogue/:id/confirm` (v7.2 新增)

小孩在 TV `StoryPreviewScreen` 按 OK 确认 outline → 触发故事生成 pipeline。
等价于 `/api/story/generate` 但从 dialogue session 直接读取 outline + childId, TV 客户端只发一次 round-trip。

**鉴权**:deviceToken

**Request**:`{}` (空 body, dialogueId 在 path)

**Response 202** (与 7.4 同形, TV 直接复用 GenerateStoryResponse 类型):
```ts
interface DialogueConfirmResponse {
  storyId: string;
  status: 'queued';
  queuePosition?: number;
  estimatedDurationSec: number;
  priority: 'normal' | 'high';
}
```

**business rules**:
- 仅当 dialogue session `storyOutline` 已生成 (即 7.3 返回 `done=true`) 才接受;否则 90002 PARAM_INVALID
- 走与 7.4 相同的额度 / 日限 / Bull 队列逻辑
- 创建 Story row 时 metadata 标记 `provider: 'mixed'`, dialogueSummary 包含 outline.paragraphs 给后续 12 页 LLM

**可能错误**:`30001`(dialogue 未结束)、`30004`、`30005`、`30009`

### 7.4 `POST /api/story/generate`

触发故事生成(LLM + 三路降级 + TTS 预生成)。异步。

**鉴权**:deviceToken

**Request**:
```ts
interface GenerateStoryRequest {
  dialogueId: string;                   // 从对话链路过来
  childId: string;
}
```

**Response 202**(已接受,异步处理):
```ts
interface GenerateStoryResponse {
  storyId: string;
  status: 'queued';
  queuePosition?: number;                // 当前队列位置(仅队列深度 > 1 时返回)
  estimatedDurationSec: number;          // 预估总时长,60-90
  priority: 'normal' | 'high';           // yearly 用户返回 high
}
```

**业务规则**:
- 入 Bull 队列(优先队列分两个:`story:priority` 给 yearly,`story:normal` 给 free/monthly)
- 服务端开始扣额度(原子 decrement storiesLeft where > 0)**只在 LLM 第一步成功后扣**
- 记录 genCostCents 预估

**可能错误**:`30004`、`30005`、`50002`(所有上游不可用)

### 7.5 `GET /api/story/:id/status`

轮询生成进度。

**鉴权**:deviceToken

**Response 200**:
```ts
interface StoryStatusResponse {
  storyId: string;
  status: 'queued' | 'generating' | 'completed' | 'failed';
  progress: {
    stage: 'queue' | 'llm' | 'image' | 'tts' | 'assembly' | 'done';
    pagesGenerated: number;              // 0-12
    totalPages: 12;
    percent: number;                     // 0-100
  };
  error?: {
    code: number;                        // 30001 / 30002 / 30003
    message: string;
    retriable: boolean;
  } | null;
  completedAt?: string | null;
}
```

**TV 端轮询**:每 2 秒,最长 120 秒,超时当 failed 处理

### 7.6 `GET /api/story/:id`

获取完整故事。

**鉴权**:deviceToken **或** parentToken

**Response 200**:
```ts
interface StoryDetailResponse {
  story: Story;
}

interface Story {
  id: string;
  childId: string;
  title: string;                         // 主语言
  titleLearning?: string | null;
  coverUrl: string;                       // WebP, 1280×720
  coverUrlHd?: string;                    // PNG 高清(PDF 用)
  pages: StoryPage[];                     // 12 页
  dialogue: {
    summary: string;
    rounds: Array<{ q: string; a: string }>;
  };
  metadata: {
    primaryLang: Locale;
    learningLang: Locale | 'none';
    duration: number;                     // 预估播放时长(秒)
    provider: 'openai' | 'gemini' | 'fal' | 'mixed';
    createdAt: string;
  };
  status: 'completed';
  isPublic: boolean;
  favorited: boolean;
  playCount: number;
  downloaded?: boolean;                   // 仅 device token 调用时返回(TV 本地是否已下载)
}

interface StoryPage {
  pageNum: number;                        // 1-12
  imageUrl: string;                       // WebP 1280×720
  imageUrlHd: string;                     // PNG 原图(PDF 用)
  text: string;                           // 主语言正文
  textLearning?: string | null;           // 学习语言译文
  ttsUrl?: string | null;                 // 预生成的 MP3(可能为 null,客户端按需调 /api/tts)
  ttsUrlLearning?: string | null;
  durationMs?: number | null;             // TTS 时长,用于翻页同步
}
```

**可能错误**:`30007`、`30008`(还在生成中)

### 7.7 `GET /api/story/list`

列出孩子的故事。

**鉴权**:deviceToken 或 parentToken

**Query**:
```ts
interface StoryListQuery {
  childId?: string;                      // deviceToken 时可省略(用当前 activeChild)
  cursor?: string;
  limit?: number;                        // 默认 20
  sort?: 'newest' | 'most_played' | 'favorited';
  onlyFavorited?: boolean;
}
```

**Response 200**:
```ts
interface StoryListResponse {
  items: StorySummary[];
  nextCursor: string | null;
  total: number;
}

interface StorySummary {
  id: string;
  title: string;
  coverUrl: string;
  createdAt: string;
  playCount: number;
  favorited: boolean;
  primaryLang: Locale;
  downloaded?: boolean;
}
```

### 7.8 `POST /api/story/:id/favorite`

**鉴权**:deviceToken 或 parentToken

**Request**:
```ts
interface FavoriteRequest {
  favorited: boolean;
}
```

**Response 200**:
```json
{ "code": 0, "data": { "storyId": "...", "favorited": true }, "requestId": "..." }
```

### 7.9 `DELETE /api/story/:id`

**鉴权**:deviceToken 或 parentToken

**Response 200**:
```json
{ "code": 0, "data": { "deleted": true }, "requestId": "..." }
```

### 7.10 `POST /api/story/:id/play-stat`

上报播放统计。

**鉴权**:deviceToken

**Request**:
```ts
interface PlayStatRequest {
  event: 'start' | 'page_end' | 'complete' | 'abort';
  pageNum?: number;                      // page_end 时必传
  timestamp: string;                     // ISO 8601
  durationMs?: number;                   // page_end 的该页实际播放时长
}
```

**Response 200**:
```json
{ "code": 0, "data": null, "requestId": "..." }
```

---

## 八、TTS / ASR

### 8.1 `POST /api/tts/synthesize`

合成 TTS 音频。

**鉴权**:deviceToken

**限流**:50 次/小时 per device

**Request**:
```ts
interface TtsRequest {
  text: string;                           // 最长 500 字符
  lang: Locale;
  voiceId?: string | null;                // 可选,默认按 lang 用预设 voice
  speed?: number;                         // 0.7-1.3,默认 1.0
}
```

**Response 200**:
```ts
interface TtsResponse {
  audioUrl: string;                       // CDN URL,MP3
  durationMs: number;
  cached: boolean;                         // 命中服务端缓存则 true(按 text+voice 哈希)
}
```

**可能错误**:`30003`、`90003`(限流)

### 8.2 `GET /api/tts/voices`

列出可用 voice。

**鉴权**:parentToken(家长设置用)

**Response 200**:
```ts
interface VoiceListResponse {
  voices: Voice[];
}

interface Voice {
  voiceId: string;
  name: string;                           // 显示名
  lang: Locale;
  gender: 'male' | 'female' | 'neutral';
  sampleUrl: string;                       // 试听 URL
  isPremium: boolean;                      // 只有订阅用户可用
}
```

### 8.3 `POST /api/asr/upload`

上传录音做 ASR。

**鉴权**:deviceToken

**Content-Type**:`multipart/form-data`

**Form Fields**:
- `audio`: 文件,WAV 或 WebM,16kHz 单声道,最长 30 秒
- `lang`: Locale 字符串
- `context`: `"dialogue_round"` | `"general"`(影响 ASR 模型选择)

**Response 200**:
```ts
interface AsrResponse {
  text: string;
  confidence: number;                     // 0.0-1.0
  detectedLang: Locale;
  durationMs: number;
}
```

**可能错误**:`30011`(识别失败或静音)、`90002`(文件过大或格式错)

---

## 九、订阅 + 支付

### 9.1 `GET /api/subscription/status`

**鉴权**:parentToken

**Response 200**:
```ts
interface SubscriptionStatusResponse {
  plan: 'free' | 'monthly' | 'yearly';
  status: 'free' | 'active' | 'canceled' | 'expired' | 'past_due';
  provider: 'stripe' | 'paypal' | null;
  expiresAt: string | null;
  pdfExportsLeft: number;                 // 本月剩余 PDF 导出次数
  pdfExportsResetAt: string | null;       // 下次重置时间
  stripeCustomerId?: string | null;       // 用于跳转 Customer Portal
  paypalSubId?: string | null;
  cancelAtPeriodEnd: boolean;             // 已取消但还在有效期内
}
```

### 9.2 `POST /api/subscription/stripe/create`

发起 Stripe Checkout。

**鉴权**:parentToken

**Request**:
```ts
interface CreateStripeCheckoutRequest {
  plan: 'monthly' | 'yearly';
  successUrl: string;                      // https://h5.wonderbear.app/subscribe/success?session_id={CHECKOUT_SESSION_ID}
  cancelUrl: string;
  locale: Locale;                          // Checkout 页面语言
}
```

**Response 200**:
```ts
interface CreateStripeCheckoutResponse {
  sessionId: string;                       // 前端 stripe.redirectToCheckout({sessionId})
  url: string;                             // 备选,直接 window.location.href=url
}
```

**可能错误**:`40003`(已有订阅)、`50002`(Stripe 不可用)

### 9.3 `POST /api/subscription/paypal/create`

发起 PayPal 订阅。

**鉴权**:parentToken

**Request**:
```ts
interface CreatePaypalSubRequest {
  plan: 'monthly' | 'yearly';
  returnUrl: string;
  cancelUrl: string;
}
```

**Response 200**:
```ts
interface CreatePaypalSubResponse {
  approvalUrl: string;                     // PayPal 跳转 URL
  subscriptionId: string;                  // PayPal 的 sub ID
}
```

### 9.4 `POST /api/subscription/cancel`

取消订阅(期末生效,保留到 expiresAt)。

**鉴权**:parentToken

**Request**:
```ts
interface CancelSubRequest {
  reason?: string;                         // 可选,最长 500
  immediately?: boolean;                    // 默认 false,true 则立即取消并按比例退款(Phase 2)
}
```

**Response 200**:
```ts
interface CancelSubResponse {
  status: 'canceled';
  expiresAt: string;                        // 权益保留到这个时间
  cancelAtPeriodEnd: true;
}
```

### 9.5 `POST /api/stripe/webhook`

**不是给前端调的**,Stripe 服务器调。

**鉴权**:Stripe 签名 header `Stripe-Signature`

**Request**:Stripe Event JSON

**Response**:HTTP 200 + `{ received: true }`(非业务响应格式,Stripe 规范要求)

**订阅的事件处理**:
- `checkout.session.completed` → 激活订阅
- `customer.subscription.updated` → 更新状态
- `customer.subscription.deleted` → 标记为 canceled/expired
- `invoice.payment_failed` → status=past_due

**可能错误**:`40007`(签名无效,返回 400)

### 9.6 `POST /api/paypal/webhook`

同上,PayPal 的 webhook 入口。签名校验方式见 PayPal 文档 `PAYPAL-TRANSMISSION-SIG`。

### 9.7 `POST /api/stripe/portal-session`

生成 Stripe Customer Portal 链接(让用户自助管理订阅)。

**鉴权**:parentToken

**Request**:
```ts
interface CreatePortalSessionRequest {
  returnUrl: string;
}
```

**Response 200**:
```ts
interface CreatePortalSessionResponse {
  url: string;                              // Portal 跳转 URL
  expiresAt: string;                         // Portal 链接过期时间(Stripe 返回的)
}
```

---

## 十、PDF 导出 `/api/pdf`

### 10.1 `POST /api/pdf/generate`

异步任务:合成单个或多个故事的 PDF。

**鉴权**:parentToken

**Request**:
```ts
interface GeneratePdfRequest {
  storyIds: string[];                       // 1-2 个,多于 1 个会合订本
  includeCover: boolean;                     // 默认 true
  language: 'primary' | 'learning' | 'both'; // 输出哪种语言文字
}
```

**Response 202**:
```ts
interface GeneratePdfResponse {
  taskId: string;
  status: 'queued';
  estimatedDurationSec: number;              // 15-30
}
```

**可能错误**:`40005`(PDF 额度用完)、`40006`(免费用户)、`30007`(storyId 无效)

### 10.2 `GET /api/pdf/:taskId/status`

轮询 PDF 进度。

**鉴权**:parentToken

**Response 200**:
```ts
interface PdfStatusResponse {
  taskId: string;
  status: 'queued' | 'generating' | 'completed' | 'failed';
  progress: number;                          // 0-100
  downloadUrl?: string | null;               // completed 时给
  expiresAt?: string | null;                  // 下载链接过期时间(24h)
  error?: { code: number; message: string; } | null;
}
```

### 10.3 `GET /api/pdf/:taskId/download`

直接下载(服务端 302 到 R2 CDN 签名 URL)。

**鉴权**:parentToken

**Response**:HTTP 302 Location 到签名 URL,或 HTTP 200 + `{code: 0, data: { downloadUrl }}` 给前端自己跳

---

## 十一、OEM / OTA / 遥测

### 11.1 `GET /api/oem/config`

获取设备的 OEM 品牌配置(TV 启动时读一次)。

**鉴权**:deviceToken

**Response 200**:
```ts
interface OemConfigResponse {
  oemConfig: OemConfig | null;              // null 表示无 OEM 定制(用默认品牌)
}

interface OemConfig {
  oemId: string;
  brandName: {
    zh: string;
    en: string;
    pl?: string;
    ro?: string;
  };
  logoUrl: string;
  colors: {
    primary: string;                         // CSS 色值,如 "#FFB74D"
    secondary: string;
    background: string;
    text: string;
  };
  menus?: Array<{ id: string; enabled: boolean }>;  // 部分菜单可 OEM 屏蔽
  greetings?: {
    welcome?: string;                        // 欢迎语
  };
  support?: {
    whatsapp?: string;
    email?: string;
    phone?: string;
  };
  assetBundleUrl?: string;                    // 额外素材包
  assetBundleVersion?: string;
}
```

### 11.2 `GET /api/ota/check`

检查 APK / HTML 更新。

**鉴权**:deviceToken

**Query**:
```ts
interface OtaCheckQuery {
  currentApkVer: string;
  currentHtmlVer: string;
  channel?: 'stable' | 'beta';               // 默认 stable
}
```

**Response 200**:
```ts
interface OtaCheckResponse {
  apk: {
    hasUpdate: boolean;
    latestVer?: string;
    downloadUrl?: string;
    size?: number;                            // bytes
    md5?: string;
    releaseNotes?: string;                    // 中英双语用换行分隔
    mandatory?: boolean;
  };
  html: {
    hasUpdate: boolean;
    latestVer?: string;
    bundleUrl?: string;                       // 整个 dist 打包 zip 的 URL
    size?: number;
    md5?: string;
    releaseNotes?: string;
    mandatory?: boolean;
  };
}
```

### 11.3 `POST /api/ota/report`

上报更新结果。

**鉴权**:deviceToken

**Request**:
```ts
interface OtaReportRequest {
  kind: 'apk' | 'html';
  fromVer: string;
  toVer: string;
  result: 'success' | 'failed' | 'rollback';
  errorCode?: string;
}
```

**Response 200**:`{ code: 0, data: null, ... }`

### 11.4 `POST /api/telemetry/report`

设备埋点上报(批量)。

**鉴权**:deviceToken

**Request**:
```ts
interface TelemetryReportRequest {
  events: TelemetryEvent[];                   // 最多 100 条/次
}

interface TelemetryEvent {
  type: TelemetryEventType;
  timestamp: string;
  params?: Record<string, unknown>;
}

type TelemetryEventType =
  | 'device_boot'
  | 'page_view'
  | 'story_generated'
  | 'story_played'
  | 'payment_attempted'
  | 'error'
  | 'performance'
  | 'custom';
```

**Response 200**:`{ code: 0, data: { received: number }, ... }`

---

## 十二、开发工具 `/api/dev`

**仅 `NODE_ENV=development` 时挂载**,生产环境访问返回 404。

### 12.1 `POST /api/dev/quick-register`

跳过邮箱验证快速注册。

**Request**:
```ts
interface QuickRegisterRequest {
  email: string;
  deviceId?: string;
  activationCode?: string;
}
```

**Response 200**:同 `RegisterResponse`

### 12.2 `POST /api/dev/reset-device`

**Request**:`{ deviceId: string }`
**Response**:`{ code: 0, data: { reset: true }, ... }`

### 12.3 `POST /api/dev/reset-code`

**Request**:`{ code: string }`
**Response**:`{ code: 0, data: { reset: true }, ... }`

### 12.4 `POST /api/dev/simulate-stripe-webhook`

**Request**:任意 Stripe Event JSON
**Response**:处理结果

---

## 十二 bis、经销商模块 `/api/seller`(Phase 1 末批次 7 再细化)

> Phase 1 MVP 先跑 C 端流程,经销商 Console 在批次 7 补充完整契约。
> 大致接口:登录 / 批量生成激活码 / 查询码列表 / 查询设备列表 / 销售统计。
> 字段草案参考 v7 文档 `6_API接口功能清单.md §十五`,本文件批次 7 开工前会补写。

---

## 十三、类型别名总表

统一放这里避免散落在各接口定义里。**TypeScript 开发者直接复用这些 type,不要自己定义。**

```ts
// 语言
type Locale = 'zh' | 'en' | 'pl' | 'ro';

// 设备状态机
type DeviceStatus =
  | 'registered'              // 第一次 register 后,未激活(不应出现:register 时必带激活码)
  | 'activated_unbound'        // 激活码通过,未绑家长
  | 'bound'                    // 已绑家长
  | 'unbound_transferable'     // 家长解绑了,可被下一个家长接手
  | 'disabled';                // 客服禁用

// 订阅档位
type SubscriptionPlan = 'free' | 'monthly' | 'yearly';

// 订阅状态
type SubscriptionStatus = 'free' | 'active' | 'canceled' | 'expired' | 'past_due';

// 激活码状态
type ActivationCodeStatus =
  | 'issued'                   // 已生成,未使用
  | 'activated'                // 已激活
  | 'transferred'              // 原设备解绑,可再次绑定
  | 'revoked';                 // 被客服作废

// 故事生成状态
type StoryStatus = 'queued' | 'generating' | 'completed' | 'failed';

// 故事生成阶段
type GenerationStage = 'queue' | 'llm' | 'image' | 'tts' | 'assembly' | 'done';

// 孩子档案
interface Child {
  id: string;
  parentId: string;
  name: string;
  age: number;
  gender: 'male' | 'female' | 'prefer_not_say' | null;
  avatar: string;
  primaryLang: Locale;
  secondLang: Locale | 'none';
  birthday: string | null;
  coins: number;
  voiceId: string | null;
  createdAt: string;
  updatedAt: string;
}

// 家长档案(完整版,/api/parent/me 返回)
interface Parent {
  id: string;
  email: string;
  locale: Locale;
  activated: boolean;                   // 是否已有绑定设备(决定有无 6 本激活额度)
  playBgm: boolean;                     // 全局 BGM 开关(TV 端读这个)
  createdAt: string;
  subscription: SubscriptionSummary | null;
  devicesCount: number;
  childrenCount: number;
}
```

---

## 十四、状态同步协议

**这一节专门解决"H5 改 → TV 如何感知"和"后端事件 → 客户端怎么收到"的问题。**

### 14.1 同步原理

MVP **只用 HTTP 轮询**,不引入 WebSocket/SSE(降低复杂度和 GP15 WebView 连接维护成本)。

两个轮询通道:

| 来源 | 轮询接口 | 频率 | 用途 |
|---|---|---|---|
| TV 激活页 | `GET /api/device/status` | **3 秒** | 等待家长扫码绑定 |
| TV 运行期 | `POST /api/device/heartbeat` | **5 分钟** | 心跳 + 拉待执行命令 |
| H5 支付页 | `GET /api/subscription/status` | **3 秒**(最长 3 分钟) | 等 webhook 回调完成 |
| H5 PDF 进度 | `GET /api/pdf/:taskId/status` | **3 秒** | 等 PDF 生成 |
| TV 故事进度 | `GET /api/story/:id/status` | **2 秒** | 等故事生成 |

### 14.2 关键场景

#### 场景 A:家长 H5 切换活跃孩子,TV 端感知

1. H5 调 `POST /api/device/active-child { deviceId, childId }`
2. 后端更新 `Device.activeChildId`
3. TV 下次 heartbeat(最长 5 分钟后)或下次 `GET /api/device/active-child`(如果页面需要),拿到新的 activeChild
4. **可选加速**:后端在 heartbeat response 的 `pendingCommands` 里推一个 `active_child_changed` 命令,TV 立即切换

**前端实现细节**:
- H5 切换后 UI 立即乐观更新,显示"已切换,TV 端最快 5 分钟内同步"
- TV 端收到新 activeChild 时,如果当前屏幕是首页,顶部状态条动画更新

#### 场景 B:家长 H5 改 BGM 全局开关,TV 端感知

1. H5 调 `PATCH /api/parent/me { playBgm: false }`
2. 后端更新 `Parent.playBgm`
3. TV 端不主动获取这个字段,在**每次播放前**从缓存读;缓存定期(每次 heartbeat)刷新
4. TV 端下次调 `playBgm()` 前先 check 本地缓存的 `parent.playBgm`

**前端实现**:
- H5 改完 UI 提示"设置已保存,TV 端下次播放时生效"
- TV 端每次进播放屏,先调一次轻量接口(或用 heartbeat 拿的数据)确认 BGM 开关

#### 场景 C:Stripe 订阅支付成功,H5 感知

1. 用户 Checkout 后被 `success_url` 重定向回 H5
2. H5 的 `/subscribe/success` 页面**轮询** `GET /api/subscription/status`,每 3 秒一次
3. 后端此时正在处理 Stripe webhook `checkout.session.completed`,更新 DB
4. 轮询最多 3 分钟,期间 `status` 从 `free` → `active` 则成功
5. 3 分钟未变更:显示"支付处理中,如长时间未更新请联系客服",附 requestId 和 Stripe session_id

**坑**:Stripe webhook 可能有几秒到几十秒延迟,前端**不要只轮询一次**就判失败。

#### 场景 D:故事生成进度,TV 端感知

1. TV 调 `POST /api/story/generate` 拿到 storyId
2. TV 进生成等待屏,每 2 秒调 `GET /api/story/:id/status`
3. 进度从 `queue → llm → image(1/12, 2/12...) → tts → done`
4. 超过 120 秒仍未 completed:显示"小熊画得有点慢,要不要再等等?" + [继续等 / 放弃]
5. 放弃则 `DELETE /api/story/:id`

#### 场景 E:家长 H5 远程重启设备

1. H5 调 `POST /api/device/:id/reboot`
2. 后端写 Redis `device:commands:${deviceId}` 队列,TTL 5 分钟
3. TV 下次 heartbeat 拉到命令,执行重启
4. 重启后 TV 会重新 register 并 heartbeat,H5 通过 `GET /api/device/list` 看到 `lastSeenAt` 更新

### 14.3 一致性保证

- **最终一致,不保证强一致**:5 分钟窗口内 H5 和 TV 可能状态不一致,这是 MVP 的可接受代价
- **关键操作给用户明确反馈**:改完立即乐观更新 UI + 提示"XX 内 TV 端会同步"
- **后端不做跨设备 push**(不用 FCM/APNs,GP15 不保证 GMS 可用)

### 14.4 Webhook 可靠性

- Stripe/PayPal webhook 必须做幂等处理:同 event.id 重复收到 → 跳过
- Webhook 处理失败应返回 4xx/5xx,让对方平台自动重试
- Webhook 签名校验失败返回 **HTTP 400**,记录到告警

---

## 十五、变更历史

| 版本 | 日期 | 变更 |
|---|---|---|
| v1.0 | 2026-04-21 | 初版,覆盖 Phase 1 MVP 全部 40+ 接口 |

## 十六、争议裁决原则

当 server-v7 实现、H5 代码、TV 代码三边出现不一致:

1. **本文档**(API_CONTRACT.md)**是裁决唯一权威**
2. 本文档和 v7 原始 `6_API接口功能清单.md` 有分歧时,以**本文档**为准(因为本文档更精确)
3. 本文档没覆盖的边缘情况:
   - 优先参考 `6_API接口功能清单.md` 中文描述
   - 仍不清楚:发消息给创始人,创始人决定后更新本文档
4. **任何一方不得私自修改契约**——改了对方不知道,联调就爆炸
5. 契约变更必须:
   - 在本文件追加(不删旧字段,只加新字段或标记 deprecated)
   - 三个开发窗口同步知会
   - 更新文件头"创建时间"下面加"最后更新"

---

**文档结束**
