# Workorder · Dialogue Co-Creation 重写 (Server Prompt + TV UI 双端)

**From**: Factory (Droid) — 当前 Kristy 工作窗口
**To**: 下一个窗口（建议拆 server-droid + tv-droid 协作, 或一个 fullstack droid 全做）
**Time**: 2026-04-29
**Status**: PENDING — 优先级 P1（hotfix 阻塞解除后第一波正式迭代）, 与 H5 三端集成并行
**Owner**: Kristy 决策点已拍 (本工单 §1 拍板记录)
**Refs**:
- AGENTS.md §3 (PROMPT_SPEC_v7_1 是唯一权威, 本工单写 PROMPT_SPEC_v7_2)
- `coordination/responses/2026-04-29-tv-dialogue-5round-smoke.md`
- 上游已通: `done/2026-04-29-server-dialogue-llm-fix-RESOLVED/`

---

## §0 摘要 (1 段)

5 轮真音频烟雾验证暴露了**产品体验 bug**: dialogue 在 7 轮里反复追问 "WHO is the friend / who is the special friend", 没有上下文连贯, 不像故事接龙, 像审问。本工单从 **server prompt + adaptive 模式 + TV UI + 流程顺序** 四个层面重写 dialogue, 使之变成"AI + 小孩共创故事"的体验。Kristy 已拍板 4 个产品决策点(§1)。预计工时 4-6 小时, 主要在 server prompt + TV UI 实现, 不动 DB schema, 不增加新依赖。

---

## §1 Kristy 拍板的 4 个产品决策 (基线, 不可改)

| # | 决策 | 含义 |
|---|------|------|
| 1 | **Adaptive 由 server 自动判断** (不写到 child schema) | server 在 `liveDialogueTurn()` 里看 user reply 字数 / 词汇量 / 是否 on-topic, 动态切 `storyteller` / `cheerleader` 模式, 家长无感 |
| 2 | **Dialogue 动态 4-7 轮** | LLM 控制 `done=true`, 故事框架完整就提前结束, 不一定走满 |
| 3 | **TV transcript: 仅最近 1 轮概要 + hold-pill 改图标** | 上方一行小字 "你刚说: ... / Bear 回应: ..." (不超 30 字), hold-mic pill **仅第 1 轮**全文显示, 后续轮只剩遥控器图标 |
| 4 | **Dialogue done → StoryPreviewScreen → Enter → Generating** | 中间加一屏: 文字版回放 3-5 段故事大纲, 小孩 Enter 确认才进 generating, 给"创作者"成就感 |

---

## §2 现状与问题

### §2.1 现状 (跑 5 轮 trace 得出)

```
Round 1: "Hello! Who is our story's main character today?"      → user: "You"
Round 2: "What kind of little friend will our story be about?"  → user: "You"
Round 3: "What special friend will join our story?"             → user: "You"
Round 4: "Who is our hero's special friend?"                    → user: "You"
Round 5: "What special friend will join our hero?"              → user: "You"
```

**症状**:
- Round 2-5 都在问 "WHO" / "friend" 同义反复
- 不引用前几轮的 user input
- 不推进剧情 (没有 setting / event / problem / climax)
- 触发 default-bank fallback 多次 (server 完成报告 §6 confirmed)

### §2.2 根因分析

**Root cause 1**: `buildDialogueSystemPrompt()` 没有把 dialogue 历史回放给 LLM, 每轮 Gemini 看到的是孤立的当前 user input + system prompt, 不知道前面问过什么、用户答了什么。

**Root cause 2**: prompt 模板是 "ask N questions" 而不是 "co-create a story progression"。LLM 没有"剧情骨架"的概念。

**Root cause 3**: 无 adaptive 模式分支, prompt 假设的是"小孩会编故事"。当 user reply 是 "You" / 单字 / 答非所问时, LLM 仍按"会编"模板继续问开放问题, 形成"问完 WHO 还是 WHO"循环。

**Root cause 4**: round 总数固定 7, LLM 没有"我已经收集够素材, 可以收尾了"的判断接口。

### §2.3 UI 现状

- DialogueScreen 仅显示当前题 + 录音 pill, 不显示历史
- 用户每次按 M 录完, 没有任何"我说的话被听到了"的可视确认
- bear-speaking 期间没有 TTS 文字回显

