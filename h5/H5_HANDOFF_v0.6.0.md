# H5 v0.6.0 交棒文档

> **写于**:2026-04-22
> **写给**:之后接手三端联调的 Claude 窗口、或者创始人本人
> **范围**:H5 这一棒做完之后,联调时需要知道的一切

---

## 1. H5 完成度

### 已完成 ✅

| 模块 | 状态 |
|---|---|
| 基础设施(http/router/store/i18n/types) | ✅ 完整,严格对齐 API_CONTRACT v1.0 |
| **扫码注册引导链路**(目标核心) | ✅ 完整闭环 |
| 完整家长后台(home/children/devices/settings/stories/subscribe) | ✅ P0 全做 |
| Mock 层(全 API 覆盖) | ✅ 切 `VITE_USE_MOCK=true` 即用 |
| 真连服务端 | ✅ 切 `VITE_USE_MOCK=false` 即用,axios 拦截器已就绪 |

### 已知未做 ⏭

- `/history`、`/help` 仍是 PlaceholderView(handoff 里就是 P1)
- 订阅/PDF 在 mock 是 work 的,但 demo 阶段 handoff 让先跳过,**不要在演示时点进去**

---

## 2. 跟服务端联调的对齐点

### 2.1 启动顺序

服务端必须先起来(默认 `localhost:3000`),再起 H5。

H5 切真连只需改 `.env.development`:
```bash
VITE_USE_MOCK=false
VITE_API_BASE_URL=http://localhost:3000
```

### 2.2 H5 实际会调用的接口清单

按照"扫码注册引导链路"的最小路径,这些接口必须在服务端 work:

