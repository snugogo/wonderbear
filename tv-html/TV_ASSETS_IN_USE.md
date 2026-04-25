# TV 端正在使用的图片资产清单

> 自动生成于 iter13l 系列改动后（手工 + AI 编辑均已纳入）。
> 用于校对 `WonderBear_资产文件名规则_v7.x.md`：
>   - **此文档列出的每一个文件名都必须在资产规则文档里存在**（且 CDN 链接可达）。
>   - 规则文档里有但本表里没有的文件，是别端在用，不归 TV 管。
>   - 规则文档里没有、本表里有 → 缺失，需要补充进规则文档。
>
> 路径前缀（统一）：`https://cdn.jsdelivr.net/gh/snugogo/wonderbear/assets/`
> 代码里通过 `asset('<dir>/<file>.webp')` 引用，源在 `tv-html/src/utils/assets.ts`。

---

## 1. bg/ — 背景水彩底图

| 文件 | 用在哪 |
|---|---|
| `bg_activation.webp` | ActivationScreen 全屏背景 |
| `bg_bedtime.webp` | StoryEndScreen 全屏；DialogueScreen 3A 太空主题卡 |
| `bg_forest.webp` | StoryCoverScreen 默认 cover 兜底 |
| `bg_gen.webp` | GeneratingScreen 全屏背景 |
| `bg_home_cozy.webp` | HomeScreen 全屏；CreateScreen 全屏；DialogueScreen 3A 家场景卡 |
| `bg_meadow.webp` | LearningScreen 全屏背景 |
| `bg_room.webp` | LibraryScreen 全屏背景；ProfileScreen 全屏背景 |
| `bg_seaside.webp` | （Gallery seed 用做绘本页底图） |
| `bg_welcome.webp` | OfflineScreen 全屏；ErrorScreen 全屏 |

## 2. bear/ — 小熊立绘

| 文件 | 用在哪 |
|---|---|
| `bear_bow_curtain.webp` | StoryEndScreen 鞠躬动画第二帧 |
| `bear_cheer.webp` | StoryCoverScreen 主立绘 |
| `bear_coming_soon.webp` | GeneratingScreen 走在进度条上的小熊 |
| `bear_confused.webp` | ErrorScreen（多种错误码 mapping） |
| `bear_empty_box.webp` | LibraryScreen 空态 |
| `bear_error_oops.webp` | ErrorScreen（5xx / 服务异常） |
| `bear_idle.webp` | StoryEndScreen 鞠躬第一帧；HomeScreen 装饰 deco |
| `bear_listen_headphones.webp` | DialogueScreen 3B 蹲坐戴耳机听小孩 |
| `bear_magic_wand.webp` | DialogueScreen 3A 等待小孩 |
| `bear_my_home.webp` | HomeScreen 个人主页菜单卡图标（取代 ui_home_profile） |
| `bear_no_network.webp` | OfflineScreen 主立绘 |
| `bear_pointing.webp` | LearningScreen 字幕条上方跟光标滑动 |
| `bear_qr_peek.webp` | ActivationScreen 二维码偷看；ErrorScreen `ACTIVATION_*` 系列 |
| `bear_react_2.webp` | DialogueScreen 3C 说话动画 A 帧 |
| `bear_react_3.webp` | DialogueScreen 3C 说话动画 B 帧 |
| `bear_read.webp` | StoryBodyScreen 控制条 Learn 圆头像按钮 |
| `bear_sit.webp` | ErrorScreen（USER_NOT_BOUND 等系列） |
| `bear_sleep.webp` | ErrorScreen（QUOTA_EXHAUSTED / 限流） |
| `bear_think.webp` | ErrorScreen（version 升级 / generic retry） |

## 3. ui/ — 界面图标（按钮 / 控件）

