# Workorder W1': Create v2-lite lib modules (ESM) + install npm packages

**From**: Claude (review officer) — on behalf of Kristy
**To**: Factory droid
**Time**: 2026-04-30 02:00
**Branch**: release/showroom-20260429
**Repo**: /opt/wonderbear/server-v7
**Auto level**: high
**Timeout**: 1800s
**Workorder ID**: 2026-04-30-v2lite-w1-prime-create-libs
**Supersedes**: 2026-04-30-v2lite-w1-create-libs (stopped at pre-flight due to ESM/CJS conflict — that decision was correct)

---

## 背景

W1 上一版用 CommonJS,Factory pre-flight 探针发现:
- server-v7 现有 `src/lib/provider-chain.js` 用 ESM
- `franc-min@6` ESM-only,无法 `require()`
- 强行 CJS 必撞 `ERR_REQUIRE_ESM`

W1' 解法:**全部 lib 用 ESM**,与 provider-chain.js 风格一致。

---

## 任务范围

**纯新建文件 + npm install。绝对不修改任何现有源码。**

如果发现需要修改现有文件才能跑通,**立即停止并报告**。

---

## RED LINES

```
❌ DO NOT modify src/routes/* (任何路由文件)
❌ DO NOT modify src/services/* (任何 service 文件)
❌ DO NOT modify src/config/* (任何 config 文件)
❌ DO NOT modify .env (任何 env 文件)
❌ DO NOT modify package.json 的 "type" 字段 / scripts / 现有 dependencies
   (npm install 会自动加 string-similarity / franc-min 到 dependencies,允许)
❌ DO NOT modify src/lib/provider-chain.js
❌ DO NOT git commit
❌ DO NOT git push
❌ DO NOT pm2 restart
❌ DO NOT 跑任何已有的测试(npm test 等)
❌ DO NOT 安装除 string-similarity 和 franc-min 之外的任何 npm 包
```

---

## 必做事项

### Phase 0: 环境侦察(再次确认 ESM 假设)

```bash
cd /opt/wonderbear/server-v7
echo "=== package.json type field ==="
grep -E '"type"' package.json || echo "(no type field — defaults to commonjs)"
echo "=== provider-chain.js syntax check ==="
head -5 src/lib/provider-chain.js
echo "=== Node version ==="
node --version
```

报告这三段输出。

如果 `package.json` **没有** `"type": "module"` 但 provider-chain.js 仍是 ESM,
说明它用 `.mjs` 或 import 机制不同于工单假设。
**这种情况下立即停止报告**,等决策。

如果 `package.json` **有** `"type": "module"`,继续 Phase 1。

### Phase 1: npm install

```bash
cd /opt/wonderbear/server-v7
npm install string-similarity franc-min --save
```

报告:
- npm install 的最后 5 行输出
- `cat package.json | grep -E "string-similarity|franc-min"` 的输出
- 验证 import 可用:
```bash
node --input-type=module -e "import('string-similarity').then(m => console.log('ss OK')).catch(e => { console.error(e.message); process.exit(1); })"
node --input-type=module -e "import('franc-min').then(m => console.log('franc OK', Object.keys(m))).catch(e => { console.error(e.message); process.exit(1); })"
```

任何 import 失败 → 停止,报告。

### Phase 2: 新建 6 个 lib 文件(全 ESM,`.js` 后缀)

文件路径:`/opt/wonderbear/server-v7/src/lib/`

**不要覆盖任何现有文件**。如果发现命名冲突,立即停止报告。

#### 2.1 `src/lib/repetition_detector.js` — 见**附录 A**
#### 2.2 `src/lib/language_detector.js` — 见**附录 B**
#### 2.3 `src/lib/elements_manager.js` — 见**附录 C**
#### 2.4 `src/lib/image_prompt_sanitizer.js` — 见**附录 D**
#### 2.5 `src/lib/llm_response_validator.js` — 见**附录 F**
#### 2.6 `src/lib/dialogue_orchestrator.js` — 见**附录 E**(import 其他 lib,**最后**新建)

新建顺序:A → B → C → D → F → E

### Phase 3: Smoke test(每个 lib 都跑)

```bash
cd /opt/wonderbear/server-v7
node --input-type=module -e "import('./src/lib/repetition_detector.js').then(m => console.log('repetition_detector OK', Object.keys(m))).catch(e => { console.error(e.message); process.exit(1); })"
node --input-type=module -e "import('./src/lib/language_detector.js').then(m => console.log('language_detector OK', Object.keys(m))).catch(e => { console.error(e.message); process.exit(1); })"
node --input-type=module -e "import('./src/lib/elements_manager.js').then(m => console.log('elements_manager OK', Object.keys(m))).catch(e => { console.error(e.message); process.exit(1); })"
node --input-type=module -e "import('./src/lib/image_prompt_sanitizer.js').then(m => console.log('image_prompt_sanitizer OK', Object.keys(m))).catch(e => { console.error(e.message); process.exit(1); })"
node --input-type=module -e "import('./src/lib/llm_response_validator.js').then(m => console.log('llm_response_validator OK', Object.keys(m))).catch(e => { console.error(e.message); process.exit(1); })"
node --input-type=module -e "import('./src/lib/dialogue_orchestrator.js').then(m => console.log('dialogue_orchestrator OK', Object.keys(m))).catch(e => { console.error(e.message); process.exit(1); })"
```

