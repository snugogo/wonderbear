# WonderBear 资产命名规范 · NAMING_CONTRACT v7.4

> **更新日期**：2026-04-23
> **总资产**：116 张 WebP + 7 个 SVG
> **CDN**：`https://cdn.jsdelivr.net/gh/snugogo/wonderbear@main/assets/`
> **仓库**：https://github.com/snugogo/wonderbear

---

## 目录结构

```
assets/
├── bear/        小熊角色（透明背景 WebP，1024×1024）
├── bg/          页面背景（不透明 WebP，1536×1024）
├── ui/          UI图标装饰（透明背景 WebP）
├── svg/         线形功能图标（SVG，固定颜色）
├── avatar/      头像（透明背景 WebP，1024×1024）
├── deco/        装饰元素（透明背景 WebP，1024×1024）
├── story/       故事通用背景（不透明 WebP，1536×1024）
├── h5/          家长H5专用图（透明背景 WebP，1024×1024）
├── marketing/   营销图（不透明 WebP，1536×1024）
├── icon/        App图标套装（PNG + WebP）
└── NAMING_CONTRACT.md   本文件
```

**命名规则**：全小写 + 下划线 + 功能前缀。前缀即目录，`bear_` 在 `assets/bear/`，`bg_` 在 `assets/bg/`，以此类推。

---

## bear/ · 小熊角色（35张）

透明背景，1024×1024 WebP。所有动作图以 `bear_idle` 为角色锚点。

| 文件名 | 用途 | 质量 |
|---|---|---|
| `bear_idle.webp` | ⭐ 主角锚点，其他熊的参考图 | high |
| `bear_talk.webp` | 说话/朗读中 | high |
| `bear_welcome.webp` | 欢迎/打招呼 | high |
| `bear_qr_peek.webp` | 从角落探头，配合二维码页 | high |
| `bear_bow_curtain.webp` | 故事结尾谢幕鞠躬 | high |
| `bear_wave.webp` | 挥手（ActivationScreen常驻，CSS挥手动画）| medium |
| `bear_mouth_half.webp` | 嘴半开，说话中间帧 | medium |
| `bear_listen_headphones.webp` | 戴耳机聆听（DialogueScreen孩子说话时）| medium |
| `bear_think.webp` | 思考中（AI处理时）| medium |
| `bear_react_1.webp` | 对话反应：惊喜表情 | medium |
| `bear_react_2.webp` | 对话反应：开心大笑 | medium |
| `bear_react_3.webp` | 对话反应：满意点头 | medium |
| `bear_paint.webp` | 拿画笔创作（GeneratingScreen）| medium |
| `bear_studio.webp` | 在录音室/创作中（GeneratingScreen）| medium |
| `bear_read.webp` | 捧书阅读（LibraryScreen）| medium |
| `bear_reading_hero.webp` | 英雄式阅读（H5 OnboardChild页）| medium |
| `bear_sleep.webp` | 睡觉/结束 | medium |
| `bear_happy.webp` | 鞠躬/开心（含bow动作）| medium |
| `bear_sit.webp` | 端正坐着（HomeScreen装饰）| medium |
| `bear_cheer.webp` | 欢呼庆祝（StoryEndScreen）| medium |
| `bear_confused.webp` | 困惑/疑问（ErrorScreen）| medium |
| `bear_pointing.webp` | 手指指向（LearningScreen识字）| medium |
| `bear_error_oops.webp` | 出错/尴尬（ErrorScreen一般错误）| medium |
| `bear_no_network.webp` | 无网络（ErrorScreen网络错误）| medium |
| `bear_downloading.webp` | 下载/加载中（ErrorScreen下载状态）| medium |
| `bear_empty_box.webp` | 空状态（LibraryScreen无故事时）| medium |
| `bear_ranking_trophy.webp` | 拿奖杯（RankingScreen第1名）| medium |
| `bear_ranking_medal.webp` | 拿奖牌（RankingScreen第2-3名）| medium |
| `bear_world_map.webp` | 手持世界地图（LearningScreen）| medium |
| `bear_explore_together.webp` | 探索/出发（LearningScreen）| medium |
| `bear_my_home.webp` | 温馨居家（HomeScreen装饰）| medium |
| `bear_poland.webp` | 波兰OEM版本 | medium |
| `bear_romania.webp` | 罗马尼亚OEM版本 | medium |
| `bear_coming_soon.webp` | 建设中/敬请期待（ComingSoonScreen）| medium |

---

## bg/ · 背景图（12张）

不透明，1536×1024 WebP。所有TV页面必须使用背景图，禁止纯色CSS背景。

