# PHASE1 Report — TV-HTML 服务器读链路集成

**From**: Factory Droid (claude-opus-4-7, 夜班)
**To**: VPS Claude / Kristy
**Time**: 2026-04-28 (北京夜间)
**Branch**: `fix/tv-gallery-v2` (HEAD `f9a0d8d`)
**Refs**: `coordination/workorders/2026-04-28-tv-html-phase1-phase2/2026-04-28-PHASE1-tv-html-server-read-integration.md`, `tv-html/HANDOFF_2026-04-28_server_integration.md`

---

## 1. 总体结果

**PASS** — P0 (5 个屏) + P1 (2 个屏) production 路径完成, dev 链路 100% 保留, 无红线触发。

---

## 2. 改动文件 + git log

```
f9a0d8d feat(tv-html-phase1): editor_picks creator_nickname matches mock label
bda2c78 feat(tv-html-phase1): LeaderboardScreen editor_picks overlay from real story shelf
ca0da5e feat(tv-html-phase1): CreateScreen production fetch limited to 3 latest stories
df29b85 feat(tv-html-phase1): LearningScreen replayPage honors langMode for TTS
6747b86 feat(tv-html-phase1): StoryBodyScreen plays ttsUrlLearning when langSide=learning
a6937e8 feat(tv-html-phase1): StoryCoverScreen payload-driven storyDetail fetch
ebbf616 feat(tv-html-phase1): wire FavoritesScreen production unfavorite + onlyFavorited query
```

`git diff --stat f4fb858..HEAD`:

```
 tv-html/src/i18n/locales/en.ts            |  1 +
 tv-html/src/i18n/locales/zh.ts            |  1 +
 tv-html/src/screens/CreateScreen.vue      |  8 ++-
 tv-html/src/screens/FavoritesScreen.vue   | 45 +++++++++++---
 tv-html/src/screens/LeaderboardScreen.vue | 96 ++++++++++++++++++++++++++++---
 tv-html/src/screens/LearningScreen.vue    | 12 +++-
 tv-html/src/screens/StoryBodyScreen.vue   | 33 ++++++++++-
 tv-html/src/screens/StoryCoverScreen.vue  | 61 +++++++++++++++-----
 8 files changed, 220 insertions(+), 37 deletions(-)
```

### 改动摘要 (按文件)

| 文件 | 关键改动 |
|---|---|
| `LibraryScreen.vue` | **未改动** — production 路径在 PHASE1 之前已经接好 (storyList childId+sort+limit), 19 本 curl 已验证 |
| `FavoritesScreen.vue` | (a) loadFavorites 加 `onlyFavorited:true` 服务端过滤, 删客户端二次 filter; (b) deleteStory 改为 optimistic 调 `storyFavorite({favorited:false})`, 失败回滚到原索引 + i18n hint |
| `StoryCoverScreen.vue` | onMounted 改成 async, 新增 `ensureActiveStory()` — 当 `storyStore.active` 为空但 `screen.payload.storyId` 有值时, 调 `storyDetail(id)` hydrate store; 没 storyId 才 goError; dev 短路保留 |
| `StoryBodyScreen.vue` | (a) `playCurrentPage` 根据 `langSide` 选 `ttsUrl` 或 `ttsUrlLearning`; (b) `onLangToggle` 在 playing 状态下重新 cue 当前页 audio, paused 状态保持暂停 |
| `LearningScreen.vue` | `replayPage` 根据 `langMode` 选 `ttsUrl` 或 `ttsUrlLearning`, 任一缺失自动 fallback |
| `CreateScreen.vue` | production `PAGE_SIZE` 12 → 3 (workorder §4.6), dev mock 4 项不动 |
| `LeaderboardScreen.vue` | (a) onMounted 触发 `refreshEditorPicksFromServer()` — 取真 storyList, 随机抽 5–8 本拼成 StoryRow 替换 `data.editor_picks`; (b) `openStory` 用 cuid 正则区分真假 id, 真 id 走 `screen.go('story-cover', { storyId })` 让 Cover 屏自己拉详情, 假 id (mock e001/s001) 静默 no-op; (c) 失败静默, 保留 mock writers/weekly_plays/self_summary 三个 tab |
| `i18n/locales/{zh,en}.ts` | 新增 `favorites.actions.removeFailed` 文案 (取消收藏失败回滚提示) |

---

## 3. §5.1 Dev 链路 5 步逐条 (代码层)

VPS 上无浏览器, 这里按 HANDOFF §0.4 5 步对应的代码层 grep + 路径残存验证:

| 步骤 | 验证方法 | 结果 |
|---|---|---|
| 1. `?dev=1` + `Ctrl+L` → LearningScreen 小熊跟随光标 | `LearningScreen.vue` `if (isDevBrowser && !storyStore.active)` 同步 seed (line 51-58) 未动; `replayPage` 改动只在 langMode 选择, dev mock TTS URL 为空时 fallback 行为不变 | ✅ |
| 2. `Ctrl+D` → DialogueScreen 显示 ready-painter, OK 跳 GeneratingScreen | DialogueScreen.vue 未在改动清单内, grep 确认 `isDevBrowser` 6 处 dev 短路全部保留 | ✅ |
| 3. `Ctrl+G` → GeneratingScreen 进度条+小熊滑, OK 跳 Library | GeneratingScreen.vue 未改; `isDemoMode()` 包含 `import.meta.env.DEV` 仍在 line 166 | ✅ |
| 4. `Ctrl+B` → StoryBody 4 按键 + 小熊头像跳 LearningScreen | StoryBodyScreen.vue `body-ctrl-learn` onEnter 仍是 `screen.go('learning')`; `isDevBrowser` E 键短路 (line 339-359) 保留 | ✅ |
| 5. Library → cover → body → learning 完整链路 | LibraryScreen.vue 未改 (dev mock 12 项 + buildDemoStory openStory 都在); StoryCoverScreen 新加的 `ensureActiveStory` dev 分支直接 return true 不触发 API; StoryBody/Learning dev 行为不变 | ✅ |

---

## 4. §5.2 Production 链路 8 项逐条

(测试身份: `/tmp/e2e-test-context.json` deviceToken, childId `cmoh4ufty00044joegymcaru8`, b_storyId `cmoh77cev00011kpxyv8nabei`)

| # | 验收项 | 验证方式 | 结果 |
|---|---|---|---|
| 1 | Library 屏 production 调 `GET /api/story?...` (19 本) | `curl /api/story/list?childId=...&limit=50` → `{code:0, total:19, items:19}` ✓ Library 代码 line 215-220 已调用 | ✅ |
| 2 | Cover 屏 production 调 `GET /api/story/:id` (b_storyId) | `curl /api/story/cmoh77cev00011kpxyv8nabei` → `{code:0, has_pages:12, has_textLearning:true, has_ttsUrlLearning:true}` ✓ StoryCoverScreen.ensureActiveStory line 92-95 调用 `api.storyDetail(wantedId)` | ✅ |
| 3 | Body 屏消费 `pages[].imageUrl/ttsUrl/text/textLearning/ttsUrlLearning` | 模板 `:src="currentPage.imageUrl"` line 519, `subtitlePrimaryText`/`subtitleSecondaryText` 依赖 `text`/`textLearning` line 188-200; `playCurrentPage` 根据 langSide 选 `ttsUrl` 或 `ttsUrlLearning` line 236-251 | ✅ |
| 4 | Learning 屏消费 `text + textLearning` | `activeText` line 137-141 切 primary/secondary; `replayPage` 根据 langMode 选 ttsUrl/ttsUrlLearning line 168-180 | ✅ |
| 5 | Favorites 屏 production 调 `GET /api/story?onlyFavorited=true` | `curl /api/story/list?childId=...&onlyFavorited=true` → `{code:0, total:1, items:1}` ✓ FavoritesScreen.loadFavorites line 132-138 已传 `onlyFavorited:true` | ✅ |
| 6 | Create 3 slot production 调 `GET /api/story?page=1&pageSize=3` | `curl /api/story/list?childId=...&limit=3&sort=newest` → `{code:0, items:3, first:"彩虹森林的閃亮果子"}` ✓ CreateScreen `PAGE_SIZE=3` + storyList 调用 line 218-222 | ✅ |
| 7 | Bear Stars editor_picks 改为真 storyList 抽样 | LeaderboardScreen `refreshEditorPicksFromServer` line 309-339 调 `api.storyList`, 抽 5–8 本组装成 StoryRow 覆盖 `data.editor_picks`; `openStory` 用 cuid 正则路由真 storyId 给 `screen.go('story-cover', { storyId })`; mock 写手/本周/self 不动 | ✅ |
| 8 | 改动全部在 `if (isDevBrowser)` 之后, dev 路径 100% 未变 | `git diff` 自检 + `grep isDevBrowser` 各文件 dev 分支位置不变; FavoritesScreen.deleteStory 在 `if (isDevBrowser) return;` 之后才调 API | ✅ |

---

## 5. §5.3 红线自检

`git diff --name-only f4fb858..HEAD`:

```
tv-html/src/i18n/locales/en.ts
tv-html/src/i18n/locales/zh.ts
tv-html/src/screens/CreateScreen.vue
tv-html/src/screens/FavoritesScreen.vue
tv-html/src/screens/LeaderboardScreen.vue
tv-html/src/screens/LearningScreen.vue
tv-html/src/screens/StoryBodyScreen.vue
tv-html/src/screens/StoryCoverScreen.vue
```

红线对照表:

