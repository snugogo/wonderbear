# WO-3.7: Gemini 故事生成页数不一致修复（重试 + prompt 加固）

> **创建时间**: 2026-04-30
> **派给**: Factory(claude-opus-4-7, --auto high)
> **预计执行**: 30-45 分钟
> **类型**: Standard 三件套
> **Parent commit**: WO-3.6 commit `f420313`
> **改动范围**: server-v7 故事生成 service + prompts/v2-lite/story.system.txt
> **改动量预估**: ~50 行（重试 wrapper + 反馈 prompt + log + JSON schema 加固）

---

## §1. 背景

### 用户报告（2026-04-30 18:23 北京时间）

Kristy 浏览器实测点 "Try again" 按住麦克风走完对话流程，跳到 GeneratingScreen，等待几秒后看到 ErrorScreen「Bear ran into a small problem / Story generation hiccuped, let's try again」。

### 数据库证据（SQL 查证）

```
id: cmolc5674000rx9h5ihqegga2
status: failed
stage: done
pagesGenerated: 0
failureCode: 30001
failureMessage: "Gemini story returned 11 pages, expected 12"
genCostCents: 0
createdAt: 2026-04-30 10:22:52
```

**根因**：Gemini 2.5 Flash 在故事大纲生成阶段返回 11 页（而非约定的 12 页）。后端在 JSON 解析后做 `pages.length === 12` 校验，不通过则抛 `failureCode=30001` reject 整个故事，**不重试、不补救**。

### 失败率证据

最近 3 个故事样本：
- `cmolc5674`：failed (Gemini 11 页)
- `cmol6wacq`：completed 12 页 5min56s ✅
- `cmokybywt`：completed 12 页 4min03s ✅

3 个里 1 个失败 → **观察失败率 33%**（样本极小，但**任何 > 5% 的失败率都是产品级问题**）。

### 业务影响

- 用户首次使用 33% 概率失败 → 第一印象崩塌
- 海外推广 / 线下销售演示场景 = 转化率杀手
- 即使有 "Try again" 按钮，用户已经等了 5 分钟看到失败，**心理预期破坏**

### 修复方向（Kristy 决策 A+C）

- **方向 A**：重试为主（不截断不补齐，保故事质量）
- **方向 C**：双管齐下 —— server retry + prompt schema 强化（明天用 metric log 区分各自贡献）

**重试次数**：1 次（总 2 次调用）。理由：第 2 次给反馈后大概率成功；第 3 次成本边际收益低，且会让用户体感"故事生成更慢"。

---

## §2. 改动列表

### §2.1 勘察阶段（Factory 必跑，**先做这步**）

```bash
# 找 Gemini 故事生成代码
grep -rnE "Gemini|gemini.*generate|storyJob|story\.system|pages\.length.*12|expected 12" /opt/wonderbear/server-v7/src 2>/dev/null | grep -v node_modules | head -30

# 找抛 failureCode 30001 的代码位置
grep -rnE "30001|failureCode.*=" /opt/wonderbear/server-v7/src 2>/dev/null | grep -v node_modules | head -20

# 找 v2-lite story prompt 文件
find /opt/wonderbear/server-v7 -type f -name "*.txt" -path "*v2-lite*" 2>/dev/null
find /opt/wonderbear/server-v7 -type d -name "prompts*" 2>/dev/null
ls /opt/wonderbear/server-v7/src/prompts/v2-lite/ 2>/dev/null

# 看现有 thinkingBudget 设置
grep -rnE "thinkingBudget" /opt/wonderbear/server-v7/src 2>/dev/null | grep -v node_modules | head -10
```

**输出 Factory 必须先在报告里贴出来**，再开始改代码。报告 §1 必须明确：
- Gemini 故事生成的入口函数文件名 + 行号
- 现有 12 页校验代码位置
- v2-lite story.system.txt 路径 + 现有内容长度（行数）

### §2.2 改动 1：server-v7 加重试 wrapper

**目标文件**：勘察后 Factory 确定（可能是 `services/story.js` / `queues/storyJob.js` / `routes/story.js` 之一）。

**伪代码**（Factory 按实际语言/结构适配）：

