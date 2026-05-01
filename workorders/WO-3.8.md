# WO-3.8: Create Story 体验完善哆包（4 个反馈一起修）

> **创建时间**: 2026-04-30
> **派给**: Factory(claude-opus-4-7, --auto high)
> **预计执行**: 35-50 分钟（哆包工单，4 个反馈一起改）
> **类型**: Standard 三件套（哆包例外，行数上限放宽 150）
> **Parent commit**: WO-3.7 commit `c4e62ab`
> **改动范围**: tv-html DialogueScreen + i18n + server-v7 llm.js + prompt 文件 + tv-html 某个 CSS
> **改动量预估**: ~120-140 行（4 个反馈跨前后端）

---

## §1. 背景

### 用户首次完整成功路径实测后（2026-04-30 21:55+）反馈

Kristy 第一次跑通 dialogue → outline → 生成 → 阅读页全流程。基于真实体验提出 4 个产品反馈：

1. **P1 体验**：DialogueScreen 孩子说话时，**保留上一轮小熊的回答文本**——避免闪过去，孩子忘记小熊上次说什么了
2. **P1 品牌**：默认主角名应该是 **Dora**（卷发黄裙白衫，5 岁，Kristy 女儿）。当前生成出 "**露娜**"（Luna 中文音译）。memory #1 已锁定 Dora 是品牌锚点，但代码默认值未贯彻
3. **P1 产品化**：prompt 主角名应该**变量化**为 `{childName}`，等家长系统接入后从用户档案读真名
4. **P2 UI**：OutlineScreen 故事大纲页右边有**鼠标滚动条样式**，应改成**自动滚动**或**隐藏滚动条**（外观不要鼠标式滚动条）

### 实测确认（不在改动范围）
- ✅ **StoryPreviewScreen 已经只在创建路径**：DialogueScreen 458 行 `screen.go('story-preview')` 仅在 done=true 时调用；重看故事 Library → StoryCover → StoryBody **不经过 StoryPreview**。所以"开场动画只首次出现"这个反馈**已经实现**，本工单**不动 StoryPreview 路由**。

### 哆包决定理由
4 个反馈都属于"Create Story 体验完善"——产品 phase 视角是同一阶段。Kristy 决定哆包，**接受改动量超出 80 行 Standard 上限**，但额外加严：
- 改动总行数**硬上限 150 行**
- 任何一项失败 → 整个回滚（不接受部分成功）
- verify.sh 加严到 12 项（防止某项漏掉但整体看起来 OK）

---

## §2. 改动列表

### §2.0 勘察阶段（Factory 必跑，**先做这步**）

#### 2.0.A 找 Luna 默认主角名出现位置（反馈 2/3 共用入口点）

```bash
# Luna 在 server 里出现的位置
grep -rnE "Luna|露娜|protagonist|hero name|defaultName|childName|child.*name" /opt/wonderbear/server-v7/src 2>/dev/null | grep -v node_modules | grep -v backup | head -30

# Luna 在 prompt 文件里
grep -rnE "Luna|露娜|protagonist" /opt/wonderbear/server-v7/src/prompts 2>/dev/null | head -10

# callGeminiStory 函数定义位置
grep -nE "function callGeminiStory|async function callGeminiStory|callGeminiStory.*=" /opt/wonderbear/server-v7/src/services/llm.js | head -5

# Story 表 metadata 里有没有 childName / heroName 字段
grep -nE "childName|heroName|protagonistName" /opt/wonderbear/server-v7/prisma/schema.prisma
```

#### 2.0.B 找 outline 列表渲染位置（反馈 4）

```bash
# outline 列表在哪渲染（截图里"Your story is taking shape" 5 项列表）
grep -rnE "taking shape|story-taking-shape|outline|outlineList|tagItem|paragraphList|3-5 paragraph" /opt/wonderbear/tv-html/src/screens 2>/dev/null | head -20

# scroll / overflow 相关 CSS（找鼠标式滚动条）
grep -rnE "overflow-y.*scroll|overflow-y.*auto|::-webkit-scrollbar" /opt/wonderbear/tv-html/src/screens 2>/dev/null | head -20
```

#### 2.0.C dialogue store 现有"上一轮回答"字段（反馈 1）

```bash
# 现有 dialogue store 状态字段
sed -n '50,90p' /opt/wonderbear/tv-html/src/stores/dialogue.ts

# DialogueScreen 现在怎么显示 bear-thinking 时的画面
grep -nE "bear-thinking|bear-listening|isListening|isRecording" /opt/wonderbear/tv-html/src/screens/DialogueScreen.vue | head -20
```

