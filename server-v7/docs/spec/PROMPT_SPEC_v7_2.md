# Prompt Spec v7.2 — Dialogue Co-Creation 增量

> **本文件是 PROMPT_SPEC_v7_1.md 的增量补丁**, 仅覆盖 dialogue 阶段。
> 故事 12 页生成 / imagePrompt sanitizer / 风格后缀 仍以 v7.1 为权威, 无任何变更。
> v7.2 仅改 dialogue prompt 模板 + 引入 adaptive 模式 + dynamic done 控制 + storyOutline 输出。

**版本**: v7.2
**生效**: 2026-04-29 起 (feat/dialogue-cocreation 分支)
**对照工单**: `coordination/workorders/2026-04-29-dialogue-cocreation-revamp/README.md`

---

## §1 为什么要 v7.2

5 轮真音频烟雾测试 (responses/2026-04-29-tv-dialogue-5round-smoke.md) 暴露:

```
Round 1..5 全部 user reply 都被 Whisper 识别为 "You"
Server 返回的 nextQuestion 反复是 "WHO is the friend / who is the special friend"
```

根因:

1. v7.1 dialogue prompt 没有"剧情骨架推进"概念, LLM 只会"再问一个开放问题"
2. v7.1 prompt 假设小孩会编故事, 当 reply 是单字 / 答非所问时, LLM 没有"切换成讲故事模式自己往下编"的能力
3. 没有 done 自决信号, 必须走满 N 轮; 当对话明显已经无效时, 也不能提前收尾
4. 没有 storyOutline 输出, generating 屏直接接管, 小孩缺少"我看到自己的故事被拼起来了"的成就感

---

## §2 v7.2 三个核心新增

### 2.1 Adaptive 模式 (server 自决, prompt 接收信号)

server 在 `services/dialogue-quality.js` 评估 child reply, 输出三类信号:

```
wordCount:  whitespace 切分后的词数
vocabulary: 'empty' | 'basic' | 'rich'
              empty   = wordCount === 0 || 全部是 stopwords
              basic   = wordCount < 4 || unique words < 3
              rich    = wordCount >= 4 && unique words >= 3
onTopic:    boolean — reply 是否含 current question 关键名词 (regex 提取)
```

server 据此 hint LLM:

```
vocabulary === 'empty' || vocabulary === 'basic' → suggestMode='storyteller'
vocabulary === 'rich' && wordCount >= 5         → suggestMode='cheerleader'
其他                                              → suggestMode='auto' (LLM 自决)
```

LLM 接收 `suggestMode` 但仍可在 JSON 输出里 override (字段 `mode`)。

> **不写 child schema** — 家长无感, 完全由 server 在线评估。

### 2.2 Dynamic 4-7 轮 (LLM 控 done=true)

- session 仍保留 `roundCount` 上限 (3-4 岁 5 轮, 5-8 岁 7 轮) — 是硬上限不是目标
- LLM 在 JSON 输出里返回 `done: true|false`
- server 接受 LLM 的 done, 但 round >= roundCount 时强制 done=true (硬上限)
- 当 LLM 在 round >= 4 主动 done=true, server 不再生成新问题, 立刻进 storyOutline 阶段
- vocabulary='empty' 持续 3 轮以上, server 也可强制 done=true (防止"You/You/You"无限循环)

### 2.3 Story Arc 推进 + storyOutline 输出

prompt 引入"故事骨架"概念, 6 个 arc step:

```
setting → character → goal → obstacle → climax → resolution
```

LLM 每轮在 JSON 输出 `arcUpdate`, 标记本轮 child 贡献了哪一步。
当 arc 6 步全部填充 OR LLM 主动 done=true OR 达到 roundCount, server 要求 LLM 输出 `storyOutline.paragraphs` (3-5 段, primary lang, 每段 ≤ 60 字)。

storyOutline 进入新增的 TV `StoryPreviewScreen`, 小孩按 Enter 后才进 generating。

---

## §3 v7.2 dialogue 系统 prompt (英文模板)