| 文件名 | 用途页面 | 质量 |
|---|---|---|
| `bg_activation.webp` | ⭐ 激活/扫码页（左侧白框=二维码叠加位置）| high |
| `bg_home_cozy.webp` | ⭐ TV首页（HomeScreen）| high |
| `bg_room.webp` | LibraryScreen / RankingScreen / ProfileScreen | medium |
| `bg_chat.webp` | DialogueScreen（对话创作）| medium |
| `bg_gen.webp` | GeneratingScreen（故事生成中）| medium |
| `bg_bedtime.webp` | StoryEndScreen（故事结尾）| medium |
| `bg_meadow.webp` | LearningScreen（语言探索）| medium |
| `bg_welcome.webp` | ErrorScreen / ComingSoonScreen | medium |
| `bg_welcome_fullscreen.webp` | 全屏欢迎，可叠加内容 | medium |
| `bg_forest.webp` | 故事场景备用背景 | medium |
| `bg_seaside.webp` | 故事场景备用背景 | medium |

---

## ui/ · UI图标装饰（23张）

透明背景 WebP。

| 文件名 | 用途 |
|---|---|
| `ui_home_create.webp` | TV首页功能卡：开始故事 |
| `ui_home_stories_map.webp` | TV首页功能卡：故事地图 |
| `ui_home_library.webp` | TV首页功能卡：我的书架 |
| `ui_home_explore.webp` | TV首页功能卡：冒险探索 |
| `ui_home_profile.webp` | TV首页功能卡：孩子档案 |
| `ui_home_cast.webp` | TV首页功能卡：投屏分享 |
| `ui_coin.webp` | 顶部栏金币图标（静态）|
| `ui_coin_burst.webp` | 获得积分爆开动画 |
| `ui_mic.webp` | 麦克风静默待机态 |
| `ui_mic_active.webp` | 麦克风收音激活态（配呼吸动画）|
| `ui_loading.webp` | 全局加载状态（替代原生spinner）|
| `ui_remote.webp` | TV帮助页遥控器示意 |
| `ui_char_bubble.webp` | 对话气泡 |
| `ui_finger_point.webp` | 引导箭头 |
| `ui_qr_frame.webp` | 二维码装饰边框（ActivationScreen）|
| `ui_player_play.webp` | 播放按钮 |
| `ui_player_pause.webp` | 暂停按钮 |
| `ui_player_prev.webp` | 上一页 |
| `ui_player_next.webp` | 下一页 |
| `ui_progress_bar.webp` | 进度条装饰 |
| `ui_heart_favorite.webp` | 收藏心形 |
| `ui_download.webp` | 下载按钮 |
| `ui_checkmark.webp` | 对勾确认（装饰版）|

---

## svg/ · 线形功能图标（7个）

固定颜色SVG，不依赖currentColor。

| 文件名 | 颜色 | 用途 |
|---|---|---|
| `ui_check.svg` | 绿 `#52C77A` | 表单确认、已完成 |
| `ui_check_circle.svg` | 绿 `#52C77A` + 淡绿背景 | 成功状态徽章 |
| `ui_arrow_back.svg` | 橙 `#FF8A3D` + 淡橙背景 | 导航返回按钮 |
| `ui_settings.svg` | 蓝 `#4A90E2` + 淡蓝背景 | 设置入口 |
| `ui_envelope.svg` | 橙 `#FF8A3D` | 支持邮箱 |
| `ui_star_outline.svg` | 琥珀 `#E8A658` | 未收藏状态 |
| `ui_star_filled.svg` | 金 `#E8C878` + 光晕 | 已收藏状态 |

---

## avatar/ · 头像（17张）

透明背景，1024×1024 WebP。

### 小熊变体（12张）
`avatar_bear_classic` / `avatar_bear_pink` / `avatar_bear_blue` / `avatar_bear_mint` / `avatar_bear_crown` / `avatar_bear_star` / `avatar_bear_scarf` / `avatar_bear_glasses` / `avatar_bear_doctor` / `avatar_bear_chef` / `avatar_bear_pilot` / `avatar_bear_painter`

### 动物朋友（5张）
`avatar_cat` / `avatar_dog` / `avatar_rabbit` / `avatar_fox` / `avatar_owl`

---

## deco/ · 装饰元素（9张）

透明背景，1024×1024 WebP。用作漂浮动画层。

| 文件名 | 使用场景 |
|---|---|
| `deco_stars.webp` | StoryEndScreen、GeneratingScreen漂浮星星 |
| `deco_confetti.webp` | StoryEndScreen撒花庆祝 |
| `deco_sparkles.webp` | GeneratingScreen魔法粒子 |
| `deco_coins.webp` | 获得积分金币飞出动画 |
| `deco_hearts.webp` | 故事结尾爱心漂浮 |
| `deco_cloud.webp` | 加载页、生成页云朵飘动 |
| `deco_podium.webp` | RankingScreen颁奖台 |
| `deco_ribbon.webp` | RankingScreen彩带装饰 |
| `deco_dots.webp` | 通用页面点缀装饰 |

---

## story/ · 故事通用背景（3张）

不透明，1536×1024 WebP。故事播放页按故事内容切换。

`story_generic_forest` / `story_generic_sky` / `story_generic_ocean`

---

## h5/ · 家长H5专用图（10张）

透明背景，1024×1024 WebP。