```javascript
const log = require('../utils/logger');  // 或现有 logger

async function generateStoryWithRetry(dialogueContext, opts = {}) {
  const MAX_ATTEMPTS = 2;  // 第一次正常调用 + 1 次重试
  let lastError = null;
  let lastResult = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const isRetry = attempt > 1;
    const prompt = isRetry
      ? buildStoryPromptWithFeedback(dialogueContext, lastResult)
      : buildStoryPrompt(dialogueContext);

    log.info(`[storyGen] attempt=${attempt}/${MAX_ATTEMPTS} ${isRetry ? '(retry with feedback)' : ''}`);

    try {
      const result = await callGemini(prompt, { thinkingBudget: 1024 });
      const pages = parseStoryJson(result);

      if (pages.length === 12) {
        if (isRetry) {
          log.info(`[storyGen.metric] retrySucceeded=true firstPageCount=${lastResult?.pages?.length} retryAttempt=${attempt}`);
        } else {
          log.info(`[storyGen.metric] firstAttemptSucceeded=true`);
        }
        return { pages, attempts: attempt };
      }

      // 页数不对，记录用于下一次反馈
      lastResult = { pages, rawText: result };
      lastError = new Error(`returned ${pages.length} pages, expected 12`);
      log.warn(`[storyGen] attempt=${attempt} got ${pages.length} pages, will retry`);
    } catch (e) {
      lastError = e;
      log.warn(`[storyGen] attempt=${attempt} threw: ${e.message}`);
    }
  }

  // 重试也失败 → 抛错走原 failureCode=30001 路径
  log.error(`[storyGen.metric] retryFailed=true totalAttempts=${MAX_ATTEMPTS}`);
  throw lastError;
}

function buildStoryPromptWithFeedback(dialogueContext, lastResult) {
  const basePrompt = buildStoryPrompt(dialogueContext);
  const feedback = [
    '',
    '⚠️ 重要：上一次你返回了 ' + (lastResult?.pages?.length ?? 'unknown') + ' 页，但本故事 **必须严格** 返回 12 页。',
    '请仔细按 1-12 页顺序生成，每页是一个独立完整场景。不要少、不要多。',
    'JSON 数组长度 = 12 是硬性约束。',
  ].join('\n');
  return basePrompt + '\n\n' + feedback;
}
```

⚠️ **关键约束**：

1. ✅ **重试只针对"页数不对"**，不重试网络/超时错（那是另一类故障，应单独处理）
2. ✅ **保留原 failureCode=30001 抛错路径**——重试 1 次仍失败时走原流程
3. ✅ **用现有 logger，不写 console.log**
4. ✅ **不改 thinkingBudget**（继续用 1024，与 memory 一致）
5. ✅ **metric log 关键字必须含 `[storyGen.metric]`**，方便明天 grep 看效果
6. ❌ **不改 12 页约束本身**（不改成 11 接受、不截断、不补齐）—— 那是产品妥协，不是工程修复

### §2.3 改动 2：prompts/v2-lite/story.system.txt 加 JSON schema 加固

**勘察输出**：v2-lite story prompt 文件实际路径与内容长度。

**改动方向**：在 prompt 末尾追加（Factory 按实际 prompt 结构融入）：

```
## CRITICAL OUTPUT REQUIREMENT

Return STRICTLY a valid JSON object matching this schema:

{
  "title": "string (story title)",
  "pages": [  // EXACTLY 12 elements, no more, no less
    { "page": 1, "text": "...", "imagePrompt": "..." },
    { "page": 2, "text": "...", "imagePrompt": "..." },
    ... // through page 12
    { "page": 12, "text": "...", "imagePrompt": "..." }
  ]
}

VALIDATION RULES (MUST be followed exactly):
1. `pages` array length MUST equal 12. Not 11. Not 13. Exactly 12.
2. Each page object MUST have `page` field with values 1, 2, 3, ..., 12 in order.
3. If you find yourself wanting to combine two short scenes into one page,
   instead expand them into two separate pages with distinct visuals.
4. If you find yourself wanting to skip a transition,
   instead create a transition page with appropriate visual continuity.

Before returning, COUNT the pages in your output. If count != 12, regenerate.
```

⚠️ **关键**：
- ✅ **不改 prompt 现有故事生成逻辑**（保留角色塑造、情节模式等）
- ✅ **schema 部分追加在末尾**，不破坏现有结构
- ✅ **CRITICAL OUTPUT REQUIREMENT 段必须放在 prompt 最后**（LLM 对 prompt 末尾权重更高）

### §2.4 测试用例（Factory 自测）

**测试 1：dry-run prompt 改动**

```bash
cd /opt/wonderbear/server-v7
node -c <修改的文件>
# 看现有 prompt 是否正确加载（如果有 import）
```

**测试 2：跑一次 Gemini 真实调用验证**

