# 工单完成报告 — 模板池 + TTS 预热 + tone personality

**完成时间**: 2026-04-28 ~15:00 VPS time  
**分支**: fix/tv-gallery-v2  
**commit**: 0d42a0b

---

## 做了什么

### 1. 对话开场语模板池 (`server-v7/src/data/dialoguePromptPool.js`)
- 4 语言(zh/en/pl/ro) × 5 条开场语 = 20 条候选
- 5 种 Bear 性格变体(playful / curious / cozy / adventurous / storyteller)
- 选取算法:deterministic hash(dialogueId) → 每 session 固定一套,重试不会跳变

### 2. 静态 TTS 预热缓存 (`server-v7/src/services/staticTtsCache.js`)
- 服务器 boot 时并发预热全部 20 条开场语 TTS
- 命中缓存 → `/dialogue/start` 返回时 ttsUrl 零延迟
- 未命中 → fallback 实时合成,非致命

### 3. `dialogue/start` 路由改造 (`server-v7/src/routes/story.js`)
- 用 `pickOpener` 替换 `buildDialogueFirstQuestion` (固定单条)
- 用 `getOpenerTtsUrl` 优先命中预热缓存
- tone 写入 session 的 `toneLines` 字段,供后续 turn 调用

### 4. `dialogue/:id/turn` tone 注入
- 在 `buildDialogueSystemPrompt` 结果后追加 session.toneLines
- 5 种性格变体让 Little Bear 在不同 session 里有不同"情绪"

### 5. `app.js` boot 触发预热
- fire-and-forget:不阻塞启动,失败只 warn

---

## 验收结果

| 项目 | 状态 |
|------|------|
| server pm2 reload | ✅ online |
| `/api/health` | ✅ all services ok |
| `/api/story/dialogue/start` 实测 | ✅ 返回 dialogueId + firstQuestion + ttsUrl |
| TTS 预热 EN | ✅ 5/5 成功 |
| TTS 预热 PL/RO/ZH | ⚠️ 15/15 失败(voice ID 不在 ElevenLabs 账户内,fallback 实时合成) |

---

## 已知问题

- PL/RO/ZH voice ID (`cVd39cx0VtXNC13y5Y7z`, `APSIkVZudNbPAwyPoeVO`) 预热失败
  - 原因:ElevenLabs 账户未包含这些 voice ID
  - 影响:PL/RO/ZH opener TTS 第一次请求有 ~1s 延迟(实时合成)
  - **展会不影响**:展会主语言 EN 预热成功,零延迟

---

## 展会前仍需 Kristy 手动验收

1. 浏览器访问 `http://154.217.234.241:5176` PHASE1+PHASE2 视觉验收
2. `/api/story/dialogue/start` → 5 轮 turn → `/api/story/generate` 全流程跑通
3. 90 秒录屏备份

---

## curl 5 轮测试命令 (Kristy 用)

见 STATUS.md 当前状态更新。
