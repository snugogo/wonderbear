# WonderBear v7 · 家长 H5 · v0.6.0

移动端 H5,**严格对齐 `API_CONTRACT v1.0` + patch v2/v3 + H5_HANDOFF**。
扫码入口 → 邮箱注册 → 引导建孩子 → 交回 TV,核心链路丝滑闭环。

**技术栈**:Vue 3 + Vite 6 + TypeScript + Vant 4 + Pinia + Vue Router 4(hash)+ vue-i18n 10 + Axios。
**设计基准**:375px。**4 语言齐全**:zh / en / pl / ro。
**默认端口**:**5174**(避开 TV 5173)。

---

## 🚀 本地启动(WSL2 / macOS / Linux)

### 第 1 步:装依赖

```bash
cd wonderbear-h5
npm install
```

### 第 2 步:启动

```bash
npm run dev
```

终端会显示两个地址:
```
  ➜  Local:   http://localhost:5174/
  ➜  Network: http://192.168.x.x:5174/   ← 手机用这个
```

### 第 3 步:手机访问(必读)

**前提**:手机和电脑必须连**同一个 WiFi**。

1. 上面的 Network 地址 `http://192.168.x.x:5174/`,把 IP 抄到手机浏览器
2. 看到登录页就说明通了
3. 模拟扫码:在手机浏览器地址栏输入 `http://192.168.x.x:5174/#/register?device=tv_gp15_test_001&code=ABC123` 直接进注册页

**Windows + WSL2 用户特别注意**:
- WSL 里跑 vite,默认 Network IP 是 WSL 内部 IP(`172.x.x.x`),手机访问不到
- 解决:在 Windows 主机用 `ipconfig` 看**真正的局域网 IP**(`192.168.x.x` 或 `10.x.x.x`),手机用这个 IP 访问
- 如果还是不通,Windows 防火墙要放行 5174 端口,**用管理员 PowerShell** 跑:
  ```powershell
  New-NetFirewallRule -DisplayName "WSL Vite 5174" -Direction Inbound -LocalPort 5174 -Protocol TCP -Action Allow
  ```
- 如果 WSL2 IP 转发还是有问题(常见),用一行 portproxy 把 Windows 5174 转到 WSL:
  ```powershell
  # 先在 WSL 里跑 `hostname -I` 拿 WSL IP,假设是 172.30.x.x
  netsh interface portproxy add v4tov4 listenport=5174 listenaddress=0.0.0.0 connectport=5174 connectaddress=<WSL_IP>
  ```

---

## 🎬 Demo 流程(完整链路)

### 模式 A:纯 Mock(不依赖服务端)

`.env.development` 默认 `VITE_USE_MOCK=true`,不用改任何配置。

**完整体验路径**(手机操作):

1. 浏览器打开 `http://192.168.x.x:5174/#/register?device=tv_gp15_test&code=DEMO01`
2. 进入注册页,看到顶部"扫码设备已就绪" banner
3. 输入邮箱(随便,如 `you@test.com`)
4. 点"发送验证码"按钮
5. **桌面打开浏览器 F12 控制台**,看到橘色大字:`[Mock] 📧 验证码 → you@test.com: 123456`
6. 把这 6 位填回手机
7. 勾"我已阅读"协议 → 点"创建账户"
8. **自动进入 OnboardChild 页**(精简建孩子表单,3 步进度条)
9. 选头像、填名字、选年龄 → "下一步"
10. **进入 OnboardDone 完成页**:大插画 + "请回到电视前 / 点开始 / 跟小熊创作故事" 3 步指引
11. 点"明白啦,回家" → 进入完整家长后台

> 💡 验证码必须在**桌面浏览器**看 console。手机看不到 mock 日志。
> 实战做法:先桌面浏览器打开页面发码、看 console 拿码,再手机操作整个流程。
> Stage 2 服务端做完后,验证码会在服务端终端打印,流程更顺。

### 模式 B:真连本地服务端

`.env.development` 改为:
```
VITE_USE_MOCK=false
VITE_API_BASE_URL=http://localhost:3000
```