---

## §3 设计方案

### §3.1 新增文档: `PROMPT_SPEC_v7_2.md` (增量, 不改 v7.1)

放在 `wonderbear/server-v7/docs/spec/PROMPT_SPEC_v7_2.md`, 仅描述 dialogue prompt 变更。其余生图 / story body / metadata prompt 仍走 v7.1。

#### Dialogue System Prompt 模板 (v7.2)

伪代码:
```
You are Bear, a warm playful storytelling companion for a {age}-year-old.
Target language: {targetLang}. The child speaks {primaryLang}.

You are CO-CREATING a bedtime story with the child. This is NOT an interview.
Your job is to:
  1. Read the FULL conversation so far, including the child's accumulated story.
  2. Decide whether the child is leading (storyteller_mode=cheerleader) or
     needs your help (storyteller_mode=storyteller).
  3. Either:
     - cheerleader: validate and amplify their idea, then ask ONE focused
       question that PUSHES THE PLOT FORWARD. Never re-ask earlier topics.
     - storyteller: tell the next ~2 sentences of plot in vivid simple
       language, then ask the child to choose between 2 options OR add
       one detail (e.g. "What color is the dragon? Red or Blue?").
  4. Track the story arc: setting → character → goal → obstacle → climax → resolution.
     Move to the NEXT arc step each turn. Never repeat a step.
  5. When the arc has all 6 steps filled in, set done=true and produce
     storyOutline (3-5 short paragraphs in {targetLang} retelling the
     full agreed plot).

Conversation so far:
{forEachTurn: child said "X", you replied "Y"}

Accumulated story arc:
  setting:    {filled or null}
  character:  {filled or null}
  goal:       {filled or null}
  obstacle:   {filled or null}
  climax:     {filled or null}
  resolution: {filled or null}

Current child reply quality signals:
  word_count: {N}
  on_topic:   {true|false}
  vocabulary: {basic|rich|empty}

Respond ONLY in this JSON shape (responseSchema-enforced):
{
  "mode": "cheerleader" | "storyteller",
  "lastTurnSummary": "child added X about Y" (~30 chars, in targetLang),
  "nextQuestion": {
    "text": "<plot-advancing prompt OR storyteller narration + choice>",
    "textLearning": null
  },
  "arcUpdate": { "<arcStep>": "<what child contributed>" },
  "done": false | true,
  "storyOutline": null | { "paragraphs": ["…", "…", "…", "…", "…"] },
  "safetyLevel": "ok" | "soft_redirect"
}
```

#### Adaptive 模式判断逻辑 (server 决定, prompt 只接收信号)

`server-v7/src/services/dialogue-quality.js` (新文件):
```
input:  child reply text (post-Whisper)
output: { wordCount, onTopic, vocabulary }

wordCount   = words.length (split whitespace)
vocabulary  = empty   if wordCount === 0 || stopwords-only
              basic   if wordCount < 4 or unique words < 3
              rich    otherwise
onTopic     = simple LLM-free check: does reply contain at least 1 noun
              from current question's keywords? (extracted via regex
              on question text, not Gemini call — keep it cheap)
```

`liveDialogueTurn()` 决策树:
```
if vocabulary === 'empty' || vocabulary === 'basic':
  hint Gemini: storyteller_mode = 'storyteller'
elif wordCount >= 5 && vocabulary === 'rich':
  hint Gemini: storyteller_mode = 'cheerleader'
else:
  let Gemini decide via mode field in JSON

(无论哪种, 把 quality signals 传给 prompt, Gemini 仍可 override)
```

### §3.2 server-v7 实现清单

