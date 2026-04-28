# 工单: server-v7 LLM Dialogue Bug 修复

**ID**: `2026-04-29-server-dialogue-llm-fix`
**创建**: 2026-04-28 23:55
**优先级**: P1 (展会前)
**预计时间**: 50 分钟
**派工人**: Kristy
**模型**: Opus 4.7

---

## §1 问题摘要

server-v7 的 dialogue 接口返回的 LLM 数据**字段名不稳定**,导致 TV 客户端拿不到 `nextQuestion`,UI 上只能反复显示 "I didn't hear you, please try again" 提示,**dialogue 不能推进到第 2 题**。

客户端 defensive 兜底已上线(`https://tv.bvtuber.com/`, hash `index-DIdnq0Pd.js`),畸形数据不会让客户端崩,但**根因在服务端**,必须修。

## §2 根因定位

文件: `/opt/wonderbear/server-v7/src/services/llm.js`

问题:
1. 调 Gemini 的 `systemPrompt` 只有一句 `'You are Little Bear.'`,过于简陋
2. **没有设置 `responseSchema` 约束 LLM 返回结构**
3. Gemini 自由发挥, 返回字段名经常不是 `nextQuestion` (可能是 `next_question` / `question` / `q` 等)
4. 服务端读不到 `nextQuestion` 时 fallback 到 `null`,客户端拿到 null 就显示 retry

## §3 修复方案 (3 层)

### 3.1 主修复: responseSchema (server-v7/src/services/llm.js)

给 Gemini 调用加 `responseSchema`,强制返回结构:

```js
const dialogueSchema = {
  type: 'object',
  properties: {
    nextQuestion: { type: 'string', description: '下一题给孩子的问题' },
    shouldEnd: { type: 'boolean', description: '是否对话结束' },
    topic: { type: 'string', description: '当前话题' }
  },
  required: ['nextQuestion', 'shouldEnd']
};

// 调 Gemini 时:
const response = await genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  generationConfig: {
    responseMimeType: 'application/json',
    responseSchema: dialogueSchema,
    thinkingBudget: 0  // dialogue 不需要 thinking
  }
}).generateContent(prompt);
```

### 3.2 防守: LLM 兜底 (server-v7/src/services/llm.js)

如果 Gemini 仍然返回畸形(极小概率),做一次 retry,still 失败就用 default question 兜底,**不能返回 null**。

### 3.3 路由层兜底 (server-v7/src/routes/dialogue.js 或对应路由文件)

dialogue/turn 路由层加 fallback:

```js
const result = await llm.generateDialogue(...);
if (!result || !result.nextQuestion) {
  return res.json({
    nextQuestion: defaultQuestions[turnNumber] || "Tell me more!",
    shouldEnd: turnNumber >= 5
  });
}
```

## §4 验收标准

完成时必须满足:

- [ ] `src/services/llm.js` 加了 `responseSchema` 约束
- [ ] 单测覆盖 schema 校验 (写在 `tests/llm.test.js`)
- [ ] 路由层 fallback 加了
- [ ] **真实 curl 测试**:
  ```bash
  # 启动 dialogue
  curl -s -X POST http://localhost:3000/api/story/dialogue/start \
    -H "Content-Type: application/json" \
    -d '{"bookId":"test-book","language":"en"}' | jq .

  # 拿到 dialogueId 后,跑 5 轮 turn,每次都应该返回 nextQuestion 字符串
  curl -s -X POST http://localhost:3000/api/story/dialogue/{DID}/turn \
    -H "Content-Type: application/json" \
    -d '{"userInput":"hello bear!"}' | jq .
  ```
  **要求**: 5 轮中至少 4 轮返回非空 `nextQuestion` 字符串
- [ ] PM2 重启后无新错误日志: `pm2 logs wonderbear-server --err --lines 50`

## §5 红线

- **必须**走 hotfix 分支: `git checkout -b hotfix/dialogue-llm-fix`
- **不能直接 push main** (Kristy 拍板)
- **不能改** systemPrompt 的人格描述 (维持 'You are Little Bear.')
- **不能改** .env 任何字段
- **不能修改** PRODUCT_CONSTITUTION.md / AGENTS.md / CLAUDE.md
- **不能动** `/opt/wonderbear/dingtalk-bot/` 目录 (这是另一个项目)

## §6 工作区

主工作区: `/opt/wonderbear/server-v7/`
关键文件:
- `src/services/llm.js` (主修复)
- `src/routes/` 下 dialogue 相关路由 (兜底)
- `tests/` 单测目录

## §7 提交流程

1. 切分支: `git checkout -b hotfix/dialogue-llm-fix`
2. 改代码 + 写单测
3. 本地 npm test 通过
4. PM2 reload server: `pm2 restart wonderbear-server --update-env`
5. 跑 curl 5 轮验证 (§4)
6. `git add` + `git commit -m "fix(dialogue): add responseSchema + fallback - hotfix"`
7. `git push origin hotfix/dialogue-llm-fix`
8. 写完成报告 (§8)
9. **不要 merge main**, 等 Kristy 拍板

## §8 完成报告

写到 `/opt/wonderbear/coordination/done/2026-04-29-server-dialogue-llm-fix-report.md`,包含:

- 完成时间
- 改动的文件清单 + 行数
- 单测结果
- 5 轮 curl 测试日志(完整 JSON 输出)
- PM2 错误日志确认无新错误
- git hotfix 分支 commit hash
- **遗留问题** (如果有)

## §9 失败处理

如果 50 分钟内无法完成,在 `coordination/blockers/` 下写一个 blocker 文件,说明:
- 卡在哪一步
- 真实错误信息(完整 stack trace)
- 推荐下一步(回滚 / 升级方案 / 其他)

绝不假装"完成了"。绝不假报告。

---

## §10 时间预估

| 步骤 | 时间 |
|---|---|
| 读 llm.js 现状 + Gemini responseSchema 文档 | 10min |
| 改 llm.js 加 schema | 15min |
| 写单测 | 10min |
| 路由层 fallback | 5min |
| PM2 reload + curl 5 轮验证 | 5min |
| 写完成报告 | 5min |
| **合计** | **50min** |

---

**派工**: Kristy
**指令**: `cd /opt/wonderbear && droid exec --auto high "请按 coordination/workorders/2026-04-29-server-dialogue-llm-fix/README.md 完成 hotfix"`
