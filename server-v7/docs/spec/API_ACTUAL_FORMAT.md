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

## 批次 2:认证模块(待实现后填充)

> **后端实现完批次 2 后,在这里追加**:
> - POST /api/auth/send-code
> - POST /api/auth/register
> - POST /api/auth/login-code
> - POST /api/auth/login-password
> - POST /api/auth/refresh
> - POST /api/auth/logout
>
> 每个接口提供:curl 示例 + success response 实例 + 主要错误码触发示例

TODO

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