| 文件 | 改动 |
|------|------|
| `src/services/dialogue-quality.js` | 新建, 评估 child reply 质量 |
| `src/services/llm.js` | 重写 `buildDialogueSystemPrompt`(v7.2 模板); `liveDialogueTurn` 加 history + arc 状态; 接收 quality signals |
| `src/routes/story.js` | `/dialogue/:id/turn` 返回新增字段: `mode`, `lastTurnSummary`, `arcUpdate`, `storyOutline`; 兜底逻辑保留(default-bank fallback 仍在) |
| `src/routes/story.js` 新增 | `POST /api/story/dialogue/:id/confirm` — 接收小孩 Enter 确认 storyOutline 后, 触发 generating job (现在 dialogue done 直接进 generating, 改成两步) |
| `prisma/schema.prisma` | **不动 schema** — dialogue history + arc 临时存 Redis (key=dialogueId, TTL 1h), 不持久化。如需持久化作 BI 分析, 留作下次工单。 |
| `tests/llm.test.js` | 加 cases: history 注入 / arc 推进 / mode 切换 / done=true 时 storyOutline 形状 |
| `docs/spec/PROMPT_SPEC_v7_2.md` | 新增, 增量描述 |
| `docs/spec/API_CONTRACT.md` | 更新 dialogue/turn response shape + 新增 confirm 端点 |

### §3.3 TV UI 改动清单

| 文件 | 改动 |
|------|------|
| `tv-html/src/screens/DialogueScreen.vue` | (a) 加 `<TurnSummary>` 组件: 上方半透明小字 "你刚说: …" + "Bear: …", 长度上限 30 字, 来自 server `lastTurnSummary`; (b) hold-mic pill 改成: round===1 显示全文 + 遥控器图标, round>=2 仅图标 |
| `tv-html/src/screens/StoryPreviewScreen.vue` | **新建**: 显示 storyOutline.paragraphs (3-5 段, 字号大可读, 自动滚动若超屏), 底部 "Press Enter to make this story real" + 遥控器 OK 图标; Enter 触发 `/api/story/dialogue/:id/confirm` → 跳 GeneratingScreen |
| `tv-html/src/router.ts` 或 `screen-store.ts` | 加 `'story-preview'` 进 ScreenName union, dialogue done=true 不直接 go('generating') 改 go('story-preview') |
| `tv-html/src/stores/dialogue.ts` | (a) 缓存 `lastTurnSummary`(string) + `mode`(string); (b) `applyTurn` 收到 `done=true` + `storyOutline` 时存 store + screen.go('story-preview'); (c) confirm action: POST /api/.../confirm + screen.go('generating') |
| `tv-html/src/i18n/*.json` | 加 "Press Enter to make this story real" 等新文案 (en/zh/pl/ro 4 语言) |

### §3.4 三端合约改动

#### `POST /api/story/dialogue/:id/turn` Response (extended)

```json
{
  "code": 0,
  "data": {
    "round": 3,
    "done": false,
    "mode": "storyteller",
    "lastTurnSummary": "孩子说了一只蓝色小龙",
    "nextQuestion": {
      "round": 4,
      "text": "蓝色的小龙住在云端的城堡里。它的好朋友是谁? 你说一只小鸟还是一只小猫?",
      "textLearning": null,
      "ttsUrl": "data:audio/mpeg;base64,..."
    },
    "arcUpdate": { "character": "blue dragon" },
    "recognizedText": "a blue dragon",
    "summary": null,
    "storyOutline": null,
    "safetyLevel": "ok"
  }
}
```

#### `POST /api/story/dialogue/:id/confirm` (新增)

Request: `{}` (或仅 device-token / dialogueId from path)

Response:
```json
{
  "code": 0,
  "data": {
    "storyId": "story_abc123",
    "status": "queued",
    "queuePosition": 1,
    "etaSec": 75
  }
}
```

行为: 把 dialogue 的 storyOutline 移交给 generation pipeline (现在的 generating job), 返回 storyId, TV 跳 GeneratingScreen 用 storyId 轮询 progress (沿用既有契约)。

---

## §4 验收标准

### §4.1 Server 单测
- [ ] `npm run test:llm` 全过, 至少新增 5 个 case 覆盖 history 注入 / arc 推进 / mode 切换 / done=true 形状 / quality signals
- [ ] dialogue-quality.js 单测覆盖 empty / basic / rich 三档 + on-topic check
- [ ] `npm run test:smoke` 全过

### §4.2 真客户端 5-7 轮 trace (扩展 inspect-dialogue-5round.mjs → 7round)
- [ ] 第 1 轮 user reply "You" (单词) → server mode=storyteller, nextQuestion 含 2 个 choice
- [ ] 假设 fake-audio Whisper 仍输出 "You", server 在 round 3-4 应主动 done=true (因为 vocabulary 持续 empty/basic), 不走满 7 轮
- [ ] done=true 时返回 storyOutline.paragraphs.length 在 3-5
- [ ] TV 跳 StoryPreviewScreen, 屏幕上显示 3-5 段, 底部有 OK 提示
- [ ] 按 Enter → POST confirm → 跳 GeneratingScreen → 拿到 storyId
- [ ] 整条链路 errors=0

