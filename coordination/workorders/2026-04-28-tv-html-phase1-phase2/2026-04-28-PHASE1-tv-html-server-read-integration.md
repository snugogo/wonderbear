# Workorder PHASE1: TV-HTML 服务器读链路集成

**To**: VPS Claude → droid (claude-opus-4-7)
**派单时间**: 2026-04-28 北京晚间
**Branch**: `fix/tv-gallery-v2` (HEAD `9eec031`)
**目标耗时**: 上限 6 小时, 超出立即停止 + 写 blocker
**总预算**: **$0** (本阶段不调任何付费 API, 只读 GET 接口免费)
**报告路径**: `coordination/done/2026-04-28-PHASE1-report.md`
**异常路径**: `coordination/blockers/2026-04-28-PHASE1-<reason>.md`

---

## §0 必读 (违反 = 全部回滚)

完整阅读 `tv-html/HANDOFF_2026-04-28_server_integration.md` 全文, 特别是:
- §0 最高原则 (不动 dev 路径)
- §4 一定不能动的部分 (12 文件清单)
- §7 历史踩坑记录 (7 条曾经踩过的坑)

### 0.1 绝对禁止 (HARD STOP)

- ❌ 删除任何 `if (isDevBrowser)` / `if (isDemoMode())` 分支
- ❌ 改 `useFocusable.ts` / `keyRouter.ts` / `neighbors.ts` / `store.ts`
- ❌ 改 `main.ts` line 96-127 (dev 跳过激活)
- ❌ 改 `ActivationScreen.vue` 任何 `import.meta.env.DEV` 短路
- ❌ 改 CSS / 动画 / 视觉 / 字体 / 图标 / 布局
- ❌ 接 dialogue / generate / activation production 路径 (PHASE2)
- ❌ 调任何付费 API (FAL / ElevenLabs / Gemini / OpenAI image)
- ❌ git push 到 main 分支 (push 到 fix/tv-gallery-v2 可以)
- ❌ 修复"看到了但不在范围内"的 bug
- ❌ 改 `package.json` / 装新依赖
- ❌ 改 `.env*` / `prisma/` / 数据库 schema
- ❌ 改 server-v7 任何代码

### 0.2 绝对必须

- ✅ 工作区严格限定在 §3 列出的文件
- ✅ 每个改动都在 `if (isDevBrowser)` 分支**之后**新增/完善 production 路径
- ✅ dev 模式 `?dev=1` 必须 100% 保持现有行为, HANDOFF §0.4 5 步全过
- ✅ commit 用单文件 `git add <path>`, 不用 `-A` 不用 `.`
- ✅ commit message 前缀 `feat(tv-html-phase1):`

---

## §1 数据源 + 测试身份

### 1.1 API 基址
- 前端 `.env.development.local` 已配 `VITE_API_BASE=http://154.217.234.241:3000/api`
- droid 在 VPS 上跑可直接用 `http://localhost:3000/api`
- **不要改 .env**

### 1.2 测试身份 (VPS `/tmp/e2e-test-context.json`)
- `deviceId`: `e2e-test-device-001`
- `deviceToken`: 见 `/tmp/e2e-test-context.json` (TTL 2026-05-27)
- `childId`: `cmoh4ufty00044joegymcaru8`
- `parentToken`: 见 `/tmp/e2e-test-context.json` (TTL 2026-05-04)
- 已知 storyId (favorited demo): `cmoh77cev00011kpxyv8nabei` 《彩虹森林的閃亮果子》

### 1.3 已知后端事实 (来自 2026-04-27 E2E-TV-002 报告)
- R2 上 19 本绘本完整 (18 本 E2E-TV-001 + 1 本 E2E-TV-002 B 步)
- `b_storyId` 那本 favorited=true, 12 页全 webp + 中英 24 段 mp3 都 HEAD 200
- `GET /api/story/:id` 返回结构在 §4.3 详述

---

## §2 范围

### 2.1 必须真数据 + 真功能 (主线, 明早 Kristy 演真的)

