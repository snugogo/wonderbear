# WonderBear 视觉资产命名契约(NAMING_CONTRACT)

> **这是"合约",不是"建议"**。设计师/开发者/创始人三方对齐的权威来源。
>
> **状态图例**:⏳ 待画 | 🎨 画中 | 🟡 返工中 | ✅ 已交付并在 git | ⛔ 弃用
>
> **改动规则**:
> 1. 文件名一旦进入本文档,**不可擅自修改**
> 2. 任何 rename / 新增 / 弃用 都需经创始人批准
> 3. 所有改动在**文档底部 CHANGELOG** 里记一行,带日期和原因
> 4. 状态变更(例如 ⏳ → ✅)设计师交付后即时更新
>
> **仓库**:https://github.com/snugogo/wonderbear
> **本文档路径**:`assets/NAMING_CONTRACT.md`
> **最后更新**:2026-04-23

---

## 🎨 风格基调(必读,所有新图都要遵守)

项目已有 **96 张插画 + 11 张 Logo**,风格必须跟现有素材保持一致:

- **主色**:`#FF8A3D` 橙、`#4A90E2` 蓝、`#FFF8F0` 米白
- **辅助色**:奶油 `#F5E6D3`、蜜桃 `#F5BFA3`、琥珀 `#E8A658`、软粉 `#F4B5C4`、天蓝 `#B8D8E8`、薄荷 `#B8E0D2`、金色 `#E8C878`
- **插画风格**:水彩 / 毛绒绘本质感,圆润、柔和、饱和度适中
- **主角**:一只奶白色毛绒小熊(参考 `assets/icon/app_icon_master.webp` 或 `assets/bear/bear_idle.webp`)
- **忌**:
  - ❌ 不要扁平 Material Design 风
  - ❌ 不要迪士尼/卡通网大眼睛风
  - ❌ 不要像素风或矢量硬边
  - ❌ 不要过度装饰,孩子会分心

---

## 📋 交付格式规范

| 用途 | 格式 | 说明 |
|---|---|---|
| UI 图标(扁平) | **SVG** | 可上色、任意缩放,首选 |
| UI 图标(精细/带光影) | **WebP** | 提供 @1x + @2x 两份 |
| 角色插画 | **WebP** | 提供 @2x 版本(TV 1080p 屏用) |
| 系统级图标(Logo 等) | **PNG** + **WebP** | PNG 给 iOS/Android 系统用,WebP 给 Web UI 用 |
| 所有图片 | **透明背景**(除非明确要背景) | |

**命名规则**:全小写,下划线分隔,按功能分组:
- `home-create.webp` → `assets/ui/home-create.webp` ❌
- `ui_home_create.webp` → `assets/ui/ui_home_create.webp` ✅

---

## ✅ 已有资产(不用重做)

### WonderBear Logo(已齐全,11 张)

路径:`assets/icon/`

| 文件 | 尺寸 | 用途 |
|---|---|---|
| `app_icon_master.webp` | 1024×1024 WebP | 主图源(毛绒质感) |
| `app_icon_1024.png` | 1024×1024 | 高清主图(应用商店上架用) |
| `app_icon_512.png` | 512×512 | Android Play Store |
| `app_icon_192.png` | 192×192 | Android PWA 标准 |
| `app_icon_144.png` | 144×144 | Android xxhdpi |
| `app_icon_96.png` | 96×96 | Android xhdpi |
| `app_icon_72.png` | 72×72 | Android hdpi |
| `app_icon_48.png` | 48×48 | Android mdpi |
| `app_icon_adaptive_bg.png` | - | Android 8+ adaptive icon 背景层 |
| `app_icon_adaptive_fg.png` | - | Android 8+ adaptive icon 前景层 |
| `app_icon_notification.png` | - | 通知栏图标(单色) |

**✅ 足够覆盖**:PWA、Android APK、iOS App 图标、通知图标、启动屏。**不用新做**。

---

## 🔴 P0 必做(本周完成,阻塞开发)

### A. TV 首页功能卡片图标(6 张,一套系列)

**项目**:TV 首页 `HomeScreen` 6 张功能入口卡。
**现状**:代码里全用 emoji(🎨🗺📚🏆🏠📺)当图标,投影到电视上像素化严重。
**要求**:**必须是同一视觉系列**,有整体感。

