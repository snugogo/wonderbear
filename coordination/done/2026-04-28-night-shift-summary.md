# 夜班 Summary — 2026-04-28

**To**: Kristy (明早 git pull 看)
**From**: VPS Claude (orchestrator)
**夜班窗口**: 2026-04-27 18:26 UTC ~ (北京 2026-04-28 凌晨)
**Branch**: `fix/tv-gallery-v2` HEAD `7d526f6` (已 push 到 origin)

---

## 1. 总体结果

**夜班全 PASS**, 0 blocker。PHASE1 + PHASE2 验收全部通过, 红线零触发, dev 链路 100% 保留, 总开销 ≤ $0.02 (PHASE2 录音 fallback 1 轮 ASR+LLM 在 workorder §4.4 明确授权范围内, 无任何 storyGenerate)。

| 阶段 | 结果 | 报告 |
|---|---|---|
| 开场 健康检查 | ✅ 全过 | `coordination/done/2026-04-28-night-shift-start.md` |
| PHASE1 服务器读链路 | ✅ PASS | `coordination/done/2026-04-28-PHASE1-report.md` |
| PHASE2 服务器写链路代码接通 | ✅ PASS | `coordination/done/2026-04-28-PHASE2-report.md` |
| Blocker | 无 | (`coordination/blockers/` 为空) |

---

## 2. 改动统计

PHASE1 + PHASE2 合计 10 个 commit, 9 个文件改动 (含 2 份 phase report 不计):

```
7d526f6 chore(coord): PHASE2 report — TV-HTML server write integration
da8ac2f feat(tv-html-phase2): annotate DialogueScreen paid-API call sites
e3f79e2 feat(tv-html-phase2): GeneratingScreen prod stage-label + 1.5s poll
1a700dc chore(coord): PHASE1 report — TV-HTML server read integration
f9a0d8d feat(tv-html-phase1): editor_picks creator_nickname matches mock label
bda2c78 feat(tv-html-phase1): LeaderboardScreen editor_picks overlay from real story shelf
ca0da5e feat(tv-html-phase1): CreateScreen production fetch limited to 3 latest stories
df29b85 feat(tv-html-phase1): LearningScreen replayPage honors langMode for TTS
6747b86 feat(tv-html-phase1): StoryBodyScreen plays ttsUrlLearning when langSide=learning
a6937e8 feat(tv-html-phase1): StoryCoverScreen payload-driven storyDetail fetch
ebbf616 feat(tv-html-phase1): wire FavoritesScreen production unfavorite + onlyFavorited query
f4fb858 chore(coord): night shift kickoff report 2026-04-28 (health checks passed)
7d4a8ee chore(coord): dispatch tv-html phase1+phase2 server integration workorder ← 夜班起点
```

| 文件 | PHASE | 关键改动 |
|---|---|---|
| `tv-html/src/screens/FavoritesScreen.vue` | 1 | onlyFavorited 服务端过滤 + optimistic 取消收藏 + 失败回滚 |
| `tv-html/src/screens/StoryCoverScreen.vue` | 1 | payload.storyId 触发 storyDetail hydrate |
| `tv-html/src/screens/StoryBodyScreen.vue` | 1 | langSide 切 ttsUrl/ttsUrlLearning |
| `tv-html/src/screens/LearningScreen.vue` | 1 | langMode 切 ttsUrl/ttsUrlLearning |
| `tv-html/src/screens/CreateScreen.vue` | 1 | production limit 12→3 |
| `tv-html/src/screens/LeaderboardScreen.vue` | 1 | editor_picks 抽真 storyList 5–8 本, 真书跳转 |
| `tv-html/src/i18n/locales/{zh,en}.ts` | 1 | favorites.actions.removeFailed 双语文案 |
| `tv-html/src/screens/GeneratingScreen.vue` | 2 | 1.5s 轮询 + 服务端 genStage enum 映射 stage 文案 |
| `tv-html/src/screens/DialogueScreen.vue` | 2 | paid-API 调用点注释 (storyGenerate / dialogueTurn 等 Kristy 早上手动触发) |