**Factory 必须先把以上 3 段勘察输出贴到报告里，再开始改代码**。报告 §1 必须明确：
- Luna 默认值的**精确文件 + 行号**（可能在 callGeminiStory / prompt fallback / api route handler 等多处）
- outline 列表的渲染**vue 文件 + 行号 + CSS class 名**
- dialogue store 现有 phase + state 字段命名

---

### §2.1 反馈 1：DialogueScreen 上下文连续性

**目标**：孩子按住麦克风说话时（phase = `child-speaking` 或 `recording`），画面上**保留上一轮小熊的回答文本**，让孩子能看到对话上下文，不会"小熊说完话后画面闪过去就忘"。

**改动思路**：

1. **dialogue store**（`tv-html/src/stores/dialogue.ts`）新增字段：
   ```typescript
   /** v3.8 — Last bear reply text (zh + en), shown on DialogueScreen during child-speaking phase. */
   lastBearReply: { zh: string; en: string } | null,
   ```
   在 `applyTurnResponse` (line ~136-181 附近) 处理 server 返回时，**把当轮 bear 的回复缓存进 `lastBearReply`**——但**只在下一轮 `bear-thinking` / `child-speaking` 切换时显示**，本轮 `bear-speaking` 仍正常 TTS 播报。

2. **DialogueScreen.vue**（template 改动）：
   - 找到 `bear-thinking` / `child-speaking`（孩子说话）phase 的画面
   - 在小熊形象**附近**加一个**淡化样式的文本气泡**（避免抢戏），显示 `lastBearReply` 的当前语言版本
   - 仅当 `lastBearReply` 不为 null 时显示（第一轮没上文，不显示）

3. **CSS**：
   - 文本气泡**字号小**（14-16px）
   - 透明度 0.7（淡化）
   - 位置在小熊**上方**或**右侧**（不挡住小熊）
   - 不超过 2-3 行（CSS line-clamp）

**关键约束**：
- ✅ 不许改 `bear-speaking` phase 的现有 TTS 行为
- ✅ 不许改 `applyTurnResponse` 现有逻辑，**只新增** `lastBearReply` 缓存
- ✅ 第一轮（lastBearReply === null）必须不显示，避免显示空气泡
- ✅ 文本必须从 i18n 路径取（不许硬编码）

### §2.2 反馈 2 + 3：默认主角 Dora + childName 变量化（共用入口点）

**勘察输出后，Factory 应该已经知道 Luna 在哪**。可能位置：
- `server-v7/src/services/llm.js` 里 `callGeminiStory` 入口的 fallback 默认
- `server-v7/src/prompts/v2-lite/story.system.txt` 里某段 prompt 模板
- `server-v7/src/routes/dialogue.js` 或 `routes/story.js` 处理请求时的默认填充

**改动思路**（按勘察后的真实位置适配）：

1. **找到所有 Luna / 露娜 / "default protagonist" 字样的位置**
2. 把硬编码的 `Luna` 改为：
   ```javascript
   const childName = req.body?.childName || childProfile?.name || 'Dora';
   ```
3. **prompt 文件如果有 Luna 字样**，改成 `{{childName}}` 模板字面量（v2-lite 已有 prompt 加载器，可能已支持 mustache 风格替换）
4. **如果没有现成的 childName 字段**：从 Child 表读（Story.childId → Child.name），fallback 到 'Dora'

**关键约束**：
- ✅ 必须从**用户档案**取真名（如果有 child.name 字段）
- ✅ fallback 默认必须是 **Dora**，不是 Luna
- ✅ prompt 里硬编码的 Luna **全部替换**，不留死字符串
- ✅ 兼容现有 Story 数据（不破坏老故事的渲染）

### §2.3 反馈 4：OutlineScreen 滚动条美化

**勘察输出后，Factory 应该已经知道 outline 列表在哪个 vue 渲染（可能是 DialogueScreen 自己的某个 phase 视图，或独立组件）**。

**改动思路**：

```css
/* 隐藏滚动条但保留滚动功能 */
.outline-list-container {
  overflow-y: auto;
  scrollbar-width: none;          /* Firefox */
  -ms-overflow-style: none;        /* IE/Edge */
}
.outline-list-container::-webkit-scrollbar {
  display: none;                  /* Chrome/Safari */
}
```

**可选增强**：内容超出时**自动滚动**（每 3-5 秒滑动一行）：
- 用 `setInterval` 修改 `scrollTop`
- 仅当 `scrollHeight > clientHeight` 时启动

