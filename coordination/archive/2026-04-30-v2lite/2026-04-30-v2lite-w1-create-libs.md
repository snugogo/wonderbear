# Workorder W1: Create v2-lite lib modules + install npm packages

**From**: Claude (review officer) — on behalf of Kristy
**To**: Factory droid
**Time**: 2026-04-30 01:20
**Branch**: release/showroom-20260429
**Repo**: /opt/wonderbear/server-v7
**Auto level**: high
**Timeout**: 1800s
**Workorder ID**: 2026-04-30-v2lite-w1-create-libs

---

## 任务范围(只读)

**纯新建文件 + npm install。绝对不修改任何现有源码。**

如果你发现需要修改现有文件才能跑通,**立即停止并报告,不要修改**。

---

## RED LINES(违反 = 立即终止)

```
❌ DO NOT modify src/routes/* (任何路由文件)
❌ DO NOT modify src/services/* (任何 service 文件)
❌ DO NOT modify src/config/* (任何 config 文件)
❌ DO NOT modify .env (任何 env 文件)
❌ DO NOT modify package.json 的现有 dependencies/devDependencies 字段
   (npm install 会自动加 string-similarity / franc-min,这是允许的)
❌ DO NOT git commit
❌ DO NOT git push
❌ DO NOT pm2 restart
❌ DO NOT 跑任何已有的测试(npm test 等)
❌ DO NOT 安装除 string-similarity 和 franc-min 之外的任何 npm 包
```

---

## 必做事项

### Phase 1: npm install

```bash
cd /opt/wonderbear/server-v7
npm install string-similarity franc-min --save
```

报告:
- npm install 的最后 5 行输出
- `cat package.json | grep -E "string-similarity|franc-min"` 的输出

### Phase 2: 新建 6 个 lib 文件

文件路径:`/opt/wonderbear/server-v7/src/lib/`

**注意**:Track B 已经在 `src/lib/` 下有 `provider-chain.js` 和 `dialogue-quality.js` 等文件。
**不要**覆盖任何现有文件。如果发现命名冲突,立即停止报告。

#### 2.1 `src/lib/repetition_detector.js`

完整代码见**附录 A**(在本工单底部)。

#### 2.2 `src/lib/language_detector.js`

完整代码见**附录 B**。

#### 2.3 `src/lib/elements_manager.js`

完整代码见**附录 C**。

#### 2.4 `src/lib/image_prompt_sanitizer.js`

**重要**:09_backend_logic.md 里这个文件标注"详见 v2-full 文档,200 行完整版"。
**v2-full 文档我们没有**。所以这一版用 W1 简化骨架(后续 W2/W3 不依赖完整版)。

骨架代码见**附录 D**(导出 `sanitizeImagePrompt` 函数,内部仅做基础正则替换,不做完整 IP 映射)。

后续如果需要完整 200 行版本,作为 W2.5 单独工单。

#### 2.5 `src/lib/dialogue_orchestrator.js`

完整代码见**附录 E**。

**注意**:这个文件 `require('./repetition_detector')` 等其他 lib,以及 `require('./llm_response_validator')`。
所以新建顺序:E 必须在 A/B/C/F 都建完之后。

#### 2.6 `src/lib/llm_response_validator.js`

完整代码见**附录 F**。

### Phase 3: Smoke test(每个 lib 都跑)

```bash
cd /opt/wonderbear/server-v7
node -e "const m = require('./src/lib/repetition_detector'); console.log('repetition_detector OK', Object.keys(m));"
node -e "const m = require('./src/lib/language_detector'); console.log('language_detector OK', Object.keys(m));"
node -e "const m = require('./src/lib/elements_manager'); console.log('elements_manager OK', Object.keys(m));"
node -e "const m = require('./src/lib/image_prompt_sanitizer'); console.log('image_prompt_sanitizer OK', Object.keys(m));"
node -e "const m = require('./src/lib/dialogue_orchestrator'); console.log('dialogue_orchestrator OK', Object.keys(m));"
node -e "const m = require('./src/lib/llm_response_validator'); console.log('llm_response_validator OK', Object.keys(m));"
```

每行**必须**输出 `xxx OK [ ... ]`。任何 require 报错 → 立即停止,报告错误。

### Phase 4: 功能 spot-check(3 个最重要的)