| # | 卡片 | 用途 | 文件路径(@1x) | 文件路径(@2x) | 状态 |
|---|---|---|---|---|---|
| 1 | **开始故事** | 进入创作对话,孩子讲故事生成绘本 | `assets/ui/ui_home_create.webp` | `assets/ui/ui_home_create@2x.webp` | ⏳ |
| 2 | **故事地图** | 进入已完成故事的地图视图 | `assets/ui/ui_home_stories_map.webp` | `assets/ui/ui_home_stories_map@2x.webp` | ⏳ |
| 3 | **我的书架** | 进入故事库 LibraryScreen | `assets/ui/ui_home_library.webp` | `assets/ui/ui_home_library@2x.webp` | ⏳ |
| 4 | **冒险探索** | 语言学习/探索模式 | `assets/ui/ui_home_explore.webp` | `assets/ui/ui_home_explore@2x.webp` | ⏳ |
| 5 | **孩子档案** | 切换/管理孩子 | `assets/ui/ui_home_profile.webp` | `assets/ui/ui_home_profile@2x.webp` | ⏳ |
| 6 | **投屏分享** | 投屏到其他设备 | `assets/ui/ui_home_cast.webp` | `assets/ui/ui_home_cast@2x.webp` | ⏳ |

**尺寸**:
- **@1x: 120×120px WebP**
- **@2x: 240×240px WebP**(必须同时交付)
- 透明背景

**风格要求**:同一卡片装饰元素 + 项目色板配色 + 3-8 岁孩子易懂 + TV 远距离轮廓清晰

---

### B. ~~TV 场景小熊 @2x 大图~~ ✅ 不需要做

**更新(2026-04-22 复查)**:经过对 `assets/` 仓库实际图片像素的扫描,**所有熊图均为 1024×1024 WebP**,图源对 1080p TV 绰绰有余,**设计师不需要重做任何熊图**。

~~原任务内容已删除~~

真正的问题是 TV 代码里 CSS 容器尺寸定得太小(220-280px),这是 TV 开发窗口的 CSS 修改任务,跟设计师无关。

---

### C. 基础 SVG 图标套组(7 个)

**用途**:UI 里替换 emoji(✓、←、⚙、✉、★ 等符号字符)。

**要求**:SVG 单色线形(`fill="currentColor"`),48×48 viewBox,线条粗细统一

| # | 图标 | 文件路径 | 用途 | 状态 |
|---|---|---|---|---|
| 1 | 对勾 | `assets/ui/ui_check.svg` | 确认、已订阅、表单通过 | ⏳ |
| 2 | 圆形对勾 | `assets/ui/ui_check_circle.svg` | 成功状态徽章 | ⏳ |
| 3 | 左箭头/返回 | `assets/ui/ui_arrow_back.svg` | 导航栏返回按钮 | ⏳ |
| 4 | 齿轮/设置 | `assets/ui/ui_settings.svg` | 设置入口 | ⏳ |
| 5 | 信封/邮件 | `assets/ui/ui_envelope.svg` | 支持邮箱 | ⏳ |
| 6 | 空心星 | `assets/ui/ui_star_outline.svg` | 未收藏 | ⏳ |
| 7 | 实心星 | `assets/ui/ui_star_filled.svg` | 已收藏 | ⏳ |

---

### D. 金币/积分图标(2 张)

**用途**:TV 顶部栏显示孩子积分余额。

| # | 图标 | 文件路径(@1x) | 文件路径(@2x) | 状态 |
|---|---|---|---|---|
| 1 | 静态金币 | `assets/ui/ui_coin.webp` | `assets/ui/ui_coin@2x.webp` | ⏳ |
| 2 | 麦克风(收音中) | `assets/ui/ui_mic_active.webp` | - | ⏳ |

**已有但确认复用**(✅ 已在 git):
- `assets/ui/ui_coin_burst.webp`(获得积分动画)— 开发接上即可
- `assets/ui/ui_mic.webp`(静默麦克风)— 开发接上即可

---

## 🟡 P1 应做(下周完成,提升完成度)

### E. TV 3 个未开发卡片的"敬请期待"插画

**背景**:TV 首页 6 张卡里有 3 张 `enabled: false`(故事地图、冒险探索、投屏分享),点进去要显示"敬请期待"屏。