每行**必须**输出 `xxx OK [...]`。任何 import 报错 → 立即停止,报告。

### Phase 4: 功能 spot-check(3 个最重要)

```bash
cd /opt/wonderbear/server-v7

# 4.1 repetition_detector
node --input-type=module -e "
import('./src/lib/repetition_detector.js').then(({ detectRepetition }) => {
  const r = detectRepetition([
    { role: 'child', text: '兔子吃棉花糖' },
    { role: 'child', text: '兔子吃棉花糖' },
    { role: 'child', text: '兔子在吃棉花糖' }
  ], [], 0);
  console.log('repetition test:', JSON.stringify(r));
  if (!r.repeating || r.reason !== 'text_similar') { console.error('FAIL'); process.exit(1); }
  console.log('PASS');
});
"

# 4.2 language_detector
node --input-type=module -e "
import('./src/lib/language_detector.js').then(({ detectLanguage }) => {
  const a = detectLanguage('我喜欢小熊');
  const b = detectLanguage('I love bear');
  console.log('lang zh:', a, '| lang en:', b);
  if (a !== 'zh' || b !== 'en') { console.error('FAIL'); process.exit(1); }
  console.log('PASS');
});
"

# 4.3 llm_response_validator
node --input-type=module -e "
import('./src/lib/llm_response_validator.js').then(({ validateLLMResponse }) => {
  const a = validateLLMResponse('{\"reply\":\"hi\",\"elements\":[\"a\"],\"intent\":\"continue\"}');
  const b = validateLLMResponse('not valid json');
  console.log('valid:', JSON.stringify(a));
  console.log('fallback:', JSON.stringify(b));
  if (a.reply !== 'hi' || !b._fallback) { console.error('FAIL'); process.exit(1); }
  console.log('PASS');
});
"
```

3 个 spot-check 都必须输出 `PASS`。任何 FAIL → 立即停止,报告。

### Phase 5: 报告(到 /opt/wonderbear/coordination/done/2026-04-30-v2lite-w1-prime-report.md)

报告必须包含:
1. Phase 0 环境侦察的 3 段输出
2. npm install 的最后 5 行输出 + import 验证输出
3. `cat package.json | grep -A30 '"dependencies"'` 输出
4. `ls -la src/lib/` 输出(必须看到 7 个 .js 文件)
5. Phase 3 的 6 个 smoke test 输出全文
6. Phase 4 的 3 个 spot-check 输出全文
7. `git status -s` 输出 — 必须只有:
   - `?? src/lib/repetition_detector.js`
   - `?? src/lib/language_detector.js`
   - `?? src/lib/elements_manager.js`
   - `?? src/lib/image_prompt_sanitizer.js`
   - `?? src/lib/dialogue_orchestrator.js`
   - `?? src/lib/llm_response_validator.js`
   - ` M package.json`
   - ` M package-lock.json`
   - 加上 coordination/ 目录里的工单/报告文件(预先存在,可忽略)
   - 加上 tv-html/src/screens/DialogueScreen.vue (M, 早上 ASR 调试按钮的未提交改动,不属于本工单,允许保留)
   - **不能有任何其他改动**
8. 自我审查清单:
   - [ ] 没改 routes/
   - [ ] 没改 services/
   - [ ] 没改 config/
   - [ ] 没改 .env
   - [ ] 没改 src/lib/provider-chain.js
   - [ ] 没改 package.json 的 type / scripts / 现有 dependencies
   - [ ] 没 git commit / push
   - [ ] 没 pm2 restart
   - [ ] 6 个 smoke test 都 OK
   - [ ] 3 个 spot-check 都 PASS

### Phase 6: 停止等待(关键)

**完成 Phase 5 后立即停止,不要做任何其他动作。**

特别地,**不要**:
- 改 routes/dialogue.js 接入新 lib
- 设 PROMPT_VERSION env
- 任何"顺手"改动

W1' 的成果是 6 个 dormant lib 文件 — 它们存在但**不被任何代码 import**,完全不影响 prod。
W2 是后续工单,会单独派,届时 Kristy 已审过 W1' 报告。

---

## 附录 A: src/lib/repetition_detector.js (ESM)

