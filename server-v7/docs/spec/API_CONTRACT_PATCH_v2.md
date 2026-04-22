# API_CONTRACT.md 增补 patch

> **来源**:`TO_SERVER_hash_route.md` v2(协议变更 v2)
> **日期**:2026-04-21
> **白名单合规**:不修改任何现有接口字段名、错误码、Token 结构
> **变更面**:§11.1 OemConfig 类型加一个字段、§14 末尾追加新章节 §14.5

---

## 操作 1:修改 §11.1(OemConfig 类型定义)

### 定位

打开 `API_CONTRACT.md`,搜索 `### 11.1` 找到 `GET /api/oem/config`。
看里面的 `interface OemConfig` 结构体。

### 修改内容

在 `OemConfig` 接口的字段列表末尾(`assetBundleVersion` / `assetBundleUrl` 之后,如果有 `active` 字段就在 `active` 之前)插入:

```ts
  /**
   * Parent H5 base URL for TV QR binding links. NO trailing slash.
   * TV appends `/#/register?device={deviceId}&code={activationCode}` to build
   * the QR code URL. Default `https://h5.wonderbear.app` for non-OEM devices.
   * See §14.5 for full URL spec and short-name vs long-name field rationale.
   */
  h5BaseUrl: string;
```

如果 `OemConfig` 接口看起来是这样:
```ts
interface OemConfig {
  oemId: string;
  brandName: { zh: string; en: string; pl: string; ro: string; };
  logoUrl: string | null;
  colors: { primary: string; secondary: string; accent: string; };
  menus: Record<string, boolean>;
  assetBundleVersion: string;
  assetBundleUrl: string | null;
}
```

改完应该是:
```ts
interface OemConfig {
  oemId: string;
  brandName: { zh: string; en: string; pl: string; ro: string; };
  logoUrl: string | null;
  colors: { primary: string; secondary: string; accent: string; };
  menus: Record<string, boolean>;
  assetBundleVersion: string;
  assetBundleUrl: string | null;
  /**
   * Parent H5 base URL for TV QR binding links. NO trailing slash.
   * TV appends `/#/register?device={deviceId}&code={activationCode}` to build
   * the QR code URL. Default `https://h5.wonderbear.app` for non-OEM devices.
   * See §14.5 for full URL spec and short-name vs long-name field rationale.
   */
  h5BaseUrl: string;
}
```

### 同时更新 §11.1 的示例 Response JSON

如果 §11.1 里有 `Response 200` 的 JSON 示例,在 `data` 对象里也加一行:
```json
"h5BaseUrl": "https://h5.wonderbear.app",
```

---

## 操作 2:在 §14 末尾追加 §14.5

### 定位

打开 `API_CONTRACT.md`,搜索 `### 14.4` (Webhook 可靠性) — 这是 §14 当前的最后一节。
在 §14.4 整段结束之后、`---` 分隔线之前,**追加**以下全部内容:

---

```markdown
### 14.5 TV 扫码绑定 URL 规范

TV 端激活页生成的绑定二维码 URL,**必须严格遵循**以下格式:

```
{h5BaseUrl}/#/register?device={deviceId}&code={activationCode}
```

#### 字段来源

| URL 片段 | 来源 |
|---|---|
| `h5BaseUrl` | `GET /api/oem/config` 返回的 `OemConfig.h5BaseUrl`,默认 `https://h5.wonderbear.app` |
| `device` | TV 硬件 deviceId,与 `POST /api/device/register` 请求体里的 `deviceId` 完全相同 |
| `code` | 激活码,与 `POST /api/device/register` 请求体里的 `activationCode` 完全相同 |

#### URL 参数名 vs API 字段名

**URL 里用短名 `device` / `code`,API 请求体里用长名 `deviceId` / `activationCode`**。
这不是字段重命名 — H5 侧从 URL 读短名、提交 `POST /api/auth/register` 时改用长名。
服务端所有接口永远只接受长名。

| 位置 | 参数名 |
|---|---|
| TV 二维码 URL | `device`, `code` |
| `POST /api/auth/register` request body | `deviceId`, `activationCode` |
| `POST /api/device/register` request body | `deviceId`, `activationCode` |
| `POST /api/device/bind` request body | `deviceId`, `activationCode` |

#### 为什么 URL 用短名

1. **QR 码密度**:URL 越短码元越少,TV 屏幕上扫码更稳
2. **防 App 内嵌浏览器截断**:部分国外 App 对长 URL 做处理
3. **对齐 H5 既定约定**:见 `H5_HANDOFF.md §96`

#### 为什么 hash 模式(`#/register`)

H5 使用 Vue Router `createWebHashHistory`(见 `H5_HANDOFF.md §Vue Router 4`)。
非 hash URL 的 query 参数在 hash 路由模式下 H5 侧取不到,扫码激活链路直接断掉。

#### H5 侧处理示例

```ts
// pages/Register.vue
const route = useRoute();
const deviceId = route.query.device as string;        // URL 里是短名
const activationCode = route.query.code as string;

// 提交时映射到 API 字段名
await api.post('/auth/register', {
  email, code, password,
  deviceId,         // API 里是长名
  activationCode,
  locale,
});
```

#### TV 侧生成示例

```ts
// 拿到 oemConfig 之后
const baseUrl = oemConfig?.h5BaseUrl ?? 'https://h5.wonderbear.app';
const qrUrl = `${baseUrl}/#/register?device=${encodeURIComponent(deviceId)}&code=${encodeURIComponent(activationCode)}`;
// 用 qrUrl 渲染二维码
```

#### 服务端职责

服务端 **不参与** URL 拼接,只负责:
- 在 `OemConfig` 表存 `h5BaseUrl` 字段(默认 `https://h5.wonderbear.app`)
- 通过 `GET /api/oem/config` 返回给 TV
- 接收 `POST /api/auth/register` / `POST /api/device/register` / `POST /api/device/bind` 时,继续只接受长名 `deviceId` / `activationCode` —— 字段名零变化
```

---

## 操作 3(可选):更新 §十五 变更历史

如果 `API_CONTRACT.md` 末尾有"变更历史"或"版本"小节,追加一行:

```markdown
| v1.1 | 2026-04-21 | 增补 §14.5 TV 扫码绑定 URL 规范;OemConfig 加 h5BaseUrl 字段 |
```

---

## 校验清单

贴完之后建议自查:

- [ ] §11.1 的 `OemConfig` 接口确实多了 `h5BaseUrl: string` 字段
- [ ] §14.5 整章节出现在 §14.4 后、§十五 前
- [ ] 没有动 §四(认证)、§五(设备)、§六(孩子)的任何字段
- [ ] 没有改 §二(错误码表)
- [ ] §14.5 里"URL 参数名 vs API 字段名"的表格清楚列出 `device`/`code` 是 URL 短名、`deviceId`/`activationCode` 是 API 长名

## 同步知会

贴完之后:
- ✅ TV 窗口已经知道(`TO_TV_hash_route.md v2` 已发)
- ✅ H5 窗口已经知道(`H5_HANDOFF.md §96` 是上游)
- ✅ 服务端窗口已经知道(本 patch 即结果)

三方对齐完成,无需额外通知。