⚠️ **一次真实 Gemini 调用 ~$0.005**，不会爆账单。

```bash
# 用 Factory 已有的或临时写的小测试 script
node -e "
const { generateStoryWithRetry } = require('./src/services/<勘察的文件>');
const testContext = {
  childName: 'TestChild',
  age: 5,
  storyTopic: '勇敢小猫和神秘森林',
};
generateStoryWithRetry(testContext)
  .then(r => console.log('SUCCESS pages=' + r.pages.length + ' attempts=' + r.attempts))
  .catch(e => console.log('FAIL ' + e.message));
"
```

⚠️ Factory **报告必须贴这次测试输出**，证明：
- 一次性成功 → `attempts=1`
- 重试成功 → `attempts=2`
- 都失败 → 抛错走原路径（验证回退兼容）

**测试 3：grep 验证 metric log 字符串存在**

```bash
grep -E "\[storyGen.metric\]" /opt/wonderbear/server-v7/src/services/<勘察的文件>
```

预期至少 3 处出现：firstAttemptSucceeded / retrySucceeded / retryFailed。

---

## §3. 红线

- ❌ 不许 git push
- ❌ 不许 pm2 restart wonderbear-server（由 Kristy 手动做）
- ❌ 不许 mock 兜底 / 假数据测试
- ❌ 不许 `&&` 命令链（在改的代码里）
- ❌ 不许 ssh heredoc 嵌套引号
- ❌ 不许 "Always allow" 任何权限提示
- ❌ **不许改 12 页硬约束**（那是产品决策不是工程问题）
- ❌ **不许在重试中间偷加截断/补齐逻辑**（保故事质量）
- ❌ **不许改 thinkingBudget**（继续 1024）
- ❌ 不许写调试 console.log，用现有 logger
- ❌ **不许改对话 / ASR / TTS 链路**（本工单只动故事生成）

🆕 **v2-lite prompt 改动注意**：
- ✅ **必须备份原 prompt 文件**（`<file>.backup-2026-04-30-wo-3.7-pre`）
- ✅ **schema 段追加在末尾**，不动现有内容
- ❌ 不许重写整个 prompt

**改动总行数硬上限**: 80 行（含 prompt 追加 + JS retry 逻辑）。超 80 行立刻停下报告。

---

## §4. 备份纪律

```bash
ssh wonderbear-vps "
cd /opt/wonderbear/server-v7
# Factory 勘察后确定 .js 文件路径,复制 backup
cp <story-gen-file>.js <story-gen-file>.js.backup-2026-04-30-wo-3.7-pre
cp src/prompts/v2-lite/story.system.txt src/prompts/v2-lite/story.system.txt.backup-2026-04-30-wo-3.7-pre
"
```

`.gitignore` 已加 `**/*.backup-*` 排除规则（HANDOFF §1）。

---

## §5. Dry-run 校验

```bash
cd /opt/wonderbear/server-v7
node --check src/<勘察的故事生成文件>.js
echo "---"
node -e "require('./src/<勘察的故事生成文件>.js'); console.log('module load OK')"
```

预期：语法 + 加载都过。**v1 失败教训：必须跑 require() 测试，不能只 node -c。**

---

## §9. 验收

### §9.1 自动验证（verify.sh 跑）

详见 `WO-3.7-verify.sh`。post 模式 8 项检查：
1. backup 文件存在（.js + .txt 两个）
2. 关键代码出现（generateStoryWithRetry / MAX_ATTEMPTS / buildStoryPromptWithFeedback）
3. 12 页校验仍在（不许移除原约束）
4. 没有 console.log 调试污染
5. metric log 关键字存在（firstAttemptSucceeded / retrySucceeded / retryFailed）
6. server-v7 编译/加载通过（node -c + node -e require）
7. prompts/v2-lite/story.system.txt 包含新 schema 段（grep "EXACTLY 12 elements"）
8. Factory 报告含 Gemini 真实测试输出

### §9.2 人工 restart（Kristy 跑）

verify 全过后跑：
```bash
ssh wonderbear-vps "pm2 restart wonderbear-server && pm2 logs wonderbear-server --lines 30 --nostream"
```

预期：restart 成功 + 无 startup 报错。

### §9.3 真实故事生成测试（Kristy 验收，**烧 $0.92**）

⚠️ **本工单上线后必须跑一次真实测试**——不然不知道修复有没有真生效。

