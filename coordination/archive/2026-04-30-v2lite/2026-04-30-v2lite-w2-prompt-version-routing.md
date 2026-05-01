# Workorder W2: Wire PROMPT_VERSION env switch into dialogue route

**From**: Claude (review officer) — on behalf of Kristy
**To**: Factory droid
**Time**: 2026-04-30 03:00
**Branch**: release/showroom-20260429
**Repo**: /opt/wonderbear/server-v7
**Auto level**: high
**Timeout**: 1800s
**Workorder ID**: 2026-04-30-v2lite-w2-prompt-version-routing
**Depends on**: W1' (6 dormant lib files in src/lib/) and W1.1 (language_detector fix)

---

## 目标

引入 `PROMPT_VERSION` env 开关,在 dialogue route 里加路由分支。
- `PROMPT_VERSION=v1` (默认) → 走 Track B 现有路径(`generateDialogueTurnV2`),**与现状 100% 等价**
- `PROMPT_VERSION=v2-lite` → 走新的 dialogue_orchestrator.js 路径
- `PROMPT_VERSION=v2-full` → 同 v2-lite(预留,W2 阶段不区分)

**W2 完成后的 prod 状态**:`.env` 里 PROMPT_VERSION 默认 `v1`,prod 跑的还是 Track B 老路径,**完全不变**。v2-lite 路径"通电但没启用"。

W3 才会切 PROMPT_VERSION=v2-lite + 写新 prompt 文件 + pm2 restart。

---

## RED LINES

```
❌ DO NOT modify the EXISTING v1 logic — it must remain byte-identical
   inside the new "if (PROMPT_VERSION === 'v1') { ... }" branch.
   The way to verify this: cherry-pick the exact lines that handle dialogue
   today, wrap them in the if-branch, and add an else-branch for v2-lite.
   No refactor, no rename, no extraction.

❌ DO NOT touch src/services/* (services unchanged)
❌ DO NOT touch src/lib/provider-chain.js
❌ DO NOT touch src/lib/dialogue-quality.js (Track B's existing helper)
❌ DO NOT touch the 6 W1' lib files (they are dormant, leave dormant)
❌ DO NOT git commit / push
❌ DO NOT pm2 restart
❌ DO NOT modify .env values directly — only ADD the PROMPT_VERSION read
   in src/config/* if needed; DEFAULT must be 'v1'
❌ DO NOT install new npm packages
❌ DO NOT add a new prompt file — that's W3
```

---

## 必做事项

### Phase 0: 侦察 — 找到 v1 dialogue 入口

```bash
cd /opt/wonderbear/server-v7
echo "=== dialogue routes ==="
grep -rn "generateDialogueTurnV2\|/dialogue/turn\|dialogueTurn" src/routes/ | head -20
echo "=== dialogue services ==="
grep -rn "generateDialogueTurnV2" src/services/ | head -10
echo "=== current env reading ==="
grep -rn "process.env" src/config/ | head -10
```

报告这三段输出。从中识别:
- v1 dialogue 的主入口函数名
- v1 dialogue 路由文件路径
- 现有 env 读取的文件路径(用来加 PROMPT_VERSION 读取)

### Phase 1: 加 PROMPT_VERSION 配置读取

修改 `src/config/env.js`(或现有的 env 集中文件):

加入新字段读取(语法跟随现有文件风格):
```javascript
// 在 export 的 config 对象里加:
PROMPT_VERSION: process.env.PROMPT_VERSION || 'v1',
```

如果现有 config 用 schema 校验(joi / zod),加对应校验:`enum: ['v1', 'v2-full', 'v2-lite']`,默认 `'v1'`。

**重要**:不要改 .env 文件本身。`.env` 没有这个字段时,`process.env.PROMPT_VERSION` 是 undefined,默认 fallback 到 `'v1'`,prod 行为不变。

### Phase 2: 在 dialogue route 加路由分支

侦察到 v1 dialogue 入口后(假设是 `src/routes/story.js` 里的某个 handler 或 `src/services/dialogue.js`),按下面模式改造:

**改造前(伪代码):**
```javascript
async function handleDialogueTurn(req, reply) {
  // ...原有 v1 逻辑...
  const result = await generateDialogueTurnV2(...);
  return result;
}
```

**改造后(伪代码):**
```javascript
import { config } from '../config/env.js';
import { orchestrateDialogue } from '../lib/dialogue_orchestrator.js';

async function handleDialogueTurn(req, reply) {
  if (config.PROMPT_VERSION === 'v1') {
    // === V1 BRANCH (Track B legacy, byte-identical) ===
    // ...原有 v1 逻辑,一字不改地搬进来...
    const result = await generateDialogueTurnV2(...);
    return result;
  } else {
    // === V2-LITE BRANCH ===
    // 1. 构建 session 对象(适配 dialogue_orchestrator 期望的 shape)
    // 2. 构建 llmCallFn 闭包(包装现有 LLM 调用)
    // 3. 调用 orchestrateDialogue
    // 4. 把返回结果适配成前端期望的 shape

    const session = {
      history: req.body.history || [],
      elements: req.body.elements || [],
      turnCount: req.body.turnCount || 0,
      recapCount: req.body.recapCount || 0,
      lastRecapTurn: req.body.lastRecapTurn || 0,
      lastRecapElementsCount: req.body.lastRecapElementsCount || 0,
      realWorldHooks: req.body.realWorldHooks || []
    };

    const llmCallFn = async ({ history, elements, childInput }) => {
      // TODO W3: 用 v2-lite 的 SYSTEM_PROMPT
      // W2 阶段用占位 prompt,W3 替换为真实 v2-lite prompt
      const placeholderSystemPrompt = `你是 WonderBear,5 岁小熊。\n输出 JSON: {"reply":"...","elements":[...],"intent":"continue|recap|safety"}`;
      const userMsg = `[history]\n${JSON.stringify(history)}\n[elements_so_far]\n${JSON.stringify(elements)}\n[child_says]\n${childInput}`;

      // 复用现有 LLM 调用机制(Gemini 2.5 Flash)
      // 关键:从现有 services 里找 callGemini / callLLM 的函数,直接复用
      // 不要新建 LLM 客户端
      return await /* existing LLM call */ ({
        system: placeholderSystemPrompt,
        user: userMsg,
        thinkingBudget: 0
      });
    };

    const orchestratedResult = await orchestrateDialogue({
      session,
      childInput: req.body.childInput || req.body.text,
      llmCallFn
    });

    // 适配返回 shape — 必须跟 v1 返回的 shape 兼容,否则前端会挂
    return {
      // 把 orchestratedResult 字段映射到前端期望的字段
      reply: orchestratedResult.reply,
      elements: orchestratedResult.elements,
      intent: orchestratedResult.intent,
      metadata: orchestratedResult.metadata,
      _promptVersion: 'v2-lite'  // 用于调试,前端可忽略
    };
  }
}
```

