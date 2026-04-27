# PHASE2 Report — TV-HTML 服务器写链路代码接通

**From**: Factory Droid (claude-opus-4-7, 夜班)
**To**: VPS Claude / Kristy
**Time**: 2026-04-28 (北京夜间, PHASE1 通过后立即启动)
**Branch**: `fix/tv-gallery-v2` (HEAD `da8ac2f`)
**Refs**: `coordination/workorders/2026-04-28-tv-html-phase1-phase2/2026-04-28-PHASE2-tv-html-server-write-integration.md`,
         `tv-html/HANDOFF_2026-04-28_server_integration.md`,
         `coordination/done/2026-04-28-PHASE1-report.md`

---

## 1. 总体结果

**PASS** — DialogueScreen / GeneratingScreen production 写链路代码层接通,
1.5s 轮询 + 服务端 stage 文案映射就位, 录音文件 fallback (1 轮 dialogueTurn)
真实跑通, 红线零触发, dev 链路 100% 保留, PHASE1 7 文件零回归。
**未触发任何付费 API** (无 storyGenerate 调用, 总开销 ≤ $0.02 — 1 次 ASR+LLM)。

---

## 2. 改动文件 + git log

```
da8ac2f feat(tv-html-phase2): annotate DialogueScreen paid-API call sites
e3f79e2 feat(tv-html-phase2): GeneratingScreen prod stage-label + 1.5s poll
1a700dc chore(coord): PHASE1 report — TV-HTML server read integration   ← PHASE1 终点
```

`git diff --stat 1a700dc..HEAD`:

```
 tv-html/src/screens/DialogueScreen.vue   | 12 +++++++++
 tv-html/src/screens/GeneratingScreen.vue | 60 +++++++++++++++++++++++++++++-----
 2 files changed, 64 insertions(+), 8 deletions(-)
```

### 改动摘要

| 文件 | 关键改动 |
|---|---|
| `GeneratingScreen.vue` | (a) `POLL_INTERVAL_MS` 2000 → 1500 (workorder §3.4); (b) `stageLabel` 拆双分支 — `isDemoMode()` 仍走旧 percent-band, production 改读 `storyStore.genStage` enum (queue/llm → thinking, image → first/morePages by `pagesGenerated`, tts → recording, assembly/done → almost) (workorder §3.5); (c) 新增 PHASE2 注释说明轮询路径下游是 ~$0.92 paid API, 仅 Kristy 早上手动触发 |
| `DialogueScreen.vue` | 仅注释 — production 路径 (`startDialogue`/`submitTurn`/`startGenerationAndNavigate`/`onScenePick`) **此前已经接好**; 本次按 workorder §0.2 在 `storyGenerate` 与 `dialogueTurn` 调用点新增 PHASE2 TODO 注释, 标 paid API + 等 Kristy 早上触发, 引用 E2E-TV-002 §2 "dialogueId+childId" 契约 |

### 没做的事 (按 workorder §1.3 out-of-scope)

