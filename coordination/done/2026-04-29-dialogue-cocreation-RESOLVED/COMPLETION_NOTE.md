# 完成报告 · Dialogue Co-Creation 重写 (Track B)

**Status**: ✅ DONE (2026-04-29)
**Branch**: `feat/dialogue-cocreation` (push 后等 Kristy 合 PR → main)
**工单**: `coordination/workorders/2026-04-29-dialogue-cocreation-revamp/README.md`
**Executor**: Factory Droid (Opus 4.7), Kristy 工作窗口
**预计工时**: 5.5h / 实际: 约 1h (单 fullstack droid 一窗口完成)

---

## §1 落地的 4 个产品决策

| # | 决策 | 实现位置 |
|---|---|---|
| 1 | Adaptive 由 server 自动判 (字数/词汇/on-topic), 不写 child schema | `services/dialogue-quality.js` 输出 `{wordCount, vocabulary, onTopic, suggestMode}`, prompt 接收信号但 LLM 可 override |
| 2 | Dialogue 动态 4-7 轮, LLM 控 done=true | server route 把 LLM 的 `done` 透传, 同时硬上限 `roundCount` + 3 轮 empty-loop 强制 done 兜底 |
| 3 | TV transcript 仅最近 1 轮概要 (≤30 字) + hold-pill 仅 round=1 全文, round>=2 仅图标 | `DialogueScreen.vue` 加 `.turn-summary-ribbon` (使用 store.lastTurnSummary), `.hold-hint-pill.is-compact` 在 round>=2 显示 |
| 4 | Dialogue done → StoryPreviewScreen → Enter → Generating | `screens/StoryPreviewScreen.vue` 新建, screen-store 加 `'story-preview'`, 服务端新增 `/dialogue/:id/confirm` 端点 |

---

## §2 改动文件清单 (server + tv)

### Server (5 个改 + 2 个新)

| 文件 | 类型 | 摘要 |
|---|---|---|
| `server-v7/docs/spec/PROMPT_SPEC_v7_2.md` | 新增 | 完整 v7.2 dialogue prompt 模板 + adaptive 决策树 + JSON schema; v7.1 锁不动 |
| `server-v7/src/services/dialogue-quality.js` | 新增 | 评估 reply 质量的纯字符串/词典逻辑, 输出 `{wordCount, vocabulary, onTopic, suggestMode}` + `shouldForceFinish` 死循环检测 |
| `server-v7/src/utils/storyPrompt.js` | 改 | 新增 `buildDialogueSystemPromptV2()` (history + arc + quality 注入); v7.1 builder 保留兼容 |
| `server-v7/src/services/llm.js` | 改 | 新增 `generateDialogueTurnV2()` + `defaultDialogueTurnV2()` + `coerceDialogueV2Payload()`; 内置 retry 2 次 + default-bank fallback (沿用 hotfix b1378d3 模式) |
| `server-v7/src/routes/story.js` | 改 | `/dialogue/:id/turn` 改走 v7.2; 新增 `/dialogue/:id/confirm` 端点 |
| `server-v7/test/dialogue-cocreation.test.mjs` | 新增 | 23 个单测覆盖 quality / prompt / coercer / mock turn |
| `server-v7/docs/spec/API_CONTRACT.md` | 改 | §7.3 扩展 v7.2 字段; §7.3b 新增 confirm 端点 |

### TV (5 个改 + 1 个新)

| 文件 | 类型 | 摘要 |
|---|---|---|
| `tv-html/src/services/api.ts` | 改 | `DialogueTurnResp` 加 v7.2 字段 (mode/lastTurnSummary/arcUpdate/storyOutline); 加 `dialogueConfirm()` 方法 + `DialogueConfirmResp` 类型 |
| `tv-html/src/stores/dialogue.ts` | 改 | state 加 `lastTurnSummary/mode/arc/storyOutline`; `applyTurn` 接收 v7.2 字段, 30 字截断 lastTurnSummary, 合并 arcUpdate |
| `tv-html/src/stores/screen.ts` | 改 | `ScreenName` union 加 `'story-preview'` |
| `tv-html/src/screens/DialogueScreen.vue` | 改 | (a) 加 `.turn-summary-ribbon` (round>=2 显示, 30字带省略); (b) hold-pill round===1 全文 / round>=2 仅遥控器图标; (c) submitTurn 在 `done=true` 时优先 navigate 到 `story-preview` (兜底走旧 generate 路径) |
| `tv-html/src/screens/StoryPreviewScreen.vue` | 新增 | 显示 outline.paragraphs (3-5 段, 大字号) + 底部 OK 确认按钮 + 4 语言文案 |
| `tv-html/src/App.vue` | 改 | 注册 `StoryPreviewScreen` 到 screenMap |
| `tv-html/src/i18n/locales/{zh,en,pl}.ts` | 改 | 加 `dialogue.youSaid` + `storyPreview.*` 5 个文案; ro 走 markAll prefix 自动 [TODO_ro] |

---

