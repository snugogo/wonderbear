# 工单: 2026-04-29-merge-trackb-into-asr

## ⚠️ 最高优先级声明
Kristy 已经人肉测试过 Track B 的【界面 + 交互】,这是不可丢失的成果。
ASR 三音色是【后端代码改动】,即使丢失也能用单元测试快速重做。

【冲突解决的绝对规则】:
- Track B 的代码完整性 > ASR 三音色路由 > 一切其他考虑
- 失去 ASR 三音色可以接受
- 失去 Track B 任何字段、任何 store 状态、任何 i18n key、任何路由 不可接受

## 目标
把 Track B (commit b009acb) cherry-pick 到 feat/asr-tts-dual-provider 之上,
创建 release/showroom-20260429 分支,准备展会。

## 工作目录
/opt/wonderbear/server-v7

## 红线
- ❌ 不 push 到任何远端
- ❌ 不动 main
- ❌ 不 pm2 restart
- ❌ 任何拿不准的场景立刻停下报告
- ❌ 23 个 dialogue 单测有挂立刻停
- ❌ node --check 失败立刻停

## Step 1: 切到合并分支
git status  # 必须 clean
git checkout -b release/showroom-20260429 feat/asr-tts-dual-provider
git rev-parse HEAD  # 必须是 3071f66

## Step 2: Cherry-pick Track B
git cherry-pick b009acb

预期冲突文件:
- server-v7/src/routes/story.js
- server-v7/src/services/llm.js
- server-v7/src/utils/storyPrompt.js

## Step 3: 解决冲突 — 强制规则

### 总原则: 永远向 Track B 倒
看到 <<<<<<< HEAD 和 >>>>>>> b009acb (Track B) 时:

1. 默认取 Track B (>>>>>>> b009acb 那一侧)
2. 检查 HEAD 那一侧 (ASR 分支) 有没有【新增】的东西不在 Track B 里
3. 如果有,只把【新增】部分作为补丁加回 Track B 骨架上
4. 如果【ASR 分支改了 Track B 的现有代码】(不是新增,是修改) → 立刻停,报告这处冲突

### 文件级具体规则

#### routes/story.js
- 主体: 完全采用 Track B 的 v7.2 turn 流程
- 必须保留的 Track B 元素:
  - imports: generateDialogueTurnV2, buildDialogueSystemPromptV2, DIALOGUE_ARC_STEPS, evaluateReply, shouldForceFinish
  - v7.2 turn 处理逻辑(包含 quality 评分、arc 状态、forceDone 判断)
  - /dialogue/:id/confirm 端点
  - lastTurnSummary / mode / arc / storyOutline 字段
- 可以从 ASR 分支补回的小补丁:
  - 在 ttsSynthesize 调用上加 `purpose: 'dialogue'` 字段(如果调用本身在 Track B 流程里)
- ⚠️ 如果 Track B 流程根本没有 ttsSynthesize 调用了(因为 v7.2 重新组织了流程) 
  → 不强加,报告 Kristy 决定

#### llm.js
- 必须保留 Track B 新增的 generateDialogueTurnV2 函数(完整,包括 retry + default-bank fallback + v7.1 shape coercion)
- ASR 分支如果改了【现有的 generateDialogueTurn 函数】 
  → 检查是否破坏 generateDialogueTurnV2 的依赖
  → 如果会破坏,取 Track B 版本,丢 ASR 改动
- ASR 分支如果【新增了别的导出函数】(不影响 Track B) 
  → 保留

#### storyPrompt.js  
- 必须保留 Track B 新增的: buildDialogueSystemPromptV2, DIALOGUE_ARC_STEPS
- 必须保留老的 buildDialogueSystemPrompt + buildDialogueFirstQuestion + roundCountForAge
- ASR 分支如果改了任何现有函数 → 取 Track B 版本

### Rule X (兜底): 拿不准就停
任何不在上述明确规则里的冲突情况 → 立刻停下,报告 Kristy。
不要"看着合理就合并"。

## Step 4: 完成 cherry-pick
git add 已解决冲突的文件
git cherry-pick --continue
git log --oneline -3

## Step 5: 语法检查
node --check src/routes/story.js
node --check src/services/llm.js
node --check src/services/tts.js
node --check src/services/asr.js
node --check src/utils/storyPrompt.js
node --check src/services/dialogue-quality.js
任何失败立刻停。

## Step 6: Track B 单测 (必须 23 全过)
cd /opt/wonderbear/server-v7
npm test -- --grep "dialogue-cocreation|dialogue-quality" 2>&1 | tail -40

任何挂 → 立刻停,报告挂的测试名 + 错误。

## Step 7: ASR/TTS 单测  
npm test -- --grep "tts|asr|provider-chain" 2>&1 | tail -40

记录 pass/fail/skip。如果 ASR/TTS 单测【全挂】(>50% fail) → 报告但不停。
如果 ASR/TTS 部分挂(<50% fail) → 继续,在报告里列出。

## Step 8: 全单测扫一遍
npm test 2>&1 | tail -30

记录 summary,不因 fail 而停。

## Step 9: 报告

写到: /opt/wonderbear/coordination/done/2026-04-29-merge-trackb-into-asr-report.md

必含:
1. 当前 HEAD + git log --oneline -5
2. cherry-pick 冲突文件清单
3. 每个冲突的【处理摘要】(取了哪一侧、为什么、改了几行)
4. 【明确说明】Track B 的所有界面元素是否完整保留(逐项 check):
   - generateDialogueTurnV2 ✅/❌
   - buildDialogueSystemPromptV2 ✅/❌
   - DIALOGUE_ARC_STEPS ✅/❌
   - /dialogue/:id/confirm 端点 ✅/❌
   - lastTurnSummary / mode / arc / storyOutline 字段 ✅/❌
   - dialogue-quality.js (evaluateReply, shouldForceFinish) ✅/❌
5. 【明确说明】ASR 三音色 purpose 路由是否保留 ✅/❌(如果丢了说明丢了)
6. node --check 结果
7. 23 dialogue 单测结果
8. ASR/TTS 单测结果
9. 全单测 summary
10. git diff --stat origin/feat/asr-tts-dual-provider HEAD

## 不做的事
- ❌ 不 push
- ❌ 不 pm2 restart
- ❌ 不动 .env
- ❌ 不删除老 backup
- ❌ 不动 main
