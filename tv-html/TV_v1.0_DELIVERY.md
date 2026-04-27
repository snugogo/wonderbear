# TV v1.0 交付清单

> 基于《UI Factory 作业指导书 — TV 端 v1.0》完成的实现 diff 摘要 + 资产清单。
> 仅在 `tv-html/` 目录内。git push 待 Kristy 手动批。

---

## 1. 文件改动清单

### 新增文件 (5)

| 路径 | 用途 |
|---|---|
| `src/screens/LeaderboardScreen.vue` | 小熊星光排行榜（3 Tab + 我家位置 + 空态）|
| `src/screens/CreateInviteScreen.vue` | 激励创作引导页（点家庭后跳）|
| `src/components/FlashcardOverlay.vue` | 暂停式词汇闪卡覆盖屏（StoryBody 内嵌）|
| `src/mock/leaderboard.json` | mock 数据（writers 20 / weekly 10 / picks 12 / self_summary）|
| `tools/trace_leaderboard.mjs` | playwright 烟雾测试脚本 |

### 修改文件 (11)

| 路径 | 改动 |
|---|---|
| `src/stores/screen.ts` | ScreenName 加 `'leaderboard'` `'create-invite'` |
| `src/App.vue` | 注册新屏到 screenMap |
| `src/main.ts` | `?screen=` 深链 VALID 列表加新两项 |
| `src/dev/GalleryView.vue` | 侧栏加「13. Bear Stars」「14. Create Invite」|
| `src/screens/HomeScreen.vue` | 6 入口顺序 + 路由按 §2.1 锁定（第3卡指向 leaderboard）|
| `src/screens/ProfileScreen.vue` | 加我的星光行（替代脚印），导入 mock 拿 stars |
| `src/screens/StoryBodyScreen.vue` | 加语言切换 disc + 闪卡按钮（替原 Learn ctrl 的 LearningScreen 跳转）|
| `src/screens/GeneratingScreen.vue` | 加分阶段进度文案 stageLabel |
| `src/i18n/locales/zh.ts` | 6 入口 4 字命名 + leaderboard / createInvite / flashcard / generating.stages 新 keys |
| `src/i18n/locales/en.ts` | 同上英文 |
| (无变化) `src/screens/LibraryScreen.vue` | title/empty/capacity 由 i18n 改名自动生效 |
| (无变化) `src/screens/CreateScreen.vue` | title 由 i18n 改名自动生效 |

---

## 2. 命名表对齐结果（§2.1 / §2.2 / §2.3）

### 2.1 6 入口（HomeScreen 顺序锁定）

| # | 中文 | 英文 | 路由 | 状态 |
|---|---|---|---|---|
| 1 | 来讲故事 | Create | `/create` | ✓ |
| 2 | 故事乐园 | Stories | `/library` | ✓ |
| 3 | 小熊星光 | Bear Stars | `/leaderboard` | ✓ 新增 |
| 4 | 手机投屏 | Cast | stub | ✓ |
| 5 | 小熊小屋 | My Den | `/profile` | ✓ |
| 6 | 系统设置 | Settings | stub | ✓ |

### 2.2 排行榜 3 Tab

| 中文 | 英文 | 数据源 | 点击行为 |
|---|---|---|---|
| 小作家榜 | Writers | writers_board | → CreateInviteScreen |
| 本周热听 | Weekly Hot | weekly_plays | → story-cover (mock 待 server) |
| 编辑精选 | Editor Picks | editor_picks | → story-cover (mock 待 server) |

### 2.3 积分单位

- 全产品已用 ⭐「星光」（`stars`）
- 「脚印 🐾」未在 TV 当前代码出现（搜索确认无残留）
- ProfileScreen 加`profile.starsLabel: '我的星光'` + `profile.starsValue: '⭐ {count}'`
- LeaderboardScreen 行尾、CreateInvite headline 全部 ⭐
- 「金奖故事」未出现，统一用「编辑精选」

---

## 3. 资产实际使用清单（从 117 张池子里选了哪几张）

### 3.1 直接复用（已确定）

| 资产 | 用在 |
|---|---|
| `bg/bg_room.webp` | LeaderboardScreen 全屏 |
| `bg/bg_home_cozy.webp` | CreateInviteScreen 全屏 |
| `deco/deco_stars.webp` | LeaderboardScreen 顶部 ⭐ + CreateInvite 左右点缀 |
| `bear/bear_empty_box.webp` | LeaderboardScreen 空态主立绘 |
| `bear/bear_cheer.webp` | CreateInviteScreen 主立绘（占位 → 建议补 bear_writing_quill）|
| `bear/bear_pointing.webp` | FlashcardOverlay 角落小熊（占位 → 建议补 bear_flashcard_teach）|
| `ui/ui_home_profile.webp` | StoryBodyScreen 语言切换 chip |
| `bear/bear_read.webp` | StoryBodyScreen 闪卡 chip（替原 Learn 跳转）|