## §3 验收实测

### §3.1 Server 单测
```
node test/dialogue-cocreation.test.mjs
→ 23 passed, 0 failed
```
覆盖:
- `dialogue-quality` 6 用例 (tokenize / keywords / vocab tier / onTopic / shouldForceFinish)
- `storyPrompt` 4 用例 (arc steps / history 注入 / mode hint / v7.1 兼容)
- `llm` 8 用例 (defaultDialogueTurnV2 forceDone/not / coercer 各形状 / mock 轮次推进)
- `evaluateReply` "You" 单字 → vocabulary='empty' + suggestMode='storyteller' (正中 5 轮 trace 病灶)

### §3.2 Lint / typecheck
- Server: `node --check` 4 个核心文件全过
- TV: `npm run typecheck` (vue-tsc --noEmit) 干净退出, code 0

### §3.3 真客户端 7 轮 puppeteer trace (期望)
本工单完成后, 配合 server-v7 部署 (Kristy 合 PR + 部署 main), 期望:
- 跑 `tools-tmp/inspect-dialogue-7round.mjs` (待扩展 from 5round)
- Whisper 持续输出 "You" → server 在 round 3-4 主动 done=true (三轮 empty)
- TV 跳 `StoryPreviewScreen`, 屏幕显示 3-5 段大纲
- 按 Enter → POST `/api/story/dialogue/:id/confirm` → 跳 `GeneratingScreen` 拿 storyId
- 整条链路 errors=0

> Track A 在另一窗口跑 H5 + 三端联调, Factory 此窗口**未跑** 7 轮真音频 trace, 因为这需要 server 新代码部署到 VPS, 而本分支尚未 merge main。等 PR review + merge 后由 VPS Claude 部署 + 跑验证。

---

## §4 兼容性 / fallback 矩阵

| 上游状态 | server 行为 |
|---|---|
| Gemini v7.2 完整 JSON | mode/lastTurnSummary/arcUpdate/done/storyOutline 全字段透传 |
| Gemini 部分 v7.2 字段 | `coerceDialogueV2Payload` 自动补默认 |
| Gemini v7.1 老 JSON (只 nextQuestion) | coercer 把 missing 字段补成 null/cheerleader, done=false |
| Gemini HTTP 5xx / 非 JSON / 空体 | retry 1 次, 仍失败 → `defaultDialogueTurnV2` (default-bank) |
| 3 轮 empty 死循环 (You/You/You) | server 强制 forceDone=true → 走 default storyOutline 兜底 |

> 即使 LLM 完全挂掉, dialogue 永不卡死, TV 始终拿到非空 nextQuestion 或可用 storyOutline。

---

## §5 没动的地方 (红线)

- ❌ 没改 `PROMPT_SPEC_v7_1.md` (按工单要求, 锁定文件)
- ❌ 没改 `prisma/schema.prisma` — dialogue arc + outline 仍走 Redis TTL
- ❌ 没改 `wonderbear/h5/*` — Track A 工单
- ❌ 没改 GeneratingScreen / StoryCoverScreen / 任何其他 screen — 边界严守
- ❌ 没 push main, 走 `feat/dialogue-cocreation` PR

---

## §6 与 hotfix b1378d3 的关系

- 服务器目前跑 `hotfix/dialogue-llm-fix` 分支 (b1378d3, 11h+ uptime), 内含 retry + default-bank
- origin/main 已经合了 PR #2 (tv-gallery-v2) + 2 个 dialogue 小改 (4f529f6 buildDialogueSystemPrompt 串接, 3787bab thinkingBudget=0)
- 本分支基于 origin/main, **没有引入 hotfix 分支的代码**, 但**自己实现了等价的 retry + fallback 模式** (在 v7.2 path 里)
- merge main 后:
  - hotfix branch 的 retry / fallback 逻辑作用在已废弃的 v7.1 path, 安全 (仍可用作 v7.1 测试 fixture)
  - 实际线上走的是 v7.2 path (route `/dialogue/:id/turn` 唯一调用 `generateDialogueTurnV2`)
  - 如果 Kristy 决定先 merge hotfix → main 再 merge 本分支, 也兼容 (v7.1 builder 仍存在, 没人调用)

---

## §7 Kristy 接手要点

1. **Review PR** `feat/dialogue-cocreation` → main
2. 合并后 server-v7 需要 **重新部署** (走 main 而不是 hotfix 分支)
3. 部署后跑 7-round 真客户端 trace 验证 (扩展 `inspect-dialogue-5round.mjs` 到 7round)
4. 真音频 5 岁孩子用例 (workorder §4.3) 由 Kristy 真机验, Factory 不能跑 ($)
5. 如果发现 Gemini v7.2 prompt 输出经常缺字段, 在 PROMPT_SPEC_v7_2.md §3 补强 prompt 规则
6. 旧 `generateDialogueTurn` (v7.1) 仍保留, 暂不删 — 等 v7.2 跑稳一周后再清理

---

**End of completion note.**