服务端跑起来后,流程同上,验证码看**服务端终端**输出。

### 预置测试账号(Mock 模式)

| Email | Password | 备注 |
|---|---|---|
| `demo@wonderbear.app` | `demo1234` | 已登录态可直接用密码登录测试 /home /children 等页 |

---

## 📋 v0.6.0 相对 v0.5.0 改动清单

### Bug 修复(5 处)

| # | 位置 | 问题 | 修复 |
|---|---|---|---|
| 1 | `vite.config.ts` | 端口 5173 跟 TV 冲突 | 改 5174,环境变量 `VITE_DEV_PORT` 可覆盖 |
| 2 | `src/api/http.ts` `tryRefresh` | 单飞刷新 race condition,`refreshingPromise=null` 写在 await 后 | 移到 `.finally()` 内,真正 settle 后才清 |
| 3 | `src/api/http.ts` mock 分支 | mock 未命中静默走真请求,误导网络错 | 显式抛 `BusinessError(99999)` |
| 4 | `src/stores/auth.ts` `logout` | 未清 `device` / `deviceCtx` | 一并清掉,避免登出后残留扫码上下文 |
| 5 | `src/api/mock.ts` `register` | 未校验激活码/设备已绑(跟 §4.2 偏差) | 补上 20002/20003 校验,可用 `activationCode='FAIL'` / `deviceId='BOUND_BY_OTHER'` 测试负反馈路径 |

### 新功能(核心:扫码注册引导链路)

新增 2 个页面 + 1 条登录后分叉:

| 路由 | 文件 | 用途 |
|---|---|---|
| `/onboard/child` | `src/views/onboard/OnboardChildView.vue` | 注册成功后引导建第一个孩子。3 步进度条 + 精简表单(头像/名字/年龄主显,性别/语言折叠)+ "跳过"链接 |
| `/onboard/done` | `src/views/onboard/OnboardDoneView.vue` | "回 TV" 完成页。大插画(`bear_cheer.webp`)+ 3 步明确指引"回到电视/点开始/跟小熊创作故事" |

`RegisterView` 分叉逻辑:
- 注册成功 → 检查 `authStore.deviceCtx?.deviceId`
- **是**(扫码来的) → `replace('/onboard/child')`
- **否**(直接打开 H5 注册的) → `replace('/home')`

`HomeView` 兜底入口:
- 当 `childrenCount === 0` 时,首页顶部显示醒目 banner"还没有孩子档案 → 添加",点击进 `/onboard/child`
- 给跳过 onboard 的用户一条明确的回归路径

### i18n

4 语言全填齐(共新增 22 个 key):
- `home.noChildTitle` / `noChildDesc`
- `onboard.step1` ~ `step3`、`childTitle`、`childDesc`、`namePlaceholder`、`moreOptions`、`createNext`、`skipForNow`、`doneTitle`、`backToTvStep1` ~ `step3`、`skippedNote`、`doneButton`、`addAnother`

zh 母语,en 人工,pl/ro 机翻占位。

---

## 🔌 API 响应格式(对齐 `API_CONTRACT §1.2`)

**成功**:`{ code: 0, data, requestId }`
**失败**:`{ code, message, messageEn, messagePl, messageRo, requestId, details, actions }`

拦截器工作流:

1. HTTP 200 + `code=0` → 返回 `data`
2. HTTP 200 + `code!=0` → 抛 `BusinessError`(含 `code/localizedMessage/actions/requestId`)
3. HTTP 401 → 调 `/api/auth/refresh` 重试一次(单飞),失败清 token 由守卫拉回登录
4. `localizedMessage` 按当前 locale 从 `messageEn/Pl/Ro` 挑

---

## 🔐 跨端硬契约(对齐 patch v2)

### TV 扫码 URL 格式

```
{h5BaseUrl}/#/register?device={deviceId}&code={activationCode}
```

| 位置 | 字段名 |
|---|---|
| TV 二维码 URL | `device`, `code`(短名) |
| H5 → API 请求体 | `deviceId`, `activationCode`(长名) |