```bash
cd /opt/wonderbear/server-v7

# 4.1 repetition_detector — text similar 检测
node -e "
const { detectRepetition } = require('./src/lib/repetition_detector');
const r = detectRepetition([
  { role: 'child', text: '兔子吃棉花糖' },
  { role: 'child', text: '兔子吃棉花糖' },
  { role: 'child', text: '兔子在吃棉花糖' }
], [], 0);
console.log('repetition test 1:', JSON.stringify(r));
if (!r.repeating || r.reason !== 'text_similar') { console.error('FAIL'); process.exit(1); }
console.log('PASS');
"

# 4.2 language_detector — 中英检测
node -e "
const { detectLanguage } = require('./src/lib/language_detector');
const a = detectLanguage('我喜欢小熊');
const b = detectLanguage('I love bear');
console.log('lang zh:', a, '| lang en:', b);
if (a !== 'zh' || b !== 'en') { console.error('FAIL'); process.exit(1); }
console.log('PASS');
"

# 4.3 llm_response_validator — JSON parse fallback
node -e "
const { validateLLMResponse } = require('./src/lib/llm_response_validator');
const a = validateLLMResponse('{\"reply\":\"hi\",\"elements\":[\"a\"],\"intent\":\"continue\"}');
const b = validateLLMResponse('not valid json');
console.log('valid:', JSON.stringify(a));
console.log('fallback:', JSON.stringify(b));
if (a.reply !== 'hi' || !b._fallback) { console.error('FAIL'); process.exit(1); }
console.log('PASS');
"
```

3 个 spot-check 都必须输出 `PASS`。任何 FAIL → 立即停止,报告。

### Phase 5: 报告(到 /opt/wonderbear/coordination/done/2026-04-30-v2lite-w1-report.md)

报告必须包含:
1. npm install 的最后 5 行输出
2. `package.json` 现在的 dependencies 段落
3. `ls -la src/lib/` 输出
4. Phase 3 的 6 个 smoke test 输出全文
5. Phase 4 的 3 个 spot-check 输出全文
6. `git status -s` 输出(必须只有 `?? src/lib/...` 6 行 + `M package.json` + `M package-lock.json`,不能有任何其他改动)
7. 自我审查清单:
   - [ ] 没改 routes/
   - [ ] 没改 services/
   - [ ] 没改 config/
   - [ ] 没改 .env
   - [ ] 没 git commit / push
   - [ ] 没 pm2 restart
   - [ ] 6 个 smoke test 都 OK
   - [ ] 3 个 spot-check 都 PASS

---

## 附录 A: repetition_detector.js

```javascript
// src/lib/repetition_detector.js
const stringSimilarity = require('string-similarity');

/**
 * 检测最近 3 轮孩子是否在重复
 *
 * 规则:
 * 1. 最近 3 轮 child input 文本相似度都 > 0.7 → 打转
 * 2. 最近 3 轮 child input 长度都 < 5 字 → 卡壳(也算打转)
 * 3. 最近 3 轮 elements 没新增 → 没贡献新内容(也算打转)
 */
function detectRepetition(history, currentElements, lastRecapElementsCount) {
  const childTurns = history
    .filter(h => h.role === 'child')
    .slice(-3)
    .map(h => h.text || '');

  if (childTurns.length < 3) return { repeating: false, reason: null };

  // 规则 1: 文本相似度
  const sim01 = stringSimilarity.compareTwoStrings(childTurns[0], childTurns[1]);
  const sim12 = stringSimilarity.compareTwoStrings(childTurns[1], childTurns[2]);
  if (sim01 > 0.7 && sim12 > 0.7) {
    return { repeating: true, reason: 'text_similar' };
  }

  // 规则 2: 持续短回答
  const allShort = childTurns.every(t => t.length < 5);
  if (allShort) {
    return { repeating: true, reason: 'too_short' };
  }

  // 规则 3: elements 无增长
  const elementsAddedRecently = (currentElements || []).length - (lastRecapElementsCount || 0);
  if (elementsAddedRecently === 0 && childTurns.length >= 3) {
    return { repeating: true, reason: 'no_new_elements' };
  }

  return { repeating: false, reason: null };
}

module.exports = { detectRepetition };
```

## 附录 B: language_detector.js

```javascript
// src/lib/language_detector.js
const { franc } = require('franc-min');

/**
 * 识别文本主导语言
 * 返回: 'zh' | 'en' | 'pl' | 'ro' | 'es' | 'mixed' | 'other' | 'unknown'
 */
function detectLanguage(text) {
  if (!text || text.length < 2) return 'unknown';

  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const englishChars = (text.match(/[a-zA-Z]/g) || []).length;
  const totalChars = chineseChars + englishChars;

  if (totalChars === 0) return 'unknown';

  const chineseRatio = chineseChars / totalChars;

  if (chineseRatio > 0.7) return 'zh';
  if (chineseRatio < 0.2) {
    let code;
    try { code = franc(text); } catch (e) { code = 'und'; }
    if (code === 'eng') return 'en';
    if (code === 'pol') return 'pl';
    if (code === 'ron') return 'ro';
    if (code === 'spa') return 'es';
    return 'other';
  }

  return 'mixed';
}

module.exports = { detectLanguage };
```