| 文件 | 用在哪 |
|---|---|
| `ui_download.webp` | CreateScreen StoryCell 下载按钮；LibraryStoryCell 下载按钮 |
| `ui_heart_favorite.webp` | CreateScreen StoryCell 收藏按钮；LibraryStoryCell 收藏按钮 |
| `ui_home_cast.webp` | HomeScreen 投屏菜单卡 icon |
| `ui_home_create.webp` | HomeScreen 创作菜单卡 icon（Dream Factory 入口） |
| `ui_home_explore.webp` | HomeScreen 探索菜单卡 icon |
| `ui_home_library.webp` | HomeScreen 故事馆菜单卡 icon |
| `ui_home_profile.webp` | LearningScreen 切换语言按钮（圆 disc） |
| `ui_home_stories_map.webp` | HomeScreen 我的故事 / Bear Stars 菜单卡 icon |
| `ui_mic.webp` | DialogueScreen 3B 中央麦克风（待按） |
| `ui_mic_active.webp` | DialogueScreen 3B 中央麦克风（按下）|
| `ui_player_next.webp` | StoryBodyScreen 下一页控件 |
| `ui_player_pause.webp` | StoryBodyScreen 暂停态 |
| `ui_player_play.webp` | StoryBodyScreen 播放态；GeneratingScreen 大圆按钮去故事馆 |
| `ui_player_prev.webp` | StoryBodyScreen 上一页控件 |
| `ui_progress_bar.webp` | GeneratingScreen 进度条底纹（CSS background-image，琥珀 scaleX 覆盖） |
| `ui_remote.webp` | DialogueScreen 3A / 3B / 3C 遥控器图示（按住麦克风提示） |

## 4. story/ — 通用绘本插画占位

| 文件 | 用在哪 |
|---|---|
| `story_generic_forest.webp` | LibraryScreen 兜底 cover；DialogueScreen 3A 森林主题卡；Gallery seed |
| `story_generic_ocean.webp` | LibraryScreen 兜底 cover；DialogueScreen 3A 海洋主题卡；Gallery seed |
| `story_generic_sky.webp` | LibraryScreen 兜底 cover；Gallery seed |

## 5. avatar/ — 圆头像

| 文件 | 用在哪 |
|---|---|
| `avatar_bear_classic.webp` | 默认头像 key（HomeScreen / ProfileScreen / mock bridge）|
| `avatar_bear_painter.webp` | DialogueScreen 3C 圆头像（旁白小熊画师） |
| 其他 17 个 `avatar_*.webp` | ProfileScreen 头像选择面板（按 key 拼路径，runtime 动态加载） |

## 6. deco/ — 装饰物

| 文件 | 用在哪 |
|---|---|
| `deco_coins.webp` | HomeScreen 顶部金币图标；ProfileScreen 金币 |
| `deco_confetti.webp` | StoryCoverScreen 左右纸花 |
| `deco_stars.webp` | StoryCoverScreen 星星层；GeneratingScreen 装饰星 |

## 7. h5/ — H5 端共用图

| 文件 | 用在哪 |
|---|---|
| `h5_empty_stories.webp` | CreateScreen 空态画面（小书架） |

---

## 维护提示给下一棒 AI

1. **拿这份表去对 `WonderBear_资产文件名规则_v7.x.md`**：
   - 表里出现的文件 → 规则文档里必须有同名条目 + 200 OK CDN 链接
   - 规则文档里没列的 → 加上来源（哪个屏 / 哪次 iter 引入）
2. **不要重命名表里的文件**：所有路径都以字符串形式硬写在 `.vue` 模板里，改名等于改代码
3. **错误屏 bear 状态**通过 `errorCodes.ts` 的 mapping 决定，新增错误码时 `bear:` 字段必须从上面 §2 列表里挑现有立绘
4. **HomeScreen 的菜单卡 icon** 已经从 `ui_home_profile` 切到 `bear_my_home`（创始人手工指定），不要改回去
5. **iter13l-7 起 LearningScreen** 用 `ui_home_profile` 做语言切换 disc（位置：topbar 居中），这是新用法
6. **本表生成时间**：iter13l-9（2026-04-25 会话）