```javascript
// src/lib/repetition_detector.js
import stringSimilarity from 'string-similarity';

/**
 * 检测最近 3 轮孩子是否在重复
 */
export function detectRepetition(history, currentElements, lastRecapElementsCount) {
  const childTurns = history
    .filter(h => h.role === 'child')
    .slice(-3)
    .map(h => h.text || '');

  if (childTurns.length < 3) return { repeating: false, reason: null };

  const sim01 = stringSimilarity.compareTwoStrings(childTurns[0], childTurns[1]);
  const sim12 = stringSimilarity.compareTwoStrings(childTurns[1], childTurns[2]);
  if (sim01 > 0.7 && sim12 > 0.7) {
    return { repeating: true, reason: 'text_similar' };
  }

  const allShort = childTurns.every(t => t.length < 5);
  if (allShort) {
    return { repeating: true, reason: 'too_short' };
  }

  const elementsAddedRecently = (currentElements || []).length - (lastRecapElementsCount || 0);
  if (elementsAddedRecently === 0 && childTurns.length >= 3) {
    return { repeating: true, reason: 'no_new_elements' };
  }

  return { repeating: false, reason: null };
}
```

## 附录 B: src/lib/language_detector.js (ESM)

```javascript
// src/lib/language_detector.js
import { franc } from 'franc-min';

export function detectLanguage(text) {
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
```

## 附录 C: src/lib/elements_manager.js (ESM)

```javascript
// src/lib/elements_manager.js

export function mergeElements(currentElements, llmReturnedElements) {
  if (!Array.isArray(llmReturnedElements)) {
    return Array.isArray(currentElements) ? currentElements : [];
  }

  const cleaned = llmReturnedElements
    .map(e => typeof e === 'string' ? e.trim() : '')
    .filter(e => e.length > 0)
    .filter((e, i, arr) => arr.indexOf(e) === i);

  return cleaned;
}

export function extractRealWorldHooks(childText) {
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
```

## 附录 D: src/lib/image_prompt_sanitizer.js (ESM, 骨架版)

```javascript
// src/lib/image_prompt_sanitizer.js
// W1' 骨架版 — W2.5 工单替换为完整 200 行 IP 映射

const IP_MAP = [
  { from: /\belsa\b/gi, to: 'snowy princess' },
  { from: /\bfrozen\b/gi, to: 'icy world' },
  { from: /\bmickey\b/gi, to: 'cheerful mouse' },
  { from: /\bpikachu\b/gi, to: 'yellow electric creature' },
  { from: /灰姑娘/g, to: '玻璃鞋公主' }
];

const HARD_BLOCK = [/\bnsfw\b/i, /\bnude\b/i, /\bgore\b/i];

export function sanitizeImagePrompt(prompt) {
  if (!prompt || typeof prompt !== 'string') {
    return { sanitized_prompt: '', changes: [], hard_block_caught: false };
  }

  for (const blockRe of HARD_BLOCK) {
    if (blockRe.test(prompt)) {
      return {
        sanitized_prompt: '',
        changes: [],
        hard_block_caught: true
      };
    }
  }

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
```

## 附录 E: src/lib/dialogue_orchestrator.js (ESM)

```javascript
// src/lib/dialogue_orchestrator.js
import { detectRepetition } from './repetition_detector.js';
import { detectLanguage } from './language_detector.js';
import { mergeElements, extractRealWorldHooks } from './elements_manager.js';
import { validateLLMResponse } from './llm_response_validator.js';

export const MAX_DIALOGUE_TURNS = 30;
export const SOFT_CLOSE_TURN = 15;
export const RECAP_MIN_ELEMENTS = 5;
export const RECAP_MIN_TURNS_BETWEEN = 6;

export async function orchestrateDialogue({ session, childInput, llmCallFn }) {
  const llmRaw = await llmCallFn({
    history: (session.history || []).slice(-10),
    elements: session.elements || [],
    childInput
  });

  const llmResponse = validateLLMResponse(llmRaw);

  const language = detectLanguage(childInput);
  const repetition = detectRepetition(
    [...(session.history || []), { role: 'child', text: childInput }],
    llmResponse.elements,
    session.lastRecapElementsCount || 0
  );

  const newHooks = extractRealWorldHooks(childInput);
  const mergedElements = mergeElements(session.elements || [], llmResponse.elements);

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

  session.history = [
    ...(session.history || []),
    { role: 'child', text: childInput },
    { role: 'bear', text: llmResponse.reply }
  ];
  session.elements = mergedElements;
  session.realWorldHooks = [...new Set([...(session.realWorldHooks || []), ...newHooks])];
  session.turnCount = turnCount;
  session.language = language;

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
```

## 附录 F: src/lib/llm_response_validator.js (ESM)

```javascript
// src/lib/llm_response_validator.js

const VALID_INTENTS = ['continue', 'recap', 'safety'];

export function validateLLMResponse(rawResponse) {
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
```

---

**End of W1'.**