H5 路由守卫**同时容忍短名和长名**,保证万一 TV 用错名也能 work:
```ts
const deviceId = (to.query.device as string) || (to.query.deviceId as string) || '';
const activationCode = (to.query.code as string) || (to.query.activationCode as string) || '';
```

### Hash 模式

`createWebHashHistory` 强制要求,**TV 二维码 URL 必须含 `#`**,否则 query 参数会被静态托管吃掉。

---

## 📱 页面清单

| 路由 | 状态 | 说明 |
|---|---|---|
| `/login` | ✅ | 双模式:6 格验证码 / 密码登录 |
| `/register` | ✅ | 6 格验证码 + 可选密码 + 扫码 banner;成功后按是否扫码分叉 |
| **`/onboard/child`** | 🆕 | 注册后引导建第一个孩子,精简表单 |
| **`/onboard/done`** | 🆕 | "回 TV" 完成页,核心链路收口 |
| `/home` | ✅ | 完整家长后台,无孩子时显示醒目引导 banner |
| `/children` / `/children/new` / `/children/:id/edit` | ✅ | 孩子 CRUD,2x2 网格 + 17 头像选择器 |
| `/stories` / `/stories/:id` / `/stories/:id/pdf` | ✅ | 列表 + 12 页预览 + PDF 轮询 |
| `/subscribe` / `/subscribe/success` / `/subscribe/cancel` | ✅ | 套餐卡 + Stripe/PayPal 跳转 |
| `/devices` / `/settings` | ✅ | 设备管理 / 账户设置 |
| `/history` / `/help` | 🟡 占位 | P1 |

---

## 🏗 目录结构

```
src/
├── api/
│   ├── http.ts              Axios + BusinessError + 401 单飞刷新 + pickActionLabel
│   ├── mock.ts              /api/* 全量对齐 v1.0 响应格式
│   └── {auth,parent,child,device,subscription,story,pdf}.ts
├── components/{LangSwitch,BrandLogo,EmptyState,CodeInput,AvatarPicker,AvatarImage}.vue
├── composables/{useCountdown,useApiError}.ts
├── config/{index,assets}.ts
├── i18n/locales/{zh,en,pl,ro}.ts
├── layouts/AuthLayout.vue
├── router/index.ts          hash 模式,17 路由(新增 OnboardChild + OnboardDone)
├── stores/{auth,locale}.ts
├── types/index.ts
├── utils/{storage,locale,time}.ts
├── views/
│   ├── auth/{Login,Register}View.vue
│   ├── onboard/{OnboardChild,OnboardDone}View.vue   ← 新增
│   ├── home/HomeView.vue
│   ├── children/{ChildrenList,ChildForm}View.vue
│   ├── devices/DevicesView.vue
│   ├── settings/SettingsView.vue
│   ├── stories/{StoriesList,StoryDetail,PdfExport}View.vue
│   ├── subscribe/{Subscribe,SubscribeSuccess,SubscribeCancel}View.vue
│   └── placeholder/PlaceholderView.vue
├── App.vue
└── main.ts

public/assets/    96 张 webp 素材(小熊/头像/UI/装饰),来自 monorepo 的 assets/
```

---

## ⏭ 下一阶段(已规划)

- **Stage 2**:服务端 MVP(Postgres + Prisma + Fastify),实现 batch 2/3 的 auth/device/child/parent 接口,H5 切真连
- **Stage 3**:TV 模拟器,本机起一个端口展示二维码 + 模拟"等待绑定 / 已绑定 / 识别到孩子" 状态
- **Stage 4**:一键启动脚本(WSL bash)+ 联调

---

## ⚙️ 环境变量参考

`.env.development`:

```bash
VITE_APP_TITLE=WonderBear
VITE_API_BASE_URL=http://localhost:3000   # 服务端地址(USE_MOCK=false 时生效)
VITE_API_PREFIX=/api
VITE_USE_MOCK=true                         # true=mock 拦截,false=走真服务端
VITE_DEFAULT_LOCALE=en                     # 浏览器未匹配时兜底
VITE_DEV_PORT=5174                         # 可选,默认 5174
```