**关键约束**：
- ✅ 滚动**功能**保留（用户用键盘 / 遥控器 D-pad 仍能滚），只去**视觉滚动条**
- ✅ 自动滚动是**可选增强**——如果实现复杂，**只做隐藏滚动条**这一项即可
- ✅ 不许引入额外动画库

---

## §3. 红线（哆包工单加严版）

- ❌ 不许 git push
- ❌ 不许 pm2 restart（由 Kristy 手动）
- ❌ 不许 mock 兜底
- ❌ 不许 `&&` 命令链
- ❌ 不许 ssh heredoc 嵌套引号
- ❌ 不许 "Always allow"
- ❌ 不许 console.log 调试污染
- ❌ **不许动 WO-3.7 retry 逻辑**（buildStoryPromptWithFeedback / generateStoryWithRetry）
- ❌ **不许动 StoryPreviewScreen 路由**（已确认正确）
- ❌ **不许只做 4 项里的 3 项**——任何一项无法实现立即停下报告，**不许只交付部分**

🆕 **哆包工单加严**：
- ❌ **不许把多行 markdown 嵌入 JS 字符串字面量**（WO-DT-1.3 v1 教训）
- ❌ **改动总行数硬上限 150 行**（哆包例外放宽自 80）。超 150 立刻停下报告
- ❌ **任何一项 verify FAIL = 整个工单回滚**——不接受部分成功

**Factory 自检要求**（强制）：
- ✅ 改完后必须跑 `node -e "require('./src/services/llm.js')"` 模块加载测试
- ✅ 改完后必须跑 `npm run build`（tv-html）+ `node -c`（server-v7 改动文件）
- ✅ 报告里**必须**贴 4 个反馈各自的改动行号 + 关键代码段

---

## §4. 备份纪律

```bash
ssh wonderbear-vps "
cd /opt/wonderbear
# tv-html 侧
cp tv-html/src/screens/DialogueScreen.vue tv-html/src/screens/DialogueScreen.vue.backup-2026-04-30-wo-3.8-pre
cp tv-html/src/stores/dialogue.ts tv-html/src/stores/dialogue.ts.backup-2026-04-30-wo-3.8-pre
cp tv-html/src/i18n/locales/zh.ts tv-html/src/i18n/locales/zh.ts.backup-2026-04-30-wo-3.8-pre
cp tv-html/src/i18n/locales/en.ts tv-html/src/i18n/locales/en.ts.backup-2026-04-30-wo-3.8-pre
# server-v7 侧（具体文件 Factory 勘察后确定）
cp server-v7/src/services/llm.js server-v7/src/services/llm.js.backup-2026-04-30-wo-3.8-pre
cp server-v7/src/prompts/v2-lite/story.system.txt server-v7/src/prompts/v2-lite/story.system.txt.backup-2026-04-30-wo-3.8-pre
"
```

`.gitignore` 已加 `**/*.backup-*` 排除规则。

---

## §5. Dry-run 校验

```bash
cd /opt/wonderbear/server-v7
node -c src/services/llm.js
node -e "require('./src/services/llm.js'); setTimeout(() => process.exit(0), 100)" 2>&1 | head -10

cd /opt/wonderbear/tv-html
npm run build 2>&1 | tail -10
```

预期：所有命令通过。**v1 失败教训：必须跑 require() 不能只 node -c。**

---

## §9. 验收

### §9.1 自动验证（verify.sh 跑）

详见 `WO-3.8-verify.sh`。post 模式 12 项检查：
1. 6 个 backup 文件存在
2. dialogue.ts 含 `lastBearReply` 字段
3. DialogueScreen.vue 含 `lastBearReply` 引用
4. DialogueScreen 文本气泡 CSS 存在
5. server llm.js 不再含硬编码 `'Luna'`
6. server llm.js 含 `'Dora'` 作为 fallback 默认
7. server llm.js 含 `childName` 变量引用
8. prompt 文件不再含 `Luna` 字符串
9. outline 列表 CSS 含 `scrollbar-width: none` 或等价
10. server-v7 编译 + require() 测试通过
11. tv-html npm run build 通过
12. Factory 报告含 4 个反馈各自的关键代码段

### §9.2 人工 restart（Kristy 跑）

verify 全过后跑：
```bash
ssh wonderbear-vps "pm2 restart wonderbear-server && rsync -av --delete /opt/wonderbear/tv-html/dist/ /var/www/wonderbear-tv/ && pm2 logs wonderbear-server --lines 20 --nostream"
```

### §9.3 浏览器实测（Kristy 验收，**烧 $0.92**）