### §4.3 真音频用例 (Kristy 真机, 可选)
- [ ] 用 5 岁小孩声音录"我想要一只龙"→ TV 显示 "你刚说: 一只龙 / Bear: 太棒了..." 概要
- [ ] 连续 3 轮丰富回复 → mode 变 cheerleader, AI 不再给选择题, 只 amplify
- [ ] 全程不再出现 "WHO is the friend" 重复问

### §4.4 文档
- [ ] PROMPT_SPEC_v7_2.md 写完, 含完整 prompt 模板
- [ ] API_CONTRACT.md 更新 dialogue/turn response + 新增 confirm
- [ ] 工单 RESOLVED 报告写到 `coordination/done/2026-04-XX-dialogue-cocreation-RESOLVED/`

---

## §5 不要做的事 (红线)

- ❌ 不要改 `PROMPT_SPEC_v7_1.md` (锁定文件) — 写新版 v7_2 增量
- ❌ 不要改 prisma schema — dialogue history 走 Redis TTL, 不持久化
- ❌ 不要把 dialogue 改成多模态 (图片选择题) — 老人机硬件渲染慢, 仍走文字 + 语音
- ❌ 不要把 generating 流程并入 dialogue — confirm 屏是必须的中间态
- ❌ 不要 push main, 走分支 + PR + Kristy 合 (AGENTS.md §6)
- ❌ 不要在 dialogue 阶段调 OpenAI / fal-kontext / ElevenLabs 长流程 — 仍只调 Gemini + ElevenLabs TTS, 单轮 < 8 秒响应

---

## §6 工时预估

| 阶段 | 估时 | 备注 |
|------|------|------|
| 写 PROMPT_SPEC_v7_2.md | 30 min | 含 prompt 模板 + adaptive 决策树 + JSON schema |
| dialogue-quality.js + 单测 | 30 min | 纯字符串 / 词典逻辑, 简单 |
| llm.js 重写 buildDialogueSystemPrompt + history 注入 | 60 min | 核心改动, 含 retry / fallback 兼容 |
| story.js 路由层 + confirm 端点 | 45 min | 加 redis dialogue session store + confirm transition |
| 单测 / smoke 跑通 | 30 min | |
| TV DialogueScreen 改 turn-summary + pill | 45 min | i18n 4 语言 + 视觉 |
| TV StoryPreviewScreen 新建 + 路由 | 60 min | 新 screen + Enter → confirm + 跳 generating |
| 7 轮 trace 改写 + 实跑 | 30 min | 扩展 inspect-dialogue-5round.mjs |
| API_CONTRACT.md + done 报告 | 30 min | |
| **合计** | **约 5.5 小时** | 单 fullstack droid 一窗口可做完, 拆 server+tv 双 droid 协作 4 小时 |

---

## §7 实施顺序建议

1. **Server 先做** (PROMPT_SPEC_v7_2.md + llm.js + dialogue-quality.js + routes + tests)
2. **TV 端做改动** (DialogueScreen turn-summary + StoryPreviewScreen + confirm action)
3. **联调 7 轮 trace**
4. **写完成报告 + 更新 API_CONTRACT**
5. **Kristy review + merge PR**

---

## §8 与并行工单的关系

- **`2026-04-29-h5-three-end-integration`**: 不冲突, 可并行。该工单涉及 H5 注册引导 + 家长后台真连, 本工单只动 dialogue 流程。
- **`2026-04-28-learning-per-word-tts`**: P2 不冲突。learning 屏的 TTS 切片是 LearningScreen 上的独立功能, 与 dialogue 无关。
- **server hotfix b1378d3**: 已上线, 是本工单的基础。本工单完成后, 整套 dialogue 流程全部走新 prompt + adaptive, hotfix 的 default-bank fallback 退化成纯防御兜底, 几乎不会触发。

---

**期望 next action**: Kristy 派下一个窗口（建议 fullstack droid 一窗口做完, 或 server-droid + tv-droid 协作）按 §7 顺序实施。
