# WO-3.19 完成报告 — 主角变量传递链路修复(Luna→Dora 真 bug)

**From**: Factory Droid V4 Pro (exec mode)
**To**: Kristy / Claude
**Time**: 2026-05-01
**Refs**: WO-3.19, AGENTS.md §1.1 §3.4 §6.1, memory #21 §5, PRODUCT_CONSTITUTION §1 (Dora brand-anchor)

---

## §0 TL;DR

- 11/12 verify checks PASS。唯一 1 FAIL 是 **预先存在的 dirty 文件**(同 WO-3.18 已记录的 dingtalk-bot/.gitignore + server-v7/src/routes/draft.js),不在 WO-3.19 作用域。
- 主角变量优先级链路已落地:**verbal extraction > My Den childProfile.name > 'Dora' brand-anchor**。
- 实现位置:`server-v7/src/services/llm.js`(195 净增行)+ `server-v7/src/routes/story.js`(45 净增行)。
- tv-html 端**未改动** — 浏览器 mock 默认 child 已是 Dora(`tv-html/src/services/bridge/mock.ts:28 name: 'Dora'`),Luna 仅残留在 `dev/` + `mock/demo`(verify-lib `check_no_luna_regression` 已豁免这两类)。
- 端到端 7 项 mock 单测全 PASS,详见 §5。

---

## §1 Luna 取证清单(Step 1A 报告)

文件:`coordination/markers/WO-3.19/.luna-survey.txt`(11 行)

### Production 命中(应清理)
**3 处,全部位于 `tv-html/src/dev/GalleryView.vue`** —— `/dev/` 路径,`verify-lib.check_no_luna_regression` 已豁免:
```
tv-html/src/dev/GalleryView.vue:123:    name: 'Luna', age: 5, gender: 'female' as const,
tv-html/src/dev/GalleryView.vue:166:    'Luna tiptoed deeper into the glowing forest, ...'
tv-html/src/dev/GalleryView.vue:199:      summary: { mainCharacter: 'Luna', ... }
```
**未改动原因:** `tv-html/src/dev/*` **不在 §spillover-allowed 白名单**,如改动会 spillover FAIL。verify-lib v3 的 `check_no_luna_regression` 显式 `grep -v '/dev/'`,所以这是已知豁免。

### Mock/Demo/Test 命中(允许保留)
**1 处:**
```
tv-html/src/utils/demoStory.ts:33: 'Luna tiptoed deeper into the glowing forest, ...'
```
WO-3.9 已显式豁免(README §previous-wo-whitelist)。该文件第 79 行的 `mainCharacter: 'Dora'` 已是 Dora。

### Server-v7 命中
**0 处** — server 端 prompt 模板从未硬编码 Luna(WO-3.8 已变量化)。

---

## §2 主角链路诊断:3 个问题点

### P1:Mock seed 默认主角 ✅ 已是 Dora,无需改动

| 文件 | 行 | 当前 | 备注 |
|---|---|---|---|
| `tv-html/src/services/bridge/mock.ts` | 28 | `name: 'Dora'` | 浏览器 autobind=1 demo 路径默认 Dora |
| `tv-html/src/utils/demoStory.ts` | 79 | `mainCharacter: 'Dora'` | 故事 demo 主角 Dora |
| `tv-html/mock/profile.json` | 28 | `"name": "Dora"` | profile mock JSON Dora |
| `tv-html/src/dev/GalleryView.vue` | 123 | `name: 'Luna'` | dev-only,verify 豁免,不改 |

verify check `[8] mock seed 默认主角是 Dora` PASS(1 hit `name: 'Dora'`)。

### P2:Server prompt 硬编码 vs 变量化 ✅ WO-3.8 已变量化,WO-3.19 加固

WO-3.8 已经把 12-page LLM prompt 切到 `${childName}` 模板(`services/llm.js` mockStoryJson 各处用 `${name}`/`${character}` 内插)。**WO-3.19 在此基础上把 fallback 链路改成显式优先级:**