走完整流程：
1. Chrome Ctrl+Shift+R `tv.bvtuber.com`
2. DialogueScreen 走对话
3. **第二轮起观察小熊上一轮回答是否保留** ✅
4. 走到 outline 页 → **滚动条应消失** ✅
5. 故事生成完成 → 看故事标题和正文里**主角名是不是 Dora**（不是 Luna）✅
6. 看 server 日志 `[storyGen]` 是否正常

**4 项都对 = WO-3.8 闭环**

---

## §10. 回滚

### 10.1 Factory 跑歪 / 部分失败

```bash
ssh wonderbear-vps "
cd /opt/wonderbear
# tv-html 侧
cp tv-html/src/screens/DialogueScreen.vue.backup-2026-04-30-wo-3.8-pre tv-html/src/screens/DialogueScreen.vue
cp tv-html/src/stores/dialogue.ts.backup-2026-04-30-wo-3.8-pre tv-html/src/stores/dialogue.ts
cp tv-html/src/i18n/locales/zh.ts.backup-2026-04-30-wo-3.8-pre tv-html/src/i18n/locales/zh.ts
cp tv-html/src/i18n/locales/en.ts.backup-2026-04-30-wo-3.8-pre tv-html/src/i18n/locales/en.ts
cd tv-html && npm run build
# server-v7 侧
cd /opt/wonderbear
cp server-v7/src/services/llm.js.backup-2026-04-30-wo-3.8-pre server-v7/src/services/llm.js
cp server-v7/src/prompts/v2-lite/story.system.txt.backup-2026-04-30-wo-3.8-pre server-v7/src/prompts/v2-lite/story.system.txt
pm2 restart wonderbear-server
"
```

### 10.2 已 commit 但想撤销

```bash
ssh wonderbear-vps "cd /opt/wonderbear && git reset --hard c4e62ab && pm2 restart wonderbear-server"
```

`c4e62ab` = WO-3.7 commit，WO-3.8 的 parent。

---

## 派单 SOP

### 1. 上传 + 配置

```bash
scp /c/Users/Administrator/Downloads/WO-3.8.md /c/Users/Administrator/Downloads/WO-3.8-verify.sh /c/Users/Administrator/Downloads/WO-3.8-collect.sh wonderbear-vps:/opt/wonderbear/workorders/

ssh wonderbear-vps "
sed -i 's/\r\$//' /opt/wonderbear/workorders/WO-3.8*.sh
chmod +x /opt/wonderbear/workorders/WO-3.8*.sh
mkdir -p /opt/wonderbear/coordination/workorders/WO-3.8
cp /opt/wonderbear/workorders/WO-3.8.md /opt/wonderbear/coordination/workorders/WO-3.8/README.md
ls -la /opt/wonderbear/workorders/WO-3.8*
"
```

### 2. 派 Factory

钉钉发：
```
派 WO-3.8
```

### 3. Factory 完工 → 钉钉应自动 verify（WO-DT-1.3 v2 已生效）

⚠️ 期待钉钉自动收到：
- 🔍 WO-3.8 自动跑 verify.sh ...
- ✅ WO-3.8 verify 全过（12/12） / ❌ WO-3.8 verify 失败 (exit=N)

### 4. verify 通过 → Kristy restart + 烧 $0.92 真实测试

---

## §11. commit message 模板

```
fix(create-story): WO-3.8 Create Story 体验完善哆包（4 反馈一起修）

Kristy 首次完整成功路径实测后提出 4 个反馈,作为产品 phase 整体修复:

1. DialogueScreen 上下文连续性 (P1 体验)
   - dialogue store 加 lastBearReply 字段缓存上一轮小熊回答
   - 孩子说话画面新增淡化文本气泡显示 lastBearReply
   - 第一轮无上文时不显示

2. 默认主角名 Dora 不是 Luna (P1 品牌)
   - 移除 server-v7 / prompt 文件里所有硬编码 Luna
   - fallback 默认改为 Dora (memory #1 锁定的品牌锚点)

3. childName 变量化 (P1 产品化)
   - 主角名从 Child 表 child.name 取
   - fallback 链: req.body.childName -> child.name -> 'Dora'
   - prompt 文件用 {{childName}} 模板占位

4. OutlineScreen 滚动条美化 (P2 UI)
   - 隐藏鼠标式滚动条 (3 浏览器兼容写法)
   - 滚动功能保留 (D-pad 键仍可滚)

实现要点:
- 哆包工单,4 项任何一项失败 = 整个回滚
- 改动总行数 ~XXX 行 (上限 150)
- 不动 WO-3.7 retry 逻辑 / StoryPreviewScreen 路由

Test: verify.sh 12 项全过 + 浏览器实测 4 项全过.

Refs: coordination/workorders/WO-3.8/README.md
```

---

完。
