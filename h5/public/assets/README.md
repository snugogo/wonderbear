# WonderBear 视觉素材目录

这里是**本地开发**用的资源目录。按 `WonderBear_素材对接文档_前端版 v7` 的清单放置。

## 引用方式

Vue 代码里通过 `src/config/assets.ts` 提供的 `asset(key)` 函数统一引用,**不要写死路径**:

```ts
import { asset } from '@/config/assets';

// 正确
<img :src="asset('bear.idle')" />
<img :src="asset('h5.emptyChildren')" />

// 错误
<img src="/assets/bear/bear_idle.webp" />
```

开发期会拼成 `/assets/bear/bear_idle.webp`,生产自动切到 `https://assets.wonderbear.app/static/bear/bear_idle.webp`。

## 目录速查

| 目录 | 内容 | 数量 | 格式 |
|---|---|---|---|
| `bear/` | 小熊角色(idle/welcome/read/...) | 32 | WebP 透明 1024×1024 |
| `bg/` | 页面背景 | 9 | WebP 不透明 1536×1024 |
| `story/` | 故事兜底场景 | 3 | WebP |
| `ui/` | UI 控件(播放器按钮、二维码框等) | 15 | WebP 透明 |
| `deco/` | 装饰素材(星星、彩屑) | 9 | WebP 透明 |
| `avatar/` | 孩子档案头像(12 小熊变体 + 5 动物) | 17 | WebP 圆形 |
| `h5/` | **家长 H5 专属**(空状态 / 支付 / PDF 完成 / 错误) | 10 | WebP |
| `icon/` | APP 图标套装 | 9 | PNG 多尺寸 |
| `marketing/` | 官网电商营销图 | 7 | PNG 高清 |

## 图还没生成怎么办

当前 H5 已做了**降级处理**:
- `EmptyState.vue` / `BrandLogo.vue` 图片加载失败 → 显示 emoji 兜底
- 所有小熊插画位置都能降级,不会白板

所以图**陆续到位**即可,按文件名直接扔进对应目录,刷新页面就能看到。

## 文件命名必须严格对齐

必须和 `WonderBear_素材对接文档_前端版 v7` §二/§三/§四 的 "文件名" 列完全一致,否则引用不到。

示例(家长 H5 最先用到的 10 张):

```
h5/
├── h5_onboard_welcome.webp
├── h5_empty_children.webp
├── h5_empty_stories.webp
├── h5_scan_qr_guide.webp
├── h5_success_subscribed.webp
├── h5_payment_stripe.webp
├── h5_payment_paypal.webp
├── h5_pdf_ready.webp
├── h5_share_link.webp
└── h5_error_network.webp
```