| 文件名 | 用途页面 |
|---|---|
| `h5_onboard_welcome.webp` | H5引导页欢迎 |
| `h5_empty_children.webp` | 空状态：未添加孩子 |
| `h5_empty_stories.webp` | 空状态：暂无故事 |
| `h5_scan_qr_guide.webp` | 扫码引导说明 |
| `h5_success_subscribed.webp` | 订阅成功 |
| `h5_payment_stripe.webp` | Stripe支付装饰 |
| `h5_payment_paypal.webp` | PayPal支付装饰 |
| `h5_pdf_ready.webp` | 绘本PDF已就绪 |
| `h5_share_link.webp` | 分享链接 |
| `h5_error_network.webp` | 网络错误 |

---

## marketing/ · 营销图（7张）

不透明，1536×1024 WebP。经销商/官网用，不进APP。

`marketing_hero_projector` / `marketing_bedroom_scene` / `marketing_family_time` / `marketing_creation_flow` / `marketing_bilingual_learning` / `marketing_vs_phone` / `marketing_gift_christmas`

---

## icon/ · App图标套装（11张）

| 文件名 | 尺寸 | 用途 |
|---|---|---|
| `app_icon_master.webp` | 1024×1024 | 主图源 |
| `app_icon_1024.png` | 1024×1024 | 应用商店上架 |
| `app_icon_512.png` | 512×512 | Google Play |
| `app_icon_192.png` | 192×192 | PWA标准 |
| `app_icon_144.png` | 144×144 | Android xxhdpi |
| `app_icon_96.png` | 96×96 | Android xhdpi |
| `app_icon_72.png` | 72×72 | Android hdpi |
| `app_icon_48.png` | 48×48 | Android mdpi |
| `app_icon_adaptive_bg.png` | — | Android 8+自适应背景层 |
| `app_icon_adaptive_fg.png` | — | Android 8+自适应前景层 |
| `app_icon_notification.png` | — | 通知栏图标（单色）|

---

## CDN访问规则

```
完整URL = https://cdn.jsdelivr.net/gh/snugogo/wonderbear@main/assets/{目录}/{文件名}

示例：
bear_idle    → .../assets/bear/bear_idle.webp
bg_home_cozy → .../assets/bg/bg_home_cozy.webp
ui_check     → .../assets/svg/ui_check.svg
```

push到git后5-10分钟CDN自动生效。

---

## 开发引用规范

```js
// TV端（jsDelivr CDN）
const CDN = 'https://cdn.jsdelivr.net/gh/snugogo/wonderbear@main/assets'
const bearIdle = `${CDN}/bear/bear_idle.webp`

// H5端（本地public/assets/）
import { asset } from '@/config/assets'
<img :src="asset('bear.idle')" />
```

**绝对禁止**：
- ❌ UI中出现任何emoji（🐻🧸🎉❤🎤★🪙等）
- ❌ 页面用纯色CSS背景（有bg_图的页面必须用图）
- ❌ 图片加载失败用emoji fallback（用纯色方块+字母代替）

---

---

## 三端使用指引

### 设计师
- 新图按本文件的命名规则和目录存放，push到git的`assets/`目录
- 改名必须找创始人批准，不要自己改
- push完在CHANGELOG加一行

### TV / H5 开发者
- 文件名直接照这里抄，CDN push后5-10分钟生效
- 图还没到位时先用CSS占位（纯色方块+字母），**禁止用emoji**
- 发现需要新图：告诉创始人，不要自己造SVG或改名

### 创始人
- 任何改名/新增/弃用由你最终拍板
- 每次有变更在CHANGELOG加一行，日期+内容
- 发现谁擅自改文件名立即回退

---

## 文档更新规则

1. **文件名一旦确定不可擅自改** — 改名会破坏所有引用它的代码
2. **新增图片** — 在对应目录章节追加一行，CHANGELOG记录
3. **弃用图片** — 标注`（已弃用）`，不要删行，CHANGELOG记录
4. **改名** — 必须创始人批准，同步更新所有引用代码，CHANGELOG记录

---

## CHANGELOG

### 2026-04-23 · v7.4
- 新增 `bear/bear_bow_curtain.webp`（故事谢幕鞠躬）
- 新增 `bg/bg_home_cozy.webp`（TV首页专用背景）
- 新增 `bg/bg_activation.webp`（激活/扫码页背景）
- 新增 `svg/` 目录，7个线形SVG图标全部完成
- 完善各页面图片使用规范和背景图分配

### 2026-04-22 · v7.3
- 新增 `ui/ui_home_create/stories_map/library/explore/profile/cast.webp`（TV首页6张功能卡）
- 新增 `ui/ui_coin.webp`（静态金币）
- 新增 `ui/ui_mic_active.webp`（麦克风激活态）
- 新增 `bear/bear_coming_soon.webp`（敬请期待）

### 2026-04-21 · v7.0
- 初始版本，96张图完整生成并推git
- 包含bear(32张)/bg(9张)/ui(15张)/deco(9张)/h5(10张)/avatar(17张)/story(3张)/icon(1张)/marketing(7张)