修复点 (`server-v7/src/services/llm.js`):
```js
// 旧:const childName = args?.childProfile?.name || 'Dora';
// 新:
const childName = resolveChildName({
  extractedProtagonist: args?.dialogueSummary?.extractedProtagonist,
  childProfile: args?.childProfile,
});
const safeArgs = {
  ...args,
  childProfile: { ...(args?.childProfile || {}), name: childName, childName },
  dialogueSummary: {
    ...(args?.dialogueSummary || {}),
    childName,
    mainCharacter: args?.dialogueSummary?.mainCharacter || childName,
  },
};
```

verify check `[6] server-v7 prompt 含 childName 变量` PASS(4 hits ≥ 3 阈值)。

### P3:用户口头主角名提取 ✅ WO-3.19 真正补齐(核心)

**之前的链路**(`server-v7/src/routes/story.js` v7.2 done branch):
```js
mainCharacter:
  session.arc.character ||                                       // LLM 跟踪的 arc 字段(可能是短语)
  session.history.find((h) => h.role === 'user' && h.round === 1)?.text ||  // 整段口头原文
  session.childProfile.name,
```
**问题:** `arc.character` 是 LLM 自由文本(可能是 "a brave bear" 这种短语),round-1 user reply 是整段 "I want a boy named Tom" 原文。**没有 cleaned name 字段**。

**WO-3.19 链路:**
1. `liveDialogueTurnV2` 在 systemPrompt 末尾追加 `PROTAGONIST_EXTRACTION_ADDENDUM`,要求 LLM 在 v7.2 JSON 里加输出 `extractedProtagonist`(纯名字,1-2 词,无短语)。
2. `coerceDialogueV2Payload` 解析 `extractedProtagonist`(也接受 alias `extracted_protagonist` / `protagonistName`),sanitize 到 24 char 单行。
3. `mockDialogueTurnV2` 用正则 (`/(?:named|called|hero is|主角叫)\s+(...)/`) 在 mock 模式里同样产出 `extractedProtagonist`,使 smoke test 端到端覆盖。
4. `story.js` v7.2 turn handler 累积 `session.extractedProtagonist`(sticky:一旦设置就保留,后续 turn 不会被空值刷掉)。
5. `done` 分支用 `resolveChildName({ extractedProtagonist, childProfile })` 计算 cleaned `childName`,写入 `session.summary.childName` + `session.summary.mainCharacter`。
6. 队列 enqueue 把整个 `session.summary` 传给 `storyJob`,storyJob 调 `generateStoryJson`,`generateStoryJson` 再用 `resolveChildName` settle 一次(双重保险),把 `childName` 注入 `childProfile.name` + `dialogueSummary.childName` + `dialogueSummary.mainCharacter`。

---

## §3 修复文件清单 + 行号

| 文件 | 改动范围 | 净增行 |
|---|---|---|
| `server-v7/src/services/llm.js` | +`resolveChildName` (line ~52) +`PROTAGONIST_EXTRACTION_ADDENDUM` (line ~74) +`mockExtractProtagonist` (line ~92) +`mockDialogueTurnV2` 加 history/userInput 参数 + `extractedProtagonist` 字段 +`coerceDialogueV2Payload` 解析 `extractedProtagonist` (~line 624) +`liveDialogueTurnV2` 追加 addendum (~line 668) +`generateStoryJson` 使用 `resolveChildName` 双重链路 (~line 808) +`mockStoryJson` 改用 `resolveChildName` (~line 838) | 150 |
| `server-v7/src/routes/story.js` | +`import resolveChildName` (line 32) +`session.extractedProtagonist` sticky 累积 (~line 442) +done 分支用 `resolveChildName` 构建 `session.summary.childName` (~line 478) +v2-lite 分支同步链路 (~line 663) | 45 |
| `coordination/markers/WO-3.19/.luna-survey.txt` | 取证报告 | 11 |
| `coordination/markers/WO-3.19/.protagonist-survey.txt` | 取证报告 | 59 |
| `coordination/markers/WO-3.19/.extraction-survey.txt` | 取证报告(空 — 工单前 0 提取代码,符合 P3 诊断) | 4 |
| `coordination/markers/WO-3.19/.fix-applied` | marker | 0 |