| 屏 | 文件 | 真数据来源 | 真交互 |
|---|---|---|---|
| Library | `LibraryScreen.vue` | `GET /api/story?...` (19 本) | 翻页 / 点进去 / 删除 / 收藏 toggle |
| Favorites | `FavoritesScreen.vue` | `GET /api/story?onlyFavorited=true` | 删除 / 取消收藏 |
| StoryCover | `StoryCoverScreen.vue` | `GET /api/story/:id` | 5 秒倒计时跳 body |
| StoryBody | `StoryBodyScreen.vue` | 同上 pages[] | 翻页 / 暂停 / 切语言 / 跳 learning |
| Learning | `LearningScreen.vue` | 同上 text + textLearning | 光标走字 |
| Create | `CreateScreen.vue` 3 slot | `GET /api/story?limit=3` 最近 3 本 | 显示真缩略图 + 真标题 |
| Bear Stars Editor 精选 | `LeaderboardScreen.vue` (editor_picks tab) | 从 storyList 19 本随机抽 + 点跳真 storyDetail | 点跳真书播放 |

### 2.2 假数据 + 界面对就行 (附属, 不深做)

- **Bear Stars 排行榜** (writers_board / weekly_plays / self_summary 三个 tab): **保持前端 mock json 不动**
- **My Den / My Home (Profile)**: 显示 mock 数据, 界面看着对即可, 不接真 API
- **Settings**: 静态展示语言切换 + 系统信息, 不深做
- **Cast**: 静态展示, 不深做

### 2.3 完全不动

- ❌ Activation production 路径 (保留 dev 跳过)
- ❌ Dialogue production 路径 (PHASE2)
- ❌ Generating production 路径 (PHASE2)
- ❌ HANDOFF §4 列出的 12 个文件
- ❌ Bear Stars 三个排行榜 tab 的 mock (不动)

---

## §3 工作区 (严格限定)

只允许修改:

**P0 必须**:
1. `tv-html/src/screens/LibraryScreen.vue`
2. `tv-html/src/screens/FavoritesScreen.vue`
3. `tv-html/src/screens/StoryCoverScreen.vue`
4. `tv-html/src/screens/StoryBodyScreen.vue`
5. `tv-html/src/screens/LearningScreen.vue`

**P1 强烈推荐**:
6. `tv-html/src/screens/CreateScreen.vue` (仅 3 slot 历史故事)
7. `tv-html/src/screens/LeaderboardScreen.vue` (仅 editor_picks tab)

**P2 视情况**:
8. `tv-html/src/services/api.ts` (仅在需要补 API 调用方法时, 优先复用现有)
9. `tv-html/src/i18n/zh.ts` + `en.ts` (仅在需要新增错误文案 i18n key 时)

**不允许动**:
- 任何 §0.1 红线文件
- HANDOFF §4 列出的 12 个文件
- 上面没列的所有其它文件

如果 droid 觉得"必须改 X 才能完成", 立即停止 + 写 blocker md。

---

## §4 实现要求

### 4.1 production 路径填充模式

**正确**:
```js
async function load(): Promise<void> {
  if (isDevBrowser) {
    // ← 不动, 保留 dev seed 行为
    return;
  }
  // ↓ production 路径
  try {
    const { data } = await api.storyList({ page: 1, pageSize: 50 });
    library.value = (data.items ?? []).map(toLibraryRow);
  } catch (e) {
    bridge.log('library', { event: 'list_failed', err: String(e) });
    library.value = []; // 空态而非 throw, 避免白屏
  }
}
```

**错误** (会引入 HANDOFF §7 已记录的踩坑):
```js
// ❌ 删 dev 分支重写
// ❌ 把 try/catch 拿掉让错误冒泡
// ❌ 改成 await Promise.all 并发拉所有书的 detail
```

### 4.2 Library 列表数据契约