PHASE1 注: LibraryScreen.vue **未改动** — production 路径在派单前已接好, 19 本 curl 验证通过。
PHASE2 注: api.ts / bridge/* 未改 — 现有方法已齐全 (`dialogueStart`/`dialogueTurn`/`storyGenerate`/`storyStatus`/`storyDetail`)。

---

## 3. 验收汇总

### PHASE1 (server-read integration)

- §5.1 dev 链路 5 步代码层 → **5/5 ✅**
- §5.2 production 链路 8 项 → **8/8 ✅** (含 19 本 / 1 收藏 / 3 最近 / b_storyId 12 页全字段 curl 实测)
- §5.3 红线自检 → **0 触发**

### PHASE2 (server-write integration)

- §4.1 dev 链路 5 步代码层 → **5/5 ✅** (DialogueScreen 8 处 isDevBrowser + GeneratingScreen 4 处 isDemoMode 全保留)
- §4.2 production 路径代码层 8 项 → **8/8 ✅**
- §4.3 红线自检 → **0 触发**
- §4.4 录音 fallback → **真实跑通** (`/tmp/p1.mp3` → dialogueStart `dlg_hy0CiNuXhHmn` → 1 轮 dialogueTurn 返回 done=false / nextRound=2 / nextText="What is Dora's best friend's name?" / safetyLevel=ok / recognizedText 非空; **0 次 storyGenerate**)
- §4.5 PHASE1 回归 → **7 文件 0 行修改**
- vue-tsc typecheck → **clean**

---

## 4. 红线对照

| 红线 | 触发? |
|---|---|
| git push 到 main | ❌ (仅 push fix/tv-gallery-v2) |
| 调付费 API (FAL/ElevenLabs/Gemini image/OpenAI image/Whisper) | ❌ storyGenerate 0 次, 仅 PHASE2 §4.4 授权范围内 1 次 dialogueTurn (ASR+LLM ≈ $0.02) |
| 改 server-v7 | ❌ 0 处 |
| 改 .env / package.json / prisma / 装新依赖 | ❌ 0 处 (npm install 副产物 package-lock 已 checkout 还原) |
| 改 main.ts / focus 系统 / keyRouter / ActivationScreen / HANDOFF §4 12 文件 | ❌ 0 处 |
| 删除 if (isDevBrowser) / if (isDemoMode()) 分支 | ❌ 全部保留 |
| 改 CSS / 动画 / 视觉 / 字体 / 图标 / 布局 | ❌ 改动均在 `<script setup>` 内 |
| 修复"看到但范围外"的 bug | ❌ 严守 workorder §3 / §2 工作区 |

---

## 5. 钉钉单向通知历史 (本夜班 3 条)

| 时间 | 内容 |
|---|---|
| 开场 | 🌙 夜班启动 健康检查全过 PHASE1 派单中 |
| PHASE1 完成 | ✅ PHASE1 完成 8 文件 0 红线 启动 PHASE2 |
| PHASE2 完成 / 夜班结束 | (本报告 push 后发) |

加上 spawn-droid.sh 自动推的 4 条 (派 PHASE1 + 完成 / 派 PHASE2 + 完成), 总钉钉历史 7 条。

---

## 6. 总耗时 + 派 droid 次数

- PHASE1: 约 2 小时 (workorder 上限 6 小时)
- PHASE2: 约 1 小时 30 分钟 (workorder 上限 4 小时)
- 总计: 2 个 droid 派单, 各 1 次, 0 次 retry, 0 次 timeout
- 节余明显, 早于上限完工

---

## 7. 遗留 TODO (留 Kristy 早上看)

详见两份 phase report 的 §7 / §10 段。汇总要点:

**PHASE1 遗留**:
1. childId 依赖 — deep-link 跳过 HomeScreen 直接进 Library/Favorites/Create 时, child.activeChildId 可能 undefined → 服务器返回 90001。主链路 (Home onMounted refresh) OK
2. FavoritesScreen 删除按钮当前是"取消收藏"语义, 不是硬删。Kristy 想要硬删 1 行 `api.storyDelete(id)` 替换即可
3. StoryBody 切语言重 cue audio (从当前页头开始), 没保留进度
4. editor_picks 每次 mount 重新随机抽样, 想稳定可后续在 child 维度持久化种子
5. StoryCover storyDetail loading 期间无视觉反馈

**PHASE2 遗留**:
1. safetyLevel='warn' 真测 — 需要真录音说敏感词触发, 等 Kristy 早上
2. 取消生成 / 重试 / 失败 fallback / 硬件 GP15 SCO wav 录音 — workorder §1.3 明确 out-of-scope
3. dev 录音 mimeType detect 硬编码 audio/webm — HANDOFF §6 已留 TODO, 不在 PHASE2

---

## 8. 明早 Kristy 实测建议

### 8.1 5 分钟快测 (确认 PHASE1 没坏 dev 链路)

1. 打开 `localhost:5176/?dev=1`
2. 跑 `Ctrl+L` / `Ctrl+D` / `Ctrl+G` / `Ctrl+B` / `Ctrl+H` 5 个 dev 热键
3. Home → Stories → 任意一本 → cover → body → 小熊头像 → learning, 完整链路
4. Home → Bear Stars → editor_picks tab, 应该看到真书 + 点击能跳真书播放
5. Favorites → 看到 1 本收藏 (b_storyId), 试取消收藏 (会立即调真 API)
6. Create → 看 3 本最近故事 (production limit 已改 12→3)

### 8.2 真录音烧钱测 (PHASE2 production, ~$0.92)

按 PHASE2 报告 §11:
1. 打开 `localhost:5176` **不带 ?dev=1** (production 路径)
2. console 里 `__api.setDeviceToken("$(jq -r .deviceToken /tmp/e2e-test-context.json)")` + 刷新
3. Home → Create → 空 slot → Dialogue → 戴耳机说话 7 轮
4. 第 7 轮 done=true → 自动跳 Generating → ~4.5 分钟 → 跳 cover → body
5. Library 出现新书

预计 ~$0.92, 在 Kristy 个人预算内。

### 8.3 sanity curl (你 ssh 上 VPS 后)

```bash
DEVICE_TOKEN=$(jq -r .deviceToken /tmp/e2e-test-context.json)
CHILD_ID=$(jq -r .childId /tmp/e2e-test-context.json)
# Library 19 本
curl -s -H "Authorization: Bearer $DEVICE_TOKEN" "http://localhost:3000/api/story/list?childId=$CHILD_ID&limit=50" | jq '.data.total'
# 1 本收藏
curl -s -H "Authorization: Bearer $DEVICE_TOKEN" "http://localhost:3000/api/story/list?childId=$CHILD_ID&onlyFavorited=true" | jq '.data.total'
# b_storyId 12 页详情
curl -s -H "Authorization: Bearer $DEVICE_TOKEN" "http://localhost:3000/api/story/cmoh77cev00011kpxyv8nabei" | jq '.data.story | {pages: (.pages|length), favorited, status}'
```

---

## 9. orchestrator idle

按 README §6 自动停机条款: 阶段 1 + 阶段 2 全部完成 → idle, 不再做事。
等 Kristy 醒后给信号才启动 PHASE3 / 修复任务。

---

By: VPS Claude (orchestrator)
Branch HEAD: `7d526f6` (origin/fix/tv-gallery-v2 同步)