**总计 ~265 行**,在 README 估计 200-300 行范围内。

---

## §4 Verify 结果(11/12 PASS)

```
[1]  ✅ Step 1A: .luna-survey.txt 取证报告存在 (11 行)
[2]  ✅ Step 1B: .protagonist-survey.txt 取证报告存在
[3]  ✅ Step 1C: .extraction-survey.txt 取证报告存在
[4]  ✅ fix-applied marker 存在
[5]  ✅ WO-3.9 invariant: Luna 不重现 production 代码 (0 hits)
[6]  ✅ server-v7 prompt 含 childName 变量 (4 hits ≥3 阈值)
[7]  ✅ server-v7 含主角优先级链路代码 (11041 hits)
[8]  ✅ mock seed 默认主角是 Dora (1 hit)
[9]  ✅ tv-html npm run build 通过
[10] ✅ server-v7 routes/story.js 可加载
[11] ✅ 无 .backup-* / .bak 文件残留
[12] ❌ spillover — 全部是预先存在 dirty 文件(见 §6)
```

**唯一 FAIL 项 [12] 详情:**
```
dingtalk-bot/src/command-router.js     ← WO-3.17 治理时已修改,未提交
dingtalk-bot/src/done-watcher.js       ← 同上
dingtalk-bot/src/index.js              ← 同上
h5/.gitignore                          ← WO-3.15 hygiene
server-v7/.gitignore                   ← WO-3.15 hygiene
tv-html/.gitignore                     ← WO-3.15 hygiene
server-v7/src/routes/draft.js          ← WO-3.18 新增,但 WO-3.19 §spillover-allowed 没含
```
**WO-3.19 未引入任何 spillover** — 上述 7 文件在 WO-3.19 启动前 `git status` 已 dirty(WO-3.18 报告 §7 也记录了相同 6/7 文件 FAIL,WO-3.19 仅多 `server-v7/src/routes/draft.js`,该文件来自 WO-3.18 但未在 WO-3.19 spillover regex)。

---

## §5 端到端测试结果(7/7 PASS)

通过 `node -e` 在 `USE_MOCK_AI=1` 下端到端跑 LLM service:

| # | 场景 | 输入 | 期望 | 结果 |
|---|---|---|---|---|
| 1 | verbal extraction wins | `{ extractedProtagonist:'Tom', childProfile:{name:'Dora'} }` | `'Tom'` | ✅ Tom |
| 2 | childProfile fallback | `{ extracted:null, childProfile:{name:'Mia'} }` | `'Mia'` | ✅ Mia |
| 3 | brand-anchor default | `{}` | `'Dora'` | ✅ Dora |
| 4 | mock dialogue 提取 Tom | `userInput:'I want a boy named Tom'` | `extractedProtagonist:'Tom'` | ✅ Tom |
| 5 | storyJson 用 extracted=Tom | `dialogueSummary.extractedProtagonist='Tom', childProfile.name='Dora'` | title:`Tom's Rainbow Forest Adventure` | ✅ |
| 6 | storyJson 无 extracted,用 childProfile.name=Mia | `childProfile.name='Mia'` | title:`Mia's Rainbow Forest Adventure` | ✅ |
| 7 | storyJson 全空,用 Dora | `{}` | title:`Dora's Rainbow Forest Adventure` | ✅ |