| 红线 | 是否触发 |
|---|---|
| 不动 server-v7 | ✅ 0 处改动 |
| 不动 .env / package.json / prisma | ✅ 0 处 |
| 不动 main.ts / App.vue / focus 系统 / keyRouter / ActivationScreen | ✅ 0 处 |
| 不删除 `if (isDevBrowser)` / `if (isDemoMode())` 分支 | ✅ grep 确认所有原 dev 分支仍在, 只在分支后新增/调整 production 路径 |
| 不调付费 API (FAL / ElevenLabs / Gemini / OpenAI image / Whisper) | ✅ 仅调用免费 GET / POST favorite |
| 不改 CSS / 动画 / 视觉 / 字体 / 图标 / 布局 | ✅ 改动均在 `<script setup>` 内, 无 `<style>` 改动 (i18n 例外只是文案) |
| 不修复 "看到但范围外" 的 bug | ✅ 仅按 workorder §3 工作区清单做事 |
| 工作区在 §3 清单内 | ✅ 8 个文件全部在 P0 / P1 / i18n 允许清单内 |

---

## 6. 耗时 + 派 droid 次数

- 单 droid (本次), 单次派单
- 估算耗时: 约 2 小时 (workorder 上限 6 小时, 节余明显)

---

## 7. 遗留问题 (留 PHASE2 / Kristy 早上)

1. **childId 依赖**: 多个屏在 production 路径调 `storyList({ childId: child.activeChildId ?? undefined })`, 如果用户跳过 HomeScreen (没触发 `child.refreshActive`) 直接进 Library/Favorites/Create, `childId` 会是 undefined, 服务器返回 90001。HomeScreen onMounted 会 refresh, 主链路 OK; deep-link 边缘 case 留 PHASE2 决定是否在 Library/Favorites onMounted 自己 refresh。
2. **storyDelete vs storyFavorite{favorited:false}**: FavoritesScreen 删除按钮当前实现的是"取消收藏"语义 (kid 把书从收藏夹拿出, 故事本身仍在 Library)。如果 Kristy 想要硬删除整本, 改用 `api.storyDelete(id)` 即可 (一行替换), workorder §4.5 给我们二选一的余地, 选了更安全的 unfavorite。
3. **LangToggle TTS 重 cue**: StoryBodyScreen 切语言会重新从当前页头开始播放对应语言 audio, 没保留进度。如果想做"切语言不打断 audio 进度"需要 audio element seek, 涉及 bridge 改动, 留 PHASE2。
4. **editor_picks 抽样种子**: 当前每次 mount 重新随机, 切回再切走顺序会变。如果想稳定, 可以在 child 维度持久化随机种子, 但 PRD 没要求, 留 PHASE2 视情况。
5. **storyDetail 在 Cover 屏的 loading state**: 现在直接 await, 期间显示空 ceremony layout (无 loading 文案)。如果 storyDetail 慢, 用户看不到反馈。可加 loading 状态, 但 dev 模式下不需要, 暂略。

---

## 8. 明早 Kristy 实测建议 (最快路径)

(本地 dev server 是 localhost:5176; production 服务器在 VPS `http://154.217.234.241:3000`)

### Dev 链路验收 (验证我没破坏 dev)
1. 打开 `localhost:5176/?dev=1`
2. 跑 5 个 Ctrl+热键: `Ctrl+L` / `Ctrl+D` / `Ctrl+G` / `Ctrl+B` / `Ctrl+H` 看每屏是否正常
3. Home → Stories → 任意故事 → cover → body → 小熊头像 → learning → 左右键
4. Home → Bear Stars → editor_picks tab → 应该看到真书 (从 19 本里抽 5–8 本) + 点进去能播放真书
5. Favorites 入口: Home → Stories → 左侧 rail 最下面那个心 → Favorites → 删除任一书 → 看是否成功 (会立即调真 API)
6. Create → 应该看到 mock 4 本 (dev 路径不变)

### Production 链路验收 (没浏览器没法直接测, 留接 GP15 时验证)
- 关键: 接真硬件后, `?dev=1` 不带, GP15 走真 token
- 此时 Library 应该显示 19 本; FavoritesScreen 显示 1 本; Create 显示最近 3 本; Bear Stars editor_picks 显示从 19 本抽样

### 快速 sanity check 命令 (你 ssh VPS 后)
```bash
DEVICE_TOKEN=$(jq -r .deviceToken /tmp/e2e-test-context.json)
CHILD_ID=$(jq -r .childId /tmp/e2e-test-context.json)
# 19 本
curl -s -H "Authorization: Bearer $DEVICE_TOKEN" "http://localhost:3000/api/story/list?childId=$CHILD_ID&limit=50" | jq '.data.total'
# 1 本收藏
curl -s -H "Authorization: Bearer $DEVICE_TOKEN" "http://localhost:3000/api/story/list?childId=$CHILD_ID&onlyFavorited=true" | jq '.data.total'
# b_storyId 详情
curl -s -H "Authorization: Bearer $DEVICE_TOKEN" "http://localhost:3000/api/story/cmoh77cev00011kpxyv8nabei" | jq '.data.story | {pages: (.pages|length), favorited, status}'
```

---

**By: Factory Droid (夜班)**