**关键约束**:
1. `if (config.PROMPT_VERSION === 'v1')` 分支里的代码必须**byte-identical**于改造前的现有逻辑 — 一字不改
2. v2-lite 分支里 `llmCallFn` 复用**现有的** LLM 客户端(Gemini 2.5 Flash 调用),不新建
3. v2-lite 分支返回的 JSON shape 必须和 v1 兼容 — 至少包含 v1 返回的核心字段(具体看现有 v1 返回 shape)
4. **如果 v1 入口的 shape / 调用约定无法在 90 分钟内安全适配**,立即停止报告,不要硬合

### Phase 3: 验证 v1 路径未受影响

```bash
cd /opt/wonderbear/server-v7
# 模拟 PROMPT_VERSION 不设(默认 v1)
node --input-type=module -e "
import('./src/config/env.js').then(({ config }) => {
  console.log('PROMPT_VERSION:', config.PROMPT_VERSION);
  if (config.PROMPT_VERSION !== 'v1') { console.error('FAIL: default should be v1'); process.exit(1); }
  console.log('PASS: default is v1');
});
"

# 模拟 PROMPT_VERSION=v2-lite
PROMPT_VERSION=v2-lite node --input-type=module -e "
import('./src/config/env.js').then(({ config }) => {
  console.log('PROMPT_VERSION:', config.PROMPT_VERSION);
  if (config.PROMPT_VERSION !== 'v2-lite') { console.error('FAIL'); process.exit(1); }
  console.log('PASS: v2-lite recognized');
});
"
```

### Phase 4: 现有测试套件确认未挂

```bash
cd /opt/wonderbear/server-v7
# 跑 Track B 已有的 dialogue 单元测试
ls tests/ test/ __tests__/ 2>/dev/null
# 找到测试目录后,只跑 dialogue 相关的
npm test -- --testPathPattern=dialogue 2>&1 | tail -40 || echo "(test setup may differ)"
```

**关键**:Track B 之前的 23/23 dialogue 测试 + 3/3 v7.1 测试 + 6/6 provider-chain 测试**全部必须仍然通过**。任何 regression → 立即停止报告。

如果测试命令不同,报告测试目录结构,等 Kristy 决定。

### Phase 5: 报告(到 /opt/wonderbear/coordination/done/2026-04-30-v2lite-w2-report.md)

报告必须包含:
1. Phase 0 三段侦察输出(v1 入口、env 读取位置)
2. 改了哪些文件 + 每个文件改了哪几行(用 `git diff path/to/file.js` 输出)
3. v1 分支代码 byte-identical 对比 — 给出 grep 证据,例如 `git diff --stat src/routes/story.js` 加新行数,旧行数应该 = 旧文件行数 -2 +N(其中 N 是 v2-lite 分支行数)
4. Phase 3 两个 PROMPT_VERSION 测试输出
5. Phase 4 已有测试套件结果(必须全 PASS)
6. `git status -s` 输出
7. 自我审查清单:
   - [ ] v1 分支代码与原代码 byte-identical
   - [ ] 没改 services/
   - [ ] 没改 provider-chain.js / dialogue-quality.js
   - [ ] 没改 W1' 6 lib(它们仍 dormant)
   - [ ] 没改 .env 文件
   - [ ] PROMPT_VERSION 默认 v1
   - [ ] 没 git commit / push
   - [ ] 没 pm2 restart
   - [ ] 没装新 npm 包
   - [ ] Track B 测试套件全 PASS

### Phase 6: 停止等待

完成 Phase 5 后停止,**不要 pm2 restart**,**不要切 PROMPT_VERSION**,**不要做 W3 工作**。

W3 工单会单独派 — 在 Kristy 审完 W2 报告后。

---

## 关键约束总结

| 约束 | 原因 |
|---|---|
| v1 分支代码 byte-identical | 这是 prod 现在跑的代码,展会前不能动 |
| PROMPT_VERSION 默认 v1 | 没 set env 时 prod 行为不变 |
| 不 pm2 restart | W2 完成后 prod 还是 v1 行为(代码改了但没生效) |
| llmCallFn 复用现有 LLM 客户端 | 不引入新依赖,降低风险 |
| 返回 shape 必须和 v1 兼容 | 前端不知道有 v1/v2-lite 之分 |

---

**End of W2.**