## 附录 C: elements_manager.js

```javascript
// src/lib/elements_manager.js

/**
 * 合并 LLM 返回的 elements 到 session
 * v2-lite: LLM 直接返回完整最新数组,这里只做去重和清洗
 */
function mergeElements(currentElements, llmReturnedElements) {
  if (!Array.isArray(llmReturnedElements)) {
    return Array.isArray(currentElements) ? currentElements : [];
  }

  const cleaned = llmReturnedElements
    .map(e => typeof e === 'string' ? e.trim() : '')
    .filter(e => e.length > 0)
    .filter((e, i, arr) => arr.indexOf(e) === i);

  return cleaned;
}

/**
 * 提取 child_real_world_hooks (v2-lite 不让 LLM 干这个)
 * 用关键词正则识别孩子提到的真实生活信息
 */
function extractRealWorldHooks(childText) {
  if (!childText || typeof childText !== 'string') return [];
  const hooks = [];

  const patterns = [
    { regex: /我家(有|养)(一只|一条|一个|个)?([\u4e00-\u9fa5]{1,5})/g,
      template: t => `孩子家有${t[3]}` },
    { regex: /(妈妈|爸爸|奶奶|爷爷|外婆|外公|哥哥|姐姐|弟弟|妹妹)/g,
      template: t => `孩子提到${t[1]}` },
    { regex: /今天(.*?)(很|好|了|啊)/g,
      template: t => `孩子今天${t[1]}` },
    { regex: /昨天(.*?)(很|好|了|啊)/g,
      template: t => `孩子昨天${t[1]}` },
    { regex: /(幼儿园|学校|老师|同学)([\u4e00-\u9fa5]{1,10})/g,
      template: t => `孩子在${t[1]}${t[2]}` },
    { regex: /我(很|最)?喜欢([\u4e00-\u9fa5]{1,8})/g,
      template: t => `孩子喜欢${t[2]}` }
  ];

  for (const { regex, template } of patterns) {
    let match;
    while ((match = regex.exec(childText)) !== null) {
      try { hooks.push(template(match)); } catch (e) { /* skip */ }
    }
  }

  return [...new Set(hooks)];
}

module.exports = { mergeElements, extractRealWorldHooks };
```

## 附录 D: image_prompt_sanitizer.js (W1 骨架版)

```javascript
// src/lib/image_prompt_sanitizer.js
// W1 骨架版 — 后续 W2.5 工单替换为完整 200 行 IP 映射

/**
 * 简化 IP 改写 — 只覆盖最高频的 5 个,完整版在 W2.5
 */
const IP_MAP = [
  { from: /\belsa\b/gi, to: 'snowy princess' },
  { from: /\bfrozen\b/gi, to: 'icy world' },
  { from: /\bmickey\b/gi, to: 'cheerful mouse' },
  { from: /\bpikachu\b/gi, to: 'yellow electric creature' },
  { from: /灰姑娘/g, to: '玻璃鞋公主' }
];

/**
 * 硬阻断词 — 命中直接拒绝
 */
const HARD_BLOCK = [/\bnsfw\b/i, /\bnude\b/i, /\bgore\b/i];

function sanitizeImagePrompt(prompt) {
  if (!prompt || typeof prompt !== 'string') {
    return { sanitized_prompt: '', changes: [], hard_block_caught: false };
  }

  // 1. 硬阻断检查
  for (const blockRe of HARD_BLOCK) {
    if (blockRe.test(prompt)) {
      return {
        sanitized_prompt: '',
        changes: [],
        hard_block_caught: true
      };
    }
  }

  // 2. IP 改写
  let sanitized = prompt;
  const changes = [];
  for (const { from, to } of IP_MAP) {
    if (from.test(sanitized)) {
      const matches = sanitized.match(from) || [];
      for (const m of matches) {
        changes.push({ round: 'ip', from: m.toLowerCase(), to });
      }
      sanitized = sanitized.replace(from, to);
    }
  }

  return {
    sanitized_prompt: sanitized,
    changes,
    hard_block_caught: false
  };
}

module.exports = { sanitizeImagePrompt };
```

## 附录 E: dialogue_orchestrator.js