LibraryScreen 现在用 dev mock 12 项 summaries。真实 API 返回结构 droid **必须先 curl 一次实际 endpoint** 看返回, 不要凭空猜字段名:

```bash
curl -s -H "Authorization: Bearer $(cat /tmp/e2e-test-context.json | jq -r .deviceToken)" \
  'http://localhost:3000/api/story?page=1&pageSize=50' | jq '.data.items[0]' | head -30
```

如果 API 字段跟前端 type 不匹配, 在 LibraryScreen 内部做映射 (例如 `toLibraryRow(apiItem)`), **不要改 api.ts type 定义, 不要改 server**。

### 4.3 Story Detail 数据消费

`GET /api/story/:id` 已确认返回 (来自 2026-04-27 E2E-TV-002 报告):
```
{
  data: {
    id, title, coverUrl, status, isPublic, favorited, playCount, downloaded,
    metadata: { duration, provider, createdAt, primaryLang, learningLang },
    pages: [
      {
        pageNum, text, textLearning, emotion,
        imageUrl, imageUrlHd,
        ttsUrl, ttsUrlLearning,
        durationMs
      } × 12
    ],
    dialogue: { rounds: [...] }
  }
}
```

**StoryBodyScreen 必须**:
- 当 `langMode='primary'` 显示 `text` + 播 `ttsUrl`
- 当 `langMode='learning'` 显示 `textLearning` + 播 `ttsUrlLearning`
- `imageUrl` (webp) 用于普通展示, `imageUrlHd` 暂不用 (避免 OOM)

**LearningScreen 必须**:
- 消费同 page 的 `text` (CJK) + `textLearning` (Latin) 做双语对照
- 不依赖 cursor 位置以外的状态

### 4.4 同时只 mount 一张图的硬约束

HANDOFF §3.3 + §4.2: StoryBodyScreen 已用 `<img v-if="..." :key="pageIndex">`, 不要破坏。如果手痒想 preload 下一页 → **拒绝**, GP15 OOM 红线。

### 4.5 Favorites 真功能

`FavoritesScreen.vue`:
- 加载: `GET /api/story?onlyFavorited=true` (不是 `favoriteOnly`, 见 E2E-TV-002 报告 §3 字段名)
- 取消收藏: `POST /api/story/:id/favorite` body `{ favorited: false }` (字段是 `favorited` 不是 `isFavorite`)
- 删除: 是软删除还是硬删除, 先 grep `api.ts` 现有 `storyDelete` 或 `storyArchive` 方法; 没有就**保持 dev mock 行为**, 不新增 API 方法
- Optimistic UI: 先动 UI 再调 API, 失败 rollback

### 4.6 Create 3 Slot 真历史

`CreateScreen.vue`:
- 加载最近 3 本: `GET /api/story?page=1&pageSize=3` (按 createdAt desc)
- 缩略图用 `coverUrl`
- 标题用 `title`
- 点 Play Full → `screen.go('story-cover', { storyId })` (production 路径)
- 点 + 跳 dialogue (保持 dev 短路, PHASE2 接)

### 4.7 Bear Stars Editor 精选 真书跳转

`LeaderboardScreen.vue`:
- editor_picks tab 当前从 mock json 读
- **改为**: 拉取 storyList 19 本, 随机抽 5-8 本作为 editor_picks 展示
- 仍走 mock 文件**结构** (不破坏 watch 焦点逻辑), 但**数据**来源改为真 storyList
- 点击某项 → `screen.go('story-cover', { storyId: <真实 id> })` 跳真书播放
- 其它三个 tab (writers_board / weekly_plays / self_summary) **保持 mock 不动**

### 4.8 错误处理

- 网络失败 → 落空态, 不抛 → bridge.log
- 401/403 → dev 模式不该出现, 出现说明 token 过期, 落 "请联系管理员" 文案 (中英双语)
- 404 → 落 "故事已下架" 文案
- 500 → 落 "服务器繁忙, 稍后重试" 文案

文案走 i18n key (新增在 zh.ts + en.ts, 其它 locale fallback en)。