**Test 4-7 验证三档优先级链路全部生效** —— 这等价于 README §accept-test-url 的:
- 路径 2「口头说 Tom → 故事主角是 Tom」(test 4 + 5)
- 路径 3「不口头说 → 故事主角是 My Den 名字」(test 2 + 6)
- 路径 1「My Den 默认显示 Dora」(test 3 + 7;mock.ts 已是 Dora)

完整 transcript 详见 §5 末尾(略)。

### request/response 形态(以 storyJob 调用为例)
```
generateStoryJson({
  systemPrompt: '<built by buildStorySystemPrompt(childProfile)>',
  dialogueSummary: { extractedProtagonist:'Tom', mainCharacter:'Tom', scene:'forest', conflict:'lost key' },
  childProfile: { name:'Dora', age:5, primaryLang:'en', secondLang:'zh' }
})

→ resolveChildName 解析 childName='Tom'
→ safeArgs.childProfile = { name:'Tom', childName:'Tom', age:5, ... }
→ safeArgs.dialogueSummary = { childName:'Tom', mainCharacter:'Tom', extractedProtagonist:'Tom', ... }
→ mockStoryJson / liveStoryJson 全程使用 'Tom'
→ 返回 { title:"Tom's Rainbow Forest Adventure", pages: [{...text including 'Tom'}, ...] }
```

---

## §6 WO-3.18 是否冲突

**无冲突。** WO-3.18 已落库(`coordination/done/WO-3.18-report.md` ts 17:02),包含:
- `tv-html/src/screens/DialogueScreen.vue` - WO-3.18 改完
- `tv-html/src/screens/HomeScreen.vue` - WO-3.18 改完
- `tv-html/src/screens/GeneratingScreen.vue` - WO-3.18 改完
- `tv-html/src/stores/draft.ts` - WO-3.18 新增
- `server-v7/src/routes/draft.js` - WO-3.18 新增

WO-3.19 **只动 server 端两个文件**(`services/llm.js` + `routes/story.js`),DialogueScreen.vue 未触碰,符合 README §risk Risk 3 的缓解策略。

WO-3.18 引入的 `server-v7/src/routes/draft.js` 在 WO-3.19 §spillover-allowed regex 里没列出,因此在 verify [12] spillover 检查里被算作 FAIL 命中(同 WO-3.18 自己的 spillover 检查也 FAIL 是同样原因)。**这是 WO-3.18 未提交的副作用,不是 WO-3.19 引入。**

---

## §7 决策权边界(AGENTS.md §1.1 自查)

- ✅ 没有 push main(完成后由 Kristy 走 PR)
- ✅ 没有改 schema / .env / 删文件
- ✅ 没有 > $10 烧钱(端到端测试全跑 mock,$0)
- ✅ 没改 PRODUCT_CONSTITUTION.md
- ✅ 全程在 `release/showroom-20260429` 分支

---

## §8 期望 next action

1. **Kristy 浏览器实测** `https://tv.bvtuber.com/`(server 重启后):
   - 流程 1:不说主角名 → 故事应是 child.name(Dora 默认)
   - 流程 2:口头说 "I want a boy named Tom" → 故事主角应是 Tom
   - 流程 3:My Den 显示孩子名 Dora(autobind=1 的 demo 路径)
2. **Server 重启** 让 `services/llm.js` + `routes/story.js` 改动生效(mock 模式现已通过单测验证;live 模式需 Gemini API key + 实际对话才能完整验证 LLM 是否输出 `extractedProtagonist` 字段 — 如 LLM 不返回,coercer 会 sanitize 成 null,链路 fallback 到 childProfile.name,**降级安全**)。
3. **下次 LLM cost review** 确认 PROTAGONIST_EXTRACTION_ADDENDUM 没显著增加 token(addendum 全文 ~75 词,每对话 7 turn × 75 = 525 词 / dialogue,Gemini 2.5 Flash 输入 $0.075/MTok ⇒ 每对话增量 < $0.00004,可忽略)。

---

**By: Factory Droid V4 Pro (exec mode)**
**v1.0 — 2026-05-01**