| # | 文件路径 | 尺寸 | 状态 |
|---|---|---|---|
| 1(必做) | `assets/bear/bear_coming_soon.webp` | 600×600 | ⏳ |

或者各做 1 张针对性插画(可选):

| # | 文件路径 | 对应卡 | 状态 |
|---|---|---|---|
| 2(可选) | `assets/bear/bear_world_map_soon.webp` | 故事地图 | ⏳ |
| 3(可选) | `assets/bear/bear_explorer_soon.webp` | 冒险 | ⏳ |
| 4(可选) | `assets/bear/bear_cast_soon.webp` | 投屏 | ⏳ |

### F. 小熊 Logo 单色版本(用于二维码中心)

**用途**:TV ActivationScreen 二维码正中央嵌的品牌标识。

| # | 文件路径 | 格式 | 状态 |
|---|---|---|---|
| 1 | `assets/icon/logo_mono.svg` | SVG 64×64,可染色 | ⏳ |

基于已有 `app_icon_master.webp` 做单色简化版,保留耳朵+头形轮廓。

---

## 🟢 P2 加分项(非紧急)

### G. 已有 15 张 ui_*.webp 的 @2x 版本

现有 `assets/ui/` 15 张图,UI 代码用到的 5 张,估计都是 @1x。如果是 96/128px,在 TV 上放大会糊。

**清单**(只列代码真实用到的):
- `ui_mic.webp` → 需要 @2x 192×192
- `ui_char_bubble.webp` → 需要 @2x
- `ui_finger_point.webp` → 需要 @2x
- `ui_qr_frame.webp` → 需要 @2x
- `ui_player_play.webp` → 需要 @2x(TV 播放器精细化时用)

**建议**:一起导出 @2x,交付时覆盖同名文件。

---

### H. 背景图系列(可选)

代码里现有 `bg/bg_*.webp` 9 张,代码只用了 7 张,2 张冷门(bg_forest、bg_seaside)未分配场景。

如果**设计师觉得有余力**,可以做:
- **TV DialogueScreen 专用背景** `bg_dialogue_studio.webp`(温馨书房/魔法小屋氛围)
- **TV HomeScreen 专用背景** `bg_home_cozy.webp`(主页背景,现在是纯色)

尺寸:1920×1080 WebP。

---

## 📂 Git 推送规范

1. 所有新文件放 `assets/<子目录>/` 下
2. 文件名全小写,下划线,按功能前缀分组
3. push 后 5-10 分钟 CDN 自动生效(`https://cdn.jsdelivr.net/gh/snugogo/wonderbear@main/assets/...`)
4. 如果**覆盖现有文件**(比如 @2x 重做),跟 PM 沟通后再推,避免开发方正在引用 @1x

---

## ⏱ 预计工时

| 任务 | 估时 |
|---|---|
| A. TV 首页 6 张卡片图标(@1x + @2x,12 文件) | 1.5-2 天 |
| ~~B. 5 张熊图重做 @2x~~ | ~~已取消(图源已经是 1024×1024)~~ |
| C. 7 个 SVG 图标 | 半天 |
| D. 金币 + 麦克风激活态 | 半天 |
| E. 敬请期待插画 1-4 张 | 半天-1 天 |
| F. 单色 Logo SVG | 2 小时 |
| G. UI @2x | 半天(如果有源文件) |
| H. 背景图(可选) | 1 天 |

**P0 全做完:约 2-3 个工作日**(少一项 B,省了 1 天)

---

## ❓ 交付前确认清单(给设计师自查)

- [ ] 文件格式符合规范(SVG/WebP/PNG)
- [ ] 文件名符合命名规则(小写+下划线+功能前缀)
- [ ] 透明背景(除非明确要求保留背景)
- [ ] 风格跟现有 96 张素材一致(毛绒水彩,不是扁平矢量)
- [ ] 配色在项目色板内
- [ ] @2x 版本文件名带 `@2x` 后缀或同名存不同目录
- [ ] 导出时做过压缩(WebP 质量 80-85,避免过大)
- [ ] push 到 git 后用 CDN URL 实际打开确认能正常显示

---

**结束**。有问题或素材不明确的,跟 PM(创始人)直接沟通,不要自己脑补需求。