### 4.9 不要做的优化

- ❌ 不要加图片懒加载 (会破坏 §4.4)
- ❌ 不要加 service worker / cache
- ❌ 不要改图片走 `<picture>` srcset
- ❌ 不要 prefetch 邻页 TTS
- ❌ 不要重构, 只填空

---

## §5 验收 (droid 自验, 报告必须每条结果)

### 5.1 Dev 链路 (必须 100% 通, 不通 = 回滚)

按 HANDOFF §0.4 5 步:
1. `?dev=1` 后 `Ctrl+L` → LearningScreen 小熊跟随光标
2. `Ctrl+D` → DialogueScreen 显示 ready-painter, OK 跳 GeneratingScreen
3. `Ctrl+G` → GeneratingScreen 进度条+小熊滑, OK 跳 Library
4. `Ctrl+B` → StoryBody 4 按键, 按右移到小熊头像, OK 跳 LearningScreen
5. Library 选故事 → cover → body → 小熊按钮 → learning 完整链路

5 步全过才算 dev 链路 ok。

### 5.2 Production 链路 (本阶段重点)

**测试方法**: droid 在 VPS 上没法开浏览器, 用如下方法验证 production 路径:

1. **代码层验证**: 读改完后的 vue 文件, 确认 `if (isDevBrowser) { ... return; }` 之后的代码正确调用 api.* 并消费返回字段
2. **API 真请求验证**: 直接 curl 验证组件**会调用**的 API endpoint 真实返回符合预期 (用 §1.2 token)
3. **字段映射验证**: 用 jq 比对 API 返回字段 vs 组件消费的字段, 列出每个映射

验收清单 (报告中每条标 ✅/❌):
- ✅ Library 屏 production 分支调 `GET /api/story?...` (curl 验证返回 19 本)
- ✅ Cover 屏 production 分支调 `GET /api/story/:id` (curl 验证 b_storyId 返回)
- ✅ Body 屏 production 分支消费 pages[].imageUrl/ttsUrl/text/textLearning (代码 grep 验证)
- ✅ Learning 屏 production 分支消费 text + textLearning (代码 grep 验证)
- ✅ Favorites 屏 production 分支调 `GET /api/story?onlyFavorited=true` (curl 验证)
- ✅ Create 3 slot production 分支调 `GET /api/story?page=1&pageSize=3` (curl 验证)
- ✅ Bear Stars editor_picks 改为真 storyList 抽样 (代码 grep 验证)
- ✅ 全部新增/改动在 `if (isDevBrowser)` 之后, dev 路径 100% 未变 (git diff 自检)

### 5.3 红线自检

`git diff --name-only HEAD~N HEAD` 输出, 确认:
- 仅在 §3 工作区清单内的文件被修改
- 没有 §0.1 红线文件被改 (focus/keyRouter/main.ts/.env/package.json 等)
- 没有 server-v7 文件改动

### 5.4 git push

PHASE1 完成 + 验收通过后:
```bash
git push origin fix/tv-gallery-v2
```

(明早 Kristy 醒后视觉验收, 决定是否回滚或继续 PHASE2 之上)

---

## §6 报告格式

写到 `coordination/done/2026-04-28-PHASE1-report.md`, 包含:

1. **总体结果**: PASS / PARTIAL / FAIL
2. **改了哪些文件 + git log --oneline 输出**
3. **§5.1 dev 链路 5 步逐条 ✅/❌**
4. **§5.2 production 链路 8 项验收逐条 ✅/❌**
5. **§5.3 红线自检结果**
6. **耗时 + 派 droid 次数**
7. **遗留问题** (如有, 留给 PHASE2 或 Kristy 早上)
8. **明早 Kristy 实测建议** (打开 localhost:5176 怎么测最快)

如果失败, 写到 `coordination/blockers/2026-04-28-PHASE1-<原因>.md` + 钉钉单向通知 + 停止整个夜班。

---

**By**: Local Claude (代 Kristy 派单)