| 接口 | 章节 | H5 触发点 | 优先级 |
|---|---|---|---|
| `POST /api/auth/send-code` | §4.1 | 注册页点"发送验证码" | 🔴 必须 |
| `POST /api/auth/register` | §4.2 | 注册页点"创建账户" | 🔴 必须 |
| `POST /api/child` | §6.1 | OnboardChild 点"下一步" | 🔴 必须 |
| `GET /api/parent/me` | §6bis.1 | HomeView 进入时拉资料 | 🔴 必须 |
| `GET /api/child/list` | §6.4 | ChildrenList 进入时 | 🟡 二级路径 |
| `POST /api/auth/refresh` | §4.5 | 401 自动重试 | 🟡 容错 |
| `POST /api/auth/logout` | §4.6 | 退出登录按钮 | 🟢 可选 |
| 其余(/login-code、/login-password、/device/*、/story/*、/settings 等) | 多 | 完整后台 | 🟢 二级路径 |

**最小可演示集**:🔴 4 个接口 + 🟡 3 个接口 = **7 个接口**就能跑通完整链路。

### 2.3 跨端契约(已对齐 patch v2)

**TV 二维码 URL 格式**(TV 窗口生成、H5 接收):
```
{h5BaseUrl}/#/register?device={deviceId}&code={activationCode}
```

| 位置 | 字段名 |
|---|---|
| URL query | `device`, `code`(短名) |
| API 请求体 | `deviceId`, `activationCode`(长名) |

H5 路由守卫**两种都接**(容错):
```ts
const deviceId = (to.query.device as string) || (to.query.deviceId as string) || '';
const activationCode = (to.query.code as string) || (to.query.activationCode as string) || '';
```

### 2.4 响应信封(必须严格对齐)

成功:
```json
{ "code": 0, "data": {...}, "requestId": "req_xxx" }
```

业务失败(HTTP 仍然是 200,客户端只判 code):
```json
{
  "code": 30004,
  "message": "故事额度用完了,订阅解锁无限故事",
  "messageEn": "Free quota exhausted, subscribe for unlimited",
  "messagePl": "...",
  "messageRo": "...",
  "requestId": "req_xxx",
  "details": { "storiesLeft": 0 },
  "actions": [{"label": "升级", "labelEn": "Upgrade", "url": "/sub"}]
}
```

H5 拦截器**只判 `code`,不判 HTTP status**(401 例外,触发刷新)。
服务端如果 HTTP 给 500/503 + 没有信封字段,H5 会兜底显示"网络错误"toast。

---

## 3. 跟 TV 端联调的对齐点

### 3.1 TV 端需要做的二维码

TV 窗口的 `tv-html/src/utils/buildBindingUrl.ts` 已经实现了正确格式,**不要改**。

那个文件现在生成的 URL 是:
```
https://h5.wonderbear.app/#/register?device={id}&code={code}
```

**联调时**,TV 端的 OemConfig 拿到的 `h5BaseUrl` 应该改为本机 IP:
```
http://192.168.x.x:5174
```

可以在服务端 mock 一个 OEM config,或者前端硬塞。具体由服务端窗口决定。

### 3.2 TV 端"等待绑定"轮询

TV 显示二维码后,会轮询 `/api/device/status`(§5.2)等绑定结果。
**这个接口跟 H5 完全无关**,但服务端窗口要做。

H5 这边走完 register 接口(`/api/auth/register` 带 deviceId+activationCode),
服务端就该把设备状态从 `activated_unbound` 改成 `bound`,
TV 下次轮询就能看到。

---

## 4. 联调常见坑(预判)

### 4.1 CORS

H5 dev server 在 5174,服务端在 3000,跨域请求。
- 方案 A:服务端开 CORS,允许 `http://192.168.x.x:5174` 和 `http://localhost:5174`
- 方案 B(已配):H5 的 `vite.config.ts` 已经配了 proxy:`/api → http://localhost:3000`
  - 但这个 proxy 只在**电脑本机访问 `http://localhost:5174`** 时生效
  - **手机走 IP 访问时 proxy 失效**(浏览器直接跨域请求 IP:3000)
  - **解决**:服务端必须开 CORS

### 4.2 验证码

服务端按 handoff 决策,做两件事:
1. 验证码打印到服务端 console
2. 提供 `GET /api/dev/last-code?email=xxx` 接口(在 §12 dev 工具下),让 H5 / TV 模拟器能取最近一条码自动填

H5 这边**目前没集成自动填**,留给 TV 模拟器或下个版本。手动从服务端终端读码也能跑通。

### 4.3 JWT Token

H5 拿到 `parentToken` 后存 localStorage,后续请求 `Authorization: Bearer xxx`。
服务端 JWT 实现要:
- 至少 60 分钟有效期(避免频繁 refresh 影响体验)
- 提供 `/api/auth/refresh` 接口(§4.5),H5 401 时会自动调
- payload 里至少含 `parentId` + `email` + `exp`

### 4.4 Mock 数据 vs 真数据 schema 不一致

mock 层的字段是按 API_CONTRACT 严格写的,**真服务端如果实现时漏字段,H5 类型断言会出问题**。
建议服务端 MVP 完成后,跑一次"H5 真连"冒烟,看 console 有无类型错误。

具体校验清单(挑几个最容易漏的):
- `Parent.activated`(boolean)、`Parent.devicesCount`、`Parent.childrenCount`
- `Child.parentId`、`Child.coins`(默认 0)、`Child.voiceId`(可 null)、`Child.createdAt`、`Child.updatedAt`
- `RegisterResp.device.storiesLeft`(默认 6 给免费试用)
- 所有 list 接口返 `{ items: [], nextCursor: null, total: 0 }`(不是 `{ children }` 或 `{ devices }`)

---

## 5. H5 推 git 后,接下来三端联调的建议路径

### 阶段 1:服务端单独自测
- 服务端窗口跑通自己的 batch 2/3 接口
- curl 测每个接口 + 写 `API_ACTUAL_FORMAT.md` 实际响应
- 启动一个本地 PG + Fastify

### 阶段 2:H5 + 服务端联调
- 起服务端 + 起 H5,改 `VITE_USE_MOCK=false`
- 桌面浏览器打开 `http://localhost:5174/#/register?device=tv_test&code=ABC`
- 走完整链路,核对每个接口响应字段
- 修发现的差异

### 阶段 3:加上 TV
- 起 TV(tv-html dev,5173 端口)
- TV 模拟器或真 GP15 显示二维码
- 手机扫,完整跑流程

### 阶段 4:本地实际生图(创始人核心目标)
- 服务端 batch 4 完成后(story/dialogue/generate)
- TV 端触发故事生成
- 服务端调真 AI 生图 API(OpenAI/Gemini/fal,创始人提供 key)
- H5 在 `/stories` 列表能看到刚生成的故事

---

## 6. 接手 Claude 的开局指令(模板)

如果之后开新窗口让 Claude 接手联调,可以这样起头:

```
你是 WonderBear 项目的【三端联调窗口】。

monorepo: https://github.com/snugogo/wonderbear

当前状态:
- server-v7/: 服务端,batch 0-X 完成(具体进度看 API_ACTUAL_FORMAT.md)
- tv-html/: TV 端,vX.X.X
- h5/: 家长 H5,v0.6.0(已完成,见 h5/README.md)
- assets/: 96 张视觉素材

你的工作区:整个 monorepo,跨端联调。

第一回合:
1. git clone monorepo,读所有 README
2. 读 server-v7/docs/spec/API_CONTRACT.md + 三个 patch
3. 读 server-v7/docs/spec/API_ACTUAL_FORMAT.md(看服务端实现到哪)
4. 读 h5/H5_HANDOFF_v0.6.0.md(本文档)
5. 报告联调阻塞点 + 建议最小演示路径

不要写代码,先读 + 汇报。
```

---

## 7. 创始人最关心的"实际生图演示"路径

按 API_CONTRACT §7.1,故事生成是 **TV 端 + 服务端** 主导:
1. TV: `POST /api/story/dialogue/start` → 拿 dialogueId
2. TV: 7 轮对话 `POST /api/story/dialogue/:id/turn`
3. TV: `POST /api/story/generate` → 拿 storyId
4. TV: 轮询 `GET /api/story/:id/status` 直到 completed
5. TV/H5: `GET /api/story/:id` 拿到 12 页图文

**H5 在这个链路里只是观众**,不参与触发。所以创始人要看"扫码 → 生图"的完整流程,
**至少需要 H5 + 服务端 + TV(或 TV 模拟器)三端齐备**。

WonderBear-H5 v0.6.0 已经把 H5 这一棒做完了,等服务端+TV 齐了直接联调即可。