1. Chrome Ctrl+Shift+R 刷新 `tv.bvtuber.com`
2. 走完整对话流程到"确认生成"
3. 观察 GeneratingScreen 进度
4. 看 server 日志中是否出现 `[storyGen]` 关键字（看是不是 attempt=1 一次过 / 还是触发了 retry）
5. 等 5-6 分钟，看是否成功跳到 story-cover 阅读页

**两种成功路径都接受**：
- ✅ 一次过（最理想，说明 prompt schema 强化奏效）
- ✅ 重试 1 次过（说明 retry 逻辑救回来）

⚠️ **如果连重试也失败**——记录 storyId，查 server 日志看 raw Gemini 输出，分析为啥连续两次都不返回 12 页。这种情况报告 Claude 重新设计。

---

## §10. 回滚

### 10.1 改坏了 / Factory 跑歪

```bash
ssh wonderbear-vps "
cd /opt/wonderbear/server-v7
cp src/<story-gen-file>.js.backup-2026-04-30-wo-3.7-pre src/<story-gen-file>.js
cp src/prompts/v2-lite/story.system.txt.backup-2026-04-30-wo-3.7-pre src/prompts/v2-lite/story.system.txt
pm2 restart wonderbear-server
"
```

### 10.2 已 commit 但想撤销

```bash
ssh wonderbear-vps "cd /opt/wonderbear && git reset --hard f420313"
```

`f420313` = WO-3.6 commit hash，WO-3.7 的 parent。

⚠️ `--hard` 会丢 server 改动 + tv-html dist。tv-html dist 可以重 build。但**不要在 prod 中跑 reset --hard 除非确认没有别的工作分支**。

---

## 派单 SOP

### 1. 上传 + 配置

```bash
scp /c/Users/Administrator/Downloads/WO-3.7.md /c/Users/Administrator/Downloads/WO-3.7-verify.sh /c/Users/Administrator/Downloads/WO-3.7-collect.sh wonderbear-vps:/opt/wonderbear/workorders/

ssh wonderbear-vps "
sed -i 's/\r\$//' /opt/wonderbear/workorders/WO-3.7*.sh
chmod +x /opt/wonderbear/workorders/WO-3.7*.sh
mkdir -p /opt/wonderbear/coordination/workorders/WO-3.7
cp /opt/wonderbear/workorders/WO-3.7.md /opt/wonderbear/coordination/workorders/WO-3.7/README.md
ls -la /opt/wonderbear/workorders/WO-3.7*
"
```

### 2. 派 Factory

钉钉发：
```
派 WO-3.7
```

### 3. Factory 完工 → 钉钉自动 verify（如果 WO-DT-1.3 v2 已上线）

⚠️ **本工单是 WO-DT-1.3 v2 真实生效后的第一个工单**。预期钉钉自动收到：
- 🔍 WO-3.7 自动跑 verify.sh ...
- ✅ WO-3.7 verify 全过 / ❌ WO-3.7 verify 失败 (exit=N)

**如果 WO-DT-1.3 v2 还没上线**，跑：
```bash
ssh wonderbear-vps "bash /opt/wonderbear/workorders/WO-3.7-collect.sh && echo '=== VERIFY ===' && bash /opt/wonderbear/workorders/WO-3.7-verify.sh"
```

### 4. verify 通过 → Kristy restart server + 真实测试（§9.2 + §9.3）

---

## §11. commit message 模板

```
fix(server): WO-3.7 Gemini story page count retry + prompt schema strengthening

修复故事生成 ~33% 失败率（实测样本 1/3 失败,failureCode=30001
"Gemini story returned 11 pages, expected 12"）。

A+C 双管齐下:
1. server-v7 加重试 wrapper (1 次重试,总 2 次调用),第 2 次 prompt
   显式反馈"上次返回了 N 页,本次必须 12 页"
2. prompts/v2-lite/story.system.txt 末尾追加 JSON schema 强约束段
   (EXACTLY 12 elements / VALIDATION RULES)

加 [storyGen.metric] log 区分两修复贡献:
- firstAttemptSucceeded → schema 加固生效
- retrySucceeded → retry 逻辑救回来
- retryFailed → 真失败 (走原 30001 路径)

实现要点:
- 只重试"页数不对",不重试网络/超时
- 不改 12 页硬约束 (产品决策非工程妥协)
- 不改 thinkingBudget=1024
- 保留原 failureCode=30001 抛错路径作回退

测试: Gemini 真实调用 + verify 8 项全过。一次故事真实测试
(storyId / attempts / outcome) 见 commit follow-up.

Refs: coordination/workorders/WO-3.7/README.md
```

---

完。