```javascript
// src/lib/dialogue_orchestrator.js
const { detectRepetition } = require('./repetition_detector');
const { detectLanguage } = require('./language_detector');
const { mergeElements, extractRealWorldHooks } = require('./elements_manager');
const { validateLLMResponse } = require('./llm_response_validator');

const MAX_DIALOGUE_TURNS = 30;
const SOFT_CLOSE_TURN = 15;
const RECAP_MIN_ELEMENTS = 5;
const RECAP_MIN_TURNS_BETWEEN = 6;

/**
 * 处理一次 dialogue,返回最终给前端的响应
 *
 * @param {Object} params
 * @param {Object} params.session    必须含: history, elements, turnCount, recapCount, lastRecapTurn, lastRecapElementsCount, realWorldHooks
 * @param {string} params.childInput
 * @param {Function} params.llmCallFn  async ({ history, elements, childInput }) => raw LLM string
 */
async function orchestrateDialogue({ session, childInput, llmCallFn }) {
  // 1. 调用 LLM
  const llmRaw = await llmCallFn({
    history: (session.history || []).slice(-10),
    elements: session.elements || [],
    childInput
  });

  // 2. 校验 LLM 输出
  const llmResponse = validateLLMResponse(llmRaw);

  // 3. 后端做确定性判断
  const language = detectLanguage(childInput);
  const repetition = detectRepetition(
    [...(session.history || []), { role: 'child', text: childInput }],
    llmResponse.elements,
    session.lastRecapElementsCount || 0
  );

  // 4. 提取真实生活 hook
  const newHooks = extractRealWorldHooks(childInput);

  // 5. 合并 elements
  const mergedElements = mergeElements(session.elements || [], llmResponse.elements);

  // 6. 决定最终 intent
  let finalIntent = llmResponse.intent;
  const turnCount = (session.turnCount || 0) + 1;

  if (turnCount >= MAX_DIALOGUE_TURNS) {
    finalIntent = 'recap';
  } else if (repetition.repeating && mergedElements.length >= 3) {
    finalIntent = 'recap';
  } else if (turnCount >= SOFT_CLOSE_TURN && (session.recapCount || 0) === 0
             && mergedElements.length >= RECAP_MIN_ELEMENTS) {
    finalIntent = 'recap';
  } else if (finalIntent === 'recap' && mergedElements.length < RECAP_MIN_ELEMENTS) {
    finalIntent = 'continue';
  } else if (finalIntent === 'recap' &&
             turnCount - (session.lastRecapTurn || 0) < RECAP_MIN_TURNS_BETWEEN) {
    finalIntent = 'continue';
  }

  // 7. 更新 session
  session.history = [
    ...(session.history || []),
    { role: 'child', text: childInput },
    { role: 'bear', text: llmResponse.reply }
  ];
  session.elements = mergedElements;
  session.realWorldHooks = [...new Set([...(session.realWorldHooks || []), ...newHooks])];
  session.turnCount = turnCount;
  session.language = language;

  // 8. 返回前端
  return {
    reply: llmResponse.reply,
    elements: mergedElements,
    intent: finalIntent,
    metadata: {
      turn_count: turnCount,
      language,
      is_repeating: repetition.repeating,
      hook_extracted: newHooks.length > 0
    }
  };
}

module.exports = { orchestrateDialogue, MAX_DIALOGUE_TURNS, SOFT_CLOSE_TURN, RECAP_MIN_ELEMENTS, RECAP_MIN_TURNS_BETWEEN };
```

## 附录 F: llm_response_validator.js

```javascript
// src/lib/llm_response_validator.js

const VALID_INTENTS = ['continue', 'recap', 'safety'];

/**
 * 校验 LLM 输出,缺字段时 fallback
 */
function validateLLMResponse(rawResponse) {
  let parsed;
  try {
    if (typeof rawResponse === 'string') {
      const cleaned = rawResponse.replace(/^```json\s*|\s*```$/g, '').trim();
      parsed = JSON.parse(cleaned);
    } else if (rawResponse && typeof rawResponse === 'object') {
      parsed = rawResponse;
    } else {
      throw new Error('rawResponse is neither string nor object');
    }
  } catch (e) {
    return {
      reply: '诶?小熊有点没听清,你再说一次好吗?',
      elements: [],
      intent: 'continue',
      _fallback: 'json_parse_error'
    };
  }

  return {
    reply: typeof parsed.reply === 'string' && parsed.reply.length > 0
      ? parsed.reply
      : '诶~ 然后呢?',

    elements: Array.isArray(parsed.elements)
      ? parsed.elements.filter(e => typeof e === 'string')
      : [],

    intent: VALID_INTENTS.includes(parsed.intent)
      ? parsed.intent
      : 'continue'
  };
}

module.exports = { validateLLMResponse };
```

---

**End of W1.**