```
You are Bear, a warm playful storytelling companion for a {age}-year-old.
Target language: {primaryLang}. The child speaks {primaryLang}.
{learningLang !== 'none' ? "Also occasionally weave in one short {learningLang} word per turn for gentle bilingual exposure." : ""}

You are CO-CREATING a bedtime story with the child. This is NOT an interview.

Your job each turn:

1. Read the FULL conversation so far. Reference what the child has already added.
   NEVER repeat a beat that's already filled.

2. Decide your mode for this turn:
   - "cheerleader"  — child is leading. Validate + amplify their idea, then ask
                       ONE focused question that PUSHES THE PLOT FORWARD.
   - "storyteller"  — child is stuck or replying with single words. Tell the next
                       ~2 sentences of plot in vivid simple language, then offer a
                       2-option choice (e.g. "What color is the dragon? Red or Blue?")
                       OR ask for ONE concrete detail.

3. Track the story arc: setting → character → goal → obstacle → climax → resolution.
   Move to the NEXT empty arc step. Mark which step you filled in `arcUpdate`.

4. Decide whether to end the dialogue:
   - If the arc has setting + character + goal + (obstacle OR climax) filled,
     you MAY set `done: true` and produce `storyOutline`.
   - If the child has been giving "empty" replies (single word / off-topic) for
     3+ turns, you SHOULD switch to storyteller and consider `done: true` once
     you've filled enough arc steps yourself.

5. When `done: true`, produce `storyOutline.paragraphs`: 3 to 5 short paragraphs
   in {primaryLang}, each ≤ 60 characters, retelling the agreed plot in order.

Conversation so far:
{forEachTurn: "Round N — child said: <text>; you replied: <text>"}

Accumulated story arc (filled steps):
  setting:    {value or null}
  character:  {value or null}
  goal:       {value or null}
  obstacle:   {value or null}
  climax:     {value or null}
  resolution: {value or null}

Quality signals for the child's CURRENT reply:
  word_count: {N}
  vocabulary: {'empty' | 'basic' | 'rich'}
  on_topic:   {true | false}

Suggested mode (server hint, you may override): {suggestMode}

Respond with ONLY a valid JSON object. No markdown. No code fences.
{
  "mode": "cheerleader" | "storyteller",
  "lastTurnSummary": "短句, ≤ 30 字 in {primaryLang}, retells what the child contributed this turn",
  "nextQuestion": {
    "text": "<plot-advancing prompt OR storyteller narration + choice>, max 25 words",
    "textLearning": null | "<one short phrase in learningLang>"
  } | null,
  "arcUpdate": { "<arcStep>": "<what was contributed>" } | null,
  "done": false | true,
  "storyOutline": null | { "paragraphs": ["...", "...", "..."] },
  "safetyLevel": "ok" | "warn" | "blocked",
  "safetyReplacement": null | "<bear redirect sentence>"
}

Rules:
- When `done: true`, set `nextQuestion: null` and `storyOutline.paragraphs.length` between 3 and 5.
- When `done: false`, `nextQuestion.text` MUST be non-empty.
- `lastTurnSummary` is shown on TV in a 30-char ribbon — keep it tight, no quotes.
- Never reveal you are an AI. You are "Bear".
```

---

## §4 server-v7 实现摘要

| 文件 | 角色 |
|---|---|
| `src/services/dialogue-quality.js` (新) | 评估 reply 质量, 输出 `{wordCount, vocabulary, onTopic, suggestMode}` |
| `src/utils/storyPrompt.js` | 新增 `buildDialogueSystemPromptV2()` 导出 (v7.1 函数保留) |
| `src/services/llm.js` | 新增 `generateDialogueTurnV2()`, history+arc 注入, retry + default-bank fallback (沿用 hotfix 模式) |
| `src/routes/story.js` | `/dialogue/:id/turn` 默认走 v7.2; 新增 `/dialogue/:id/confirm` |
| `prisma/schema.prisma` | **不动 schema**, dialogue arc + outline 仍走 Redis TTL |

---

## §5 fallback / 兼容矩阵

| 上游 LLM 状态 | server 行为 |
|---|---|
| 正常返回 v7.2 完整 JSON | 直接透传, mode/lastTurnSummary/arcUpdate/done/storyOutline 全可用 |
| 返回 v7.2 部分字段 (e.g. 缺 mode) | 用启发式补默认值 (mode 缺省按 suggestMode), 不抛错 |
| 返回 v7.1 老 JSON (只有 nextQuestion) | server 把缺失字段补成 null, mode 默认 'cheerleader', done=false |
| HTTP 5xx / 非 JSON / null 字段 | 走 default-bank fallback (沿用 b1378d3 hotfix) |
| Retry 2 次仍失败 | default-bank 输出, mode='storyteller', lastTurnSummary=null |

> **关键**: 即使 LLM 完全挂掉, default-bank 也保证 `nextQuestion` 永远非空, dialogue 永不卡死。

---

## §6 storyOutline → 12 页扩写 (v7.1 仍是权威)

`storyOutline.paragraphs` 在 generating job 里作为 `dialogueSummary.outline` 字段传给 v7.1 的 `buildStorySystemPrompt` (新增一段 "Use this outline as your primary plot guide:" + paragraphs)。
v7.1 的输出契约 (12 页 JSON) **完全不变**。本工单**不**改 v7.1 系统 prompt。

---

## §7 不动的部分 (与 v7.1 完全一致)

- imagePromptSanitizer 全部规则 (SAFE_REPLACEMENTS / DANGEROUS_COMBOS / sanitizePromptForPage1)
- STYLE_SUFFIXES (default / screen_hd / print) 三档
- buildStorySystemPrompt() 完整 12 页输出契约
- channel config (openai / imagen / fal) 路由策略
- buildDialogueFirstQuestion() 本地化第一句

---

**End of v7.2.**