### 3.2 emoji / SVG 占位（不需补图）

| 期望 | 占位 | 用在 |
|---|---|---|
| `ui_medal_gold/silver/bronze` | emoji 🏆🥈🥉 | Leaderboard Top1-3 行 |
| `ui_fire_hot` | emoji 🔥 | Weekly Hot 播放数前缀 |

### 3.3 建议人工补图清单

| 期望文件名 | 当前占位 | 优先级 |
|---|---|---|
| `bear_writing_quill.webp` | bear_cheer | 中（CreateInviteScreen 主立绘可读但表情不精准）|
| `bear_flashcard_teach.webp` | bear_pointing | 低（FlashcardOverlay 角落，已可用）|
| `ui_badge_editor_pick.webp` | 内联 CSS 渐变金色胶囊「精选 / Pick」 | 低（视觉已合格）|

> 上述 3 项均不阻塞验收。Kristy 后续手工补图后只需把对应路径写进 `asset()` 调用。

---

## 4. mock 数据 / 接口契约

- `src/mock/leaderboard.json` 严格按指导书 §3.1.9 字段名
- LeaderboardScreen `USE_MOCK = import.meta.env.VITE_USE_MOCK_LEADERBOARD !== 'false'`
  - 默认 mock 模式 → 直接 import JSON
  - 设环境变量 `VITE_USE_MOCK_LEADERBOARD=false` 时切真接口（接口实现见 §5）
- ProfileScreen 也读 mock 拿 self_summary.stars（同步切换点）

### 接口待 server 实现（字段已对齐）

```
GET /api/leaderboard/writers       → { writers_board: [...] }
GET /api/leaderboard/weekly_plays  → { weekly_plays: [...] }
GET /api/leaderboard/editor_picks  → { editor_picks: [...] }
GET /api/leaderboard/self_summary  → { rank, stars, stars_to_top10, in_top10 }
```

---

## 5. 交互验收

| 验收点 | 状态 |
|---|---|
| HomeScreen 6 入口文案 + 顺序对齐 §2.1 | ✓ |
| 第 3 入口（小熊星光）→ /leaderboard | ✓ |
| 「脚印」全产品 0 残留 | ✓（grep 确认） |
| LeaderboardScreen 三个 Tab 切换 | ✓（playwright trace） |
| Top1-3 显示奖牌 | ✓（emoji 🏆🥈🥉）|
| 本家行高亮浅黄 #FFF4D6 | ✓ |
| 底部「我家位置」仅小作家榜显示 | ✓（v-if showSelfBar）|
| 点家庭 → CreateInviteScreen 文案动态 | ✓（payload 透传 stars）|
| 点故事 → 现有播放页（mock 模式略过） | ⚠ 真接口接通后启用 |
| FlashcardOverlay 暂停 + 主词轮播 + OK/Back/10s 退 | ✓（playwright trace）|
| StoryBody 双语切换按钮（mock 切文案不切音频）| ✓ |
| 动画仅 transform / opacity，无 backdrop-filter on hot path | ✓ |
| typecheck `npm run typecheck` | ✓ 通过 |

---

## 6. GP15 性能合规自检

- ✅ 无 `filter`/`backdrop-filter` 用于 animation（仅静态 drop-shadow）
- ✅ 列表行 hover/focus 仅 `transform: scale(1.02)` + 平铺色变
- ✅ Tab 选中下划线用伪元素 + 平铺色，无渐变动画
- ✅ FlashcardOverlay 词淡入仅 opacity
- ✅ 同时动画元素 ≤ 3（仅 ctrl-btn focus + tab focus + flashcard 词淡入）

---

## 7. 不在本期范围（按指导书 §1.5）

- ❌ H5 端任何修改 — 等独立 H5 增量补丁文档
- ❌ server-v7 接口实现 — 字段已锁，待 server 落
- ❌ 真实 TTS / voice_id 接入 — 等 voice 锁定
- ❌ 跑图 — 117 张池内复用 + 占位
- ❌ FlashcardOverlay 关键词图（vocabulary[i].image_url）— mock 用 null

---

## 8. git push

未 push。请 Kristy review diff 后手动批：

```
git -C E:/AI/factory-workspace/wonderbear status
git -C E:/AI/factory-workspace/wonderbear add tv-html
git -C E:/AI/factory-workspace/wonderbear commit -m "tv: TV v1.0 — bear stars / create invite / flashcard"
git -C E:/AI/factory-workspace/wonderbear push
```

---

**作业完成。typecheck 绿，playwright 烟雾测试绿。**