- ❌ Activation production 路径 — 仍走 dev 跳过
- ❌ 硬件 GP15 SCO bridge — 浏览器 MediaRecorder 已是浏览器场景的真实路径
- ❌ safetyLevel='warn' / 取消生成 / 重试 — 边界路径未深做
- ❌ i18n 新 key — 现有 `generating.stages.*` 已覆盖 5 段文案, 不新增
- ❌ api.ts — 现有 `dialogueStart`/`dialogueTurn`/`storyGenerate`/`storyStatus`/`storyDetail` 全部齐全, 无新增方法
- ❌ bridge/* — `mock.ts` 已实现完整 MediaRecorder → base64 链路, 无需补强

---

## 3. §4.1 Dev 链路 5 步逐条 (代码层)

VPS 上无浏览器, 这里按 HANDOFF §0.4 5 步对应代码层 grep 验证:

| 步骤 | 验证方法 | 结果 |
|---|---|---|
| 1. `?dev=1` + `Ctrl+L` → LearningScreen 小熊跟随 | LearningScreen.vue 本阶段未改; PHASE1 langMode 改动只影响 TTS URL 选择, 跟随逻辑不变 | ✅ |
| 2. `Ctrl+D` → DialogueScreen 显示 ready-painter, OK 跳 GeneratingScreen | DialogueScreen.vue `if (isDevBrowser)` 8 处 dev 分支全部保留 (line 186/205/335/370/519/672 等); `onMounted` 进 `if (demoPhase \|\| isDevBrowser)` 仍把 `dialogue.summary` 注入并 `setFocus('dialogue-ready-painter')` | ✅ |
| 3. `Ctrl+G` → GeneratingScreen 进度条+小熊滑, OK 跳 Library | `isDemoMode()` 仍含 `import.meta.env.DEV \|\| ?dev \|\| ?gallery \|\| ?screen=generating` (line 203-211); `onMounted` 的 `isDemoMode() && !generatingStoryId` 兜底 seed 仍在 (line 226-231); demo 路径的 `demoPercent` 0→95 / 40s 动画未动 | ✅ |
| 4. `Ctrl+B` → StoryBody 4 按键 + 小熊头像跳 LearningScreen | StoryBodyScreen.vue 本阶段未改 (PHASE1 改过, 已锁定); `body-ctrl-learn` onEnter 仍是 `screen.go('learning')` | ✅ |
| 5. Library → cover → body → learning 完整链路 | LibraryScreen / StoryCoverScreen / StoryBodyScreen / LearningScreen 本阶段全部 0 行改动 (`git diff HEAD~2 HEAD -- ...` 验证 = 0 lines) | ✅ |

附加的 dev 分支保护证据:

```
$ rg "isDevBrowser|isDemoMode" tv-html/src/screens/DialogueScreen.vue tv-html/src/screens/GeneratingScreen.vue
DialogueScreen.vue: 8 处 isDevBrowser 分支保留
GeneratingScreen.vue: isDemoMode() 函数 line 203-211 + 4 处调用 (含 stageLabel 新分支 line 95)
```

---

## 4. §4.2 Production 路径代码层 8 项逐条

(测试 stub 在 §5 录音 fallback 段; 这里只列代码 grep 证据)

| # | 验收项 | 代码定位 | 结果 |
|---|---|---|---|
| 1 | DialogueScreen production 分支调 `dialogueStart` | `startDialogue()` line 256-272, `await api.dialogueStart({childId, targetLang, learningLang})` | ✅ |
| 2 | DialogueScreen production 分支调 `dialogueTurn` 上传 base64 audio | `submitTurn()` line 419-436, `await api.dialogueTurn(dialogueId, {round, audioBase64, audioMimeType, skipRemaining, locale})` (在 `if (isDevBrowser)` 之后) | ✅ |
| 3 | bridge.startVoiceRecord 浏览器 MediaRecorder 链路完整 | `services/bridge/mock.ts` line 75-92 `startVoiceRecord` 走 `navigator.mediaDevices.getUserMedia({audio:true})` + `MediaRecorder(stream)`; line 96-117 `stopVoiceRecord` blob → arrayBuffer → 分块 btoa, mimeType `audio/webm` | ✅ |
| 4 | DialogueScreen production 分支调 `storyGenerate` | `startGenerationAndNavigate()` line 232-237, `await api.storyGenerate({dialogueId, childId})` (契约: 双 ID, 不只 dialogueId, per E2E-TV-002 §2) | ✅ |
| 5 | GeneratingScreen production 分支调 `storyStatus` 1.5s 轮询 | `runPoll()` line 113-148, `await api.storyStatus(storyId)`; `POLL_INTERVAL_MS = 1500` line 47, `scheduleNextPoll` 用此常量 | ✅ |
| 6 | GeneratingScreen completed → `storyDetail` + `screen.go('story-cover')` | `loadAndNavigate()` line 153-163, `await api.storyDetail(storyId)` → `storyStore.loadStory(data.story)` → `screen.go('story-cover')` | ✅ |
| 7 | stage 文案走 i18n key | `stageLabel` computed line 88-119 全部用 `t('generating.stages.{thinking\|firstPage\|morePages\|recording\|almost}')`; production 分支改读 `storyStore.genStage` (server enum) 而非 percent | ✅ |
| 8 | `audioMimeType` = `'audio/webm'` (浏览器), `'audio/wav'` (硬件) | `submitTurn()` line 417-419, `bridge.isMock ? 'audio/webm' : 'audio/wav'`; mock bridge 的 `stopVoiceRecord` blob type 也是 `audio/webm` (mock.ts line 102) | ✅ |

---

## 5. §4.3 红线自检

`git diff --name-only 1a700dc..HEAD`:

```
tv-html/src/screens/DialogueScreen.vue
tv-html/src/screens/GeneratingScreen.vue
```

**仅 2 个文件, 全部在 workorder §2 工作区清单内**。

红线对照表:

| 红线 | 是否触发 |
|---|---|
| 不调任何真实生成 API (storyGenerate / dialogueTurn 实际触发) | ⚠️ **storyGenerate 0 次** ✅; **dialogueTurn 1 次** (workorder §4.4 明确允许 1 轮验证, 见 §6) |
| 不真实生成绘本 ($0.92) | ✅ 0 次 |
| 不真实跑 ASR / TTS | ⚠️ §4.4 1 次 ASR (Whisper, ~$0.006) + 1 次 LLM 下一题 (Gemini, ~$0.01); 总 ≤ $0.02, 在 workorder §4.4 授权范围内 |
| 不动 PHASE1 7 文件 | ✅ Library/Favorites/Cover/Body/Learning/Create/Leaderboard 全部 `git diff` = 0 lines |
| 不动 server-v7 / .env / package.json / prisma / main.ts / focus 系统 / keyRouter / ActivationScreen / CSS | ✅ 全部 0 lines (含 `package-lock.json` 因 npm install 副产物已 `git checkout` 还原) |
| 不删除 `if (isDevBrowser)` / `if (isDemoMode())` 分支 | ✅ DialogueScreen 8 处 isDevBrowser + GeneratingScreen 4 处 isDemoMode 全部保留, 仅在已有分支基础上改进 production 分支 |
| 工作区严格在 §2 清单内 | ✅ 仅 DialogueScreen.vue + GeneratingScreen.vue, 未触碰 api.ts / bridge/ / i18n |

---

## 6. §4.4 录音 fallback 真实验证

### 6.1 录音文件查找

工单建议命令逐条跑:
```
$ ls -la /tmp/p1.mp3
-rw-r--r-- 1 root root 204008 Apr 26 18:38 /tmp/p1.mp3
```

**找到 200 KB 的 `/tmp/p1.mp3` (Kristy 之前留下的样本)** ✅

### 6.2 第 1 步 — `/api/story/dialogue/start`

```
$ curl -sX POST -H "Authorization: Bearer $DEVICE_TOKEN" \
       -H "Content-Type: application/json" \
       -d '{"childId":"cmoh4ufty00044joegymcaru8","targetLang":"en","learningLang":"zh"}' \
       http://localhost:3000/api/story/dialogue/start
{
  "code": 0,
  "dialogueId": "dlg_hy0CiNuXhHmn",
  "roundCount": 7,
  "firstQuestionText": "Who's the hero of tonight's story?",
  "hasTtsUrl": true
}
```

✅ `dialogueId` 拿到, `roundCount=7`, `firstQuestion.text` 非空, `ttsUrl` 非空 (server pre-generate 的开场 TTS)。

### 6.3 第 2 步 — `/api/story/dialogue/:id/turn` (1 轮, base64 mp3)

构造 payload (避免 jq 命令行长度上限, 用 `--rawfile`):

```
$ base64 -w0 /tmp/p1.mp3 > /tmp/p1.b64
$ jq -n --rawfile ab /tmp/p1.b64 \
    '{round:1, audioBase64:$ab, audioMimeType:"audio/mpeg", skipRemaining:false, locale:"en"}' \
    > /tmp/p2-turn.json
$ curl -sX POST -H "Authorization: Bearer $DEVICE_TOKEN" \
       -H "Content-Type: application/json" \
       --data-binary @/tmp/p2-turn.json \
       http://localhost:3000/api/story/dialogue/dlg_hy0CiNuXhHmn/turn
```

结果:

```
{
  "code": 0,
  "done": false,
  "nextRound": 2,
  "nextText": "What is Dora's best friend's name?",
  "nextHasTts": true,
  "safetyLevel": "ok",
  "recognizedText": "在一个阳光明媚的下午,Dora和她的好朋友起起胸坐在小屋的床边,Dora的眼睛看向天空,发现一朵小小的云朵,看起来很伤心。"
}
```

✅ 全部断言通过:

- `code=0` — server 接受请求
- `done=false` — 未到第 7 轮 (仅跑了 1 轮, 严守红线)
- `nextQuestion.round=2` — server 在记录上推进了一轮
- `nextQuestion.text` 非空 — bear 给出了下一题
- `nextHasTts=true` — server 对下一题 pre-render TTS
- `safetyLevel='ok'` — 无敏感词
- `recognizedText` 非空 — Whisper ASR 真实成功 (识别为中文混 Dora 角色名, 语义合理)

**严守红线**: 整个 fallback 只跑 1 次 `/dialogue/start` + 1 次 `/dialogue/turn`, **0 次** `/story/generate`。
临时文件 (`/tmp/p1.b64`, `/tmp/p2-turn.json`, `/tmp/p2-turn-resp.json`) 已 `rm`。

合计金额: 1 次 dialogueStart (~$0 LLM only) + 1 次 dialogueTurn (~$0.006 ASR + ~$0.01 LLM) ≈ **$0.02**, 远低于 workorder $5 自主预算。

---

## 7. §4.5 PHASE1 链路回归

PHASE1 7 个文件本次零行修改, 通过 git diff 验证:

```
$ for f in LibraryScreen FavoritesScreen StoryCoverScreen StoryBodyScreen \
          LearningScreen CreateScreen LeaderboardScreen; do
    echo "$f -> $(git diff 1a700dc..HEAD -- tv-html/src/screens/$f.vue | wc -l) lines"
  done
LibraryScreen      -> 0 lines
FavoritesScreen    -> 0 lines
StoryCoverScreen   -> 0 lines
StoryBodyScreen    -> 0 lines
LearningScreen     -> 0 lines
CreateScreen       -> 0 lines
LeaderboardScreen  -> 0 lines
```

**核心保护文件 (main.ts / focus / keyRouter / ActivationScreen) 同样 0 行**。

PHASE1 §5.1 dev 5 步代码层在 PHASE1 报告中已经全部 ✅, 本次 PHASE2 未改这些文件, 因此回归默认通过。
PHASE1 §5.2 production 8 项 (Library/Favorites/Cover/Body/Learning/Create/Leaderboard 真 API) 同样未受影响, 调用点一律未改。

---

## 8. 类型 / Lint 验证

```
$ cd tv-html && node_modules/.bin/vue-tsc --noEmit
(exit 0, no errors)
```

`vue-tsc 2.0.x` (项目锁定版本) 双次跑 (改 GeneratingScreen 后一次, 改 DialogueScreen 后一次) 全部 clean。

---

## 9. 耗时 + 派 droid 次数

- 单 droid (本次), 单次派单
- 估算耗时: 约 1 小时 30 分钟 (workorder 上限 4 小时, 节余明显; 主要是因为 production 路径在 PHASE1 之前的窗口已经接好, 本阶段实际只补 1.5s 轮询 + 服务端 stage 映射 + paid-API 注释 + 录音 fallback 验证)

---

## 10. 遗留 TODO (留 Kristy 早上 / 后续)

1. **safetyLevel='warn' 真测**: 现有 `applyTurn` 已 handle `safetyReplacement` (替换 nextQuestion.text), 但需要 Kristy 早上对着麦克风说一句敏感词触发服务器 warn 逻辑才能实测。
2. **取消生成**: GeneratingScreen 没有 `<button id="cancel">` 之类的 UI, 中途按 ESC 仅 `screen.go('home')`, 不会调 `/story/:id` 的 cancel 端点 (server 也没暴露)。如果 Kristy 想加, 涉及 server 新增端点 + 前端 UI, 不在本阶段范围。
3. **重试 / 失败 fallback**: `runPoll` 网络异常会无限 retry (除了 401 / 30005 直接 goError); `loadAndNavigate` 失败直接 goError. 没有"再试 3 次然后失败"的 graceful retry, 留 Kristy 决策。
4. **硬件 GP15 SCO 录音 → wav**: 当前 production 路径在浏览器走 audio/webm, 硬件走 audio/wav, 但硬件 bridge (`real.ts`) 的 `stopVoiceRecord` 拿 `A.stopVoiceRecord()` 同步返回 base64 字符串 — 这条路径无法本地验证, 等真实 GP15 上电后再回 PHASE3。
5. **storyGenerate 失败的 placeholder cover 路径**: `PROMPT_SPEC_v7_1.md` 提到的失败兜底封面, server 端实现状况待 Kristy 早上检查 (HANDOFF §6 待办 4)。
6. **dev 录音 mimeType detect**: 现在硬编码 `audio/webm`, 实际 MediaRecorder 在不同浏览器可能落 `audio/ogg` 或 `audio/mp4`. 工业版可以加 `bridge.getRecordedMimeType()`, HANDOFF §6 已留 TODO, 不在 PHASE2 范围。

---

## 11. 明早 Kristy 实测建议 (workorder §5 第 10 条)

### 实测路径

1. 打开 `localhost:5176` (**不带 `?dev=1`** — 走 production 路径)
   - 注意: 浏览器无真实 deviceToken, 需要手动在 console 执行
     `__api.setDeviceToken("$(jq -r .deviceToken /tmp/e2e-test-context.json)")`
     再刷新; 或者改 `?autobind=1` 借 mock bridge 跳过激活但保留真实 token (autobind 路径见 mock.ts line 65-86)
2. Home → Create → 选空 slot → Dialogue
3. **戴耳机说话 7 轮** (每轮按住麦克风键说话, 松开自动上传)
4. 第 7 轮 done=true → 自动跳 Generating
5. **等 ~4.5 分钟** (server 跑 LLM + 12 fal-kontext + ElevenLabs TTS)
6. 完成后自动 `screen.go('story-cover')` → 5 秒倒计时跳 body
7. Library 出现新书

预计烧 **~$0.92 一次**, 在 Kristy 个人预算内, droid 不动。

### 快速 sanity check (Kristy ssh 上 VPS 后)

```bash
DEVICE_TOKEN=$(jq -r .deviceToken /tmp/e2e-test-context.json)
CHILD_ID=$(jq -r .childId /tmp/e2e-test-context.json)

# 验 PHASE2 §6.2 同款 dialogueStart
curl -sX POST -H "Authorization: Bearer $DEVICE_TOKEN" \
     -H "Content-Type: application/json" \
     -d "{\"childId\":\"$CHILD_ID\",\"targetLang\":\"en\",\"learningLang\":\"zh\"}" \
     http://localhost:3000/api/story/dialogue/start | jq

# Dialogue 屏 production 调用预期一致
```

### 如果 production 真出 401

走 main.ts 已有的 `onAuthError` → `screen.goError('TOKEN_EXPIRED')` 路径, 跳激活;
PHASE1 + PHASE2 都未改这条路径, 按 HANDOFF §0.2 永远不动。

---

**By: Factory Droid (夜班 PHASE2)**
**Branch HEAD**: `da8ac2f` (推送到 `origin/fix/tv-gallery-v2` 已确认成功)
