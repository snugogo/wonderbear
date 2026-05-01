# WO-3-L0.1 vocab 链路调研报告

> 调研时间: 2026-05-01 | 只读,未修改任何文件 | 目标目录: `/opt/wonderbear/server-v7`

---

## §1 vocab routes (0 个匹配点)

在 `src/routes/` 下 grep `vocab` / `Vocab` **无任何匹配**。

- `routes/tts.js` — TTS 合成路由 (`POST /api/tts/synthesize`, `GET /api/tts/voices`),不含 vocab 路由逻辑。它调用 `services/tts.js` 的 `synthesize()` 但路由层不区分 purpose。
- 结论: **不存在 vocab 相关的 API 路由**。

---

## §2 vocab jobs/workers (0 个文件)

项目 `src/` 下不存在 `jobs/` 或 `workers/` 目录。只有 `queues/storyJob.js` 一个队列文件,且该文件不含 vocab 引用。

vocab 字样仅出现在以下**非 jobs/workers 路径**的文件中:

| 文件 | 关键函数/行号 | 作用 |
|------|-------------|------|
| `services/tts.js` | `resolvePurposeConfig()` (L93), `VALID_PURPOSES` (L91) | TTS 三角色(narration/dialogue/vocab) 模型+音色选择; `purpose='vocab'` 走 cosyvoice-v2 + longxiaoxia_v2 |
| `services/dialogue-quality.js` | `evaluateReply()` (L68), `shouldForceDone()` (L162) | 评估儿童回复质量,词汇量分级 `empty/basic/rich`,不是"生词表"概念 |
| `utils/storyPrompt.js` | `buildStorySystemPrompt()` | 构造 LLM prompt,包含 age-based 词汇建议和 quality 信号(vocabulary 字段作为 prompt 元数据) |

**结论: 不存在 vocab 相关的 job/worker 文件。**

---

## §3 Story 完成回调链 (3 处)

| 文件 | 行号 | 函数/上下文 | 说明 |
|------|------|-----------|------|
| `queues/storyJob.js` | 344-345 | `runOne()` → `prisma.story.update()` | **设置** `stage: 'done', status: 'completed'` — Story 生成管线终点(LLM→Image→TTS→Assembly→done) |
| `routes/story.js` | 999 | GET story list handler | **查询** `where: { childId, status: 'completed' }` — 列表接口过滤已完成 Story |
| `routes/child.js` | 349, 354 | GET child profile handler | **聚合** `status: 'completed'` — 统计孩子的已完成 Story 数量和最近时间 |

**补充发现:**

- `onCompleted` / `afterStoryComplete` / `completeStory` — **无任何匹配**
- `storyJob.js` 的 `runOne()` 在 Story 完成后**没有任何回调、hook、emit、notify 机制** — 只是更新 DB 字段后静默结束
- 管线是**同步链式调用** (`runOne` 内依次 await LLM → Image → TTS → Assembly),不是事件驱动

---

## §4 关键观察

1. **vocab 现在没有被 Story 完成时触发。** Story 完成链路 (`queues/storyJob.js:runOne()`) 只管生成封面/内页插图、TTS 配音和组装,完成后仅写 DB,完全不涉及 vocab 逻辑。vocab 仅作为 TTS 的一个 purpose 枚举值存在(`services/tts.js`),以及 `dialogue-quality.js` 中用于衡量儿童回复质量(与"生词表/词汇学习"是不同概念)。

2. **没有现成的 job 队列基础设施。** 项目采用 `queues/storyJob.js` 的**内存数组队列**(FIFO + 优先级 lane),不是 BullMQ/Redis 队列。不存在 worker 进程或独立 consumer。`plugins/storyQueue.js` 仅做 Fastify 装饰器注册,无回调钩子。

3. **若要做 vocab 链路(Story 完成 → 生成生词表),需要从零搭建:** 要么在 `storyJob.js:runOne()` 完成处插入新 step,要么创建独立的 worker/job 机制。两种方案都需要新增代码,当前代码库没有预留 hook 点。