---

## 📊 快速索引:当前所有待办状态

**P0 清单**(总计 22 个文件 / 7 个 SVG):

| 批次 | 总数 | ⏳ 待画 | 🎨 画中 | ✅ 已交付 |
|---|---|---|---|---|
| A. TV 首页 6 卡(含 @2x) | 12 | 12 | 0 | 0 |
| C. 基础 SVG 图标 | 7 | 7 | 0 | 0 |
| D. 金币 + 麦克风 | 3 | 3 | 0 | 0 |
| **P0 总计** | **22** | **22** | **0** | **0** |

**P1 清单**:

| 批次 | 总数 | ⏳ | 🎨 | ✅ |
|---|---|---|---|---|
| E. 敬请期待插画 | 1-4 | 1-4 | 0 | 0 |
| F. 单色 Logo SVG | 1 | 1 | 0 | 0 |

---

## 🔄 文档更新流程

### 📌 什么时候更新这个文档?

| 触发事件 | 谁来改 | 改什么 |
|---|---|---|
| 设计师开始画一批图 | 设计师 | ⏳ → 🎨 |
| 设计师 push 图到 git | 设计师 | 🎨 → ✅ |
| 创始人决定加新需求 | 创始人 | 追加新行,状态 ⏳ |
| 某图被返工重画 | 任一方告知创始人 | ✅ → 🟡 |
| 某图被弃用/替换 | 创始人 | 标记 ⛔,加 CHANGELOG |
| 文件名变更 | **必须创始人批准** | rename + CHANGELOG |

### 📌 修改规则(严格)

1. **文件名不可擅自 rename** — 任何改动都会破坏代码和设计师的契约
2. **所有状态变更必须 commit 本文档** — 否则其他人看不到
3. **CHANGELOG 必须加一行** — 日期 + 动作 + 原因

### 📌 修改示例

```bash
# 场景:设计师画完 ui_home_create 这一张,推图 + 改状态
cd /e/AI/software/story/wonderbear
# 1. 推图
cp /path/to/new/ui_home_create.webp assets/ui/
cp /path/to/new/ui_home_create@2x.webp assets/ui/
# 2. 改 NAMING_CONTRACT.md 里对应行的状态 ⏳ → ✅
# 3. 底部 CHANGELOG 加一行
# 4. 统一 commit
git add assets/ui/ui_home_create* assets/NAMING_CONTRACT.md
git commit -m "feat(assets): deliver ui_home_create + @2x"
git push
```

---

## 📜 CHANGELOG(按时间倒序,最新在上)

### 2026-04-23
- [+] 文档升级为正式 NAMING_CONTRACT(原 DESIGNER_ASSETS_TODO_v2)
- [+] 所有资产加状态标记 ⏳/🎨/🟡/✅/⛔
- [+] 文件路径统一为 `assets/<子目录>/<文件名>` 完整形式
- [+] 新增 CHANGELOG 段

### 2026-04-22
- [+] 初版资产清单(DESIGNER_ASSETS_TODO_v2)
- [+] 确认任务 B(熊图重做 @2x)不需要,已有 1024×1024 图源充足
- [✅] app_icon 系列 11 张交付(`app_icon_48/72/96/144/192/512/1024.png` + `adaptive_bg/fg.png` + `notification.png` + `master.webp`)

---

## 🎯 给三端的使用指引

### 设计师

- **每次画新图前**:查这里的 ⏳ 清单,按优先级 A → C → D → E → F 挑
- **每次 push 图后**:顺手 `⏳ → ✅` + 加 CHANGELOG
- **需要改名**:**找创始人批准**,不要自己改

### H5 / TV 开发者

- **写代码引用图时**:文件名直接照这里抄,**即使状态是 ⏳ 也能用**(代码先写,图后到,CDN 10 分钟生效)
- **发现需要新图**:**不要自己加文件名**,告诉创始人新增需求
- **发现某图在 git 上没找到**:查这里的状态,如果 ⏳ → 等设计师;如果 ✅ → 报告创始人"图丢了"

### 创始人

- **每周五看一眼这个文档**:统计 ⏳ 数量,跟进设计师进度
- **决策仲裁**:任何改名/新增/弃用,由你最终拍板
- **强制纪律**:看到谁擅自改文件名,立即回退
