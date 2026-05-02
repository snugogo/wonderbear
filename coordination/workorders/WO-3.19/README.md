# WO-3.19 — 主角变量传递链路修复(Luna→Dora 真 bug)

**版本:** 1.0
**派单时间:** 2026-05-01
**承接 Agent:** Factory V4 Pro
**预估时间:** 60-90 分钟
**预估行数:** 200-300 行
**前置依赖:** **WO-3.18 闭环后再派**(避免冲突 DialogueScreen)

---

## §scope

修复 memory #21 第 5 项,实质是**主角变量传递链路断裂**。

### 真 bug 描述(Kristy 实测)

> 用户口头明确说 "DORA",但生成的故事仍叫 "LUNA"。My Den 的孩子变量名也是 LUNA。

### 期望的优先级链路

```
最高优先级:用户口头说的主角(对话中提取)
    ↓ 没说时
中优先级:My Den 设置中的孩子名字(parent settings / Child 表)
    ↓ 没设置时(首次使用 / mock 阶段)
最低优先级:默认 mock seed = "Dora"(❌ 不是 Luna!)
```

---

## §accept-test-url

`https://tv.bvtuber.com/`

验收路径:
1. 看 HomeScreen + My Den 默认显示的孩子名 → 应是 **Dora** 不是 Luna(mock seed)
2. 走完一次对话,口头说"我想要一个叫 Tom 的小男孩" → 生成的故事主角必须是 **Tom**
3. 不口头说主角名,直接走完对话 → 生成的故事主角应是 My Den 的孩子名(默认是 Dora)
4. 全 grep `Luna` 在 production 代码 = 0 命中(mock/test/fixture 除外)

---

## §previous-wo-whitelist

WO-3.9 已经做过 Luna→Dora 的部分替换,本工单是其延续。允许继续修改:
- `tv-html/src/utils/demoStory.ts` 等 mock 路径(WO-3.9 已豁免在 verify-lib `check_no_luna_regression`)
- 但 production 代码必须 0 Luna

---

## §spillover-allowed

```
tv-html/src/screens/(HomeScreen|MyDenScreen|DialogueScreen|GeneratingScreen|StoryCoverScreen)\.vue
tv-html/src/components/.*\.(vue|ts)
tv-html/src/stores/.*\.ts
tv-html/src/utils/.*\.ts
tv-html/src/i18n/locales/(zh|en)\.ts
server-v7/src/routes/(story|dialogue)\.js
server-v7/src/services/.*\.js
server-v7/src/prompts/.*
coordination/markers/WO-3\.19/.*
```

---

## §execution

### Step 1: 取证(必须,V4 Pro 自己判断后改)

```bash
mkdir -p /opt/wonderbear/coordination/markers/WO-3.19

# 1A: 全 grep Luna 命中(分类:mock vs production)
{
  echo "===== Luna grep 全扫(分类前)====="
  echo
  echo "--- production 命中(应清理):"
  grep -rn 'Luna' tv-html/src \
    --include='*.ts' --include='*.vue' --include='*.json' 2>/dev/null \
    | grep -v '\.backup' \
    | grep -v '/utils/demoStory' \
    | grep -v '/utils/.*demo' \
    | grep -v 'test\.' \
    | grep -v '__tests__' \
    | grep -v 'mock' \
    | grep -v 'fixture'
  echo
  echo "--- mock/demo/test 命中(应保留为 Luna 还是改 Dora):"
  grep -rn 'Luna' tv-html/src \
    --include='*.ts' --include='*.vue' --include='*.json' 2>/dev/null \
    | grep -E '/utils/demoStory|/utils/.*demo|test\.|__tests__|mock|fixture'
  echo
  echo "--- server-v7 命中(prompt 模板):"
  grep -rn 'Luna' server-v7/src --include='*.js' 2>/dev/null \
    | grep -v node_modules
} > /opt/wonderbear/coordination/markers/WO-3.19/.luna-survey.txt

# 1B: 主角变量名取证
{
  echo "===== 主角变量名取证 ====="
  echo
  echo "--- protagonist / mainChar / hero / childName 全引用:"
  grep -rn 'protagonist\|mainChar\|childName\|hero\b' tv-html/src \
    --include='*.ts' --include='*.vue' 2>/dev/null \
    | grep -v node_modules
  echo
  echo "--- server-v7 同样:"
  grep -rn 'protagonist\|mainChar\|childName\|hero\b' server-v7/src \
    --include='*.js' 2>/dev/null \
    | grep -v node_modules
  echo
  echo "--- prompt 模板里 {childName} 是否变量化:"
  grep -rn '{childName}\|${childName}' server-v7/src 2>/dev/null \
    | grep -v node_modules
} > /opt/wonderbear/coordination/markers/WO-3.19/.protagonist-survey.txt

# 1C: 用户口头主角提取链路
{
  echo "===== 用户口头主角提取链路 ====="
  echo
  echo "--- ASR 转录 + 主角识别相关:"
  grep -rn 'extractProtagonist\|parseChild\|userInput.*name\|主角.*提取' \
    tv-html/src server-v7/src 2>/dev/null \
    | grep -v node_modules | head -20
} > /opt/wonderbear/coordination/markers/WO-3.19/.extraction-survey.txt
```

### Step 2: V4 Pro 自己分析取证结果,定位 3 个问题点

基于取证,V4 Pro 应该能定位:

**(P1) Mock seed 还是 Luna**
- 文件可能:`tv-html/src/utils/demoStory.ts` 或 `tv-html/src/stores/child.ts` 或 HomeScreen.vue 里的初始 child object
- 改成 Dora

**(P2) Prompt 模板硬编码了 Luna 而不是用变量**
- 文件可能:`server-v7/src/routes/story.js` 或 `server-v7/src/prompts/*.js`
- 找到类似 `prompt = "Generate a story about Luna..."` 改成 `prompt = "Generate a story about ${childName}..."`
- 确保 childName 来源遵循优先级链(口头 > My Den > "Dora")

**(P3) 用户口头主角名提取没接入 prompt**
- 这是真 bug 核心
- 链路应该是:对话历史 → LLM 识别用户提到的主角名 → 提取出来 → 传给 story 生成 prompt
- 可能 ASR 后没做提取,或提取了没传

### Step 3: 修复(按取证结果)

V4 Pro 根据取证写完整 fix。**不打扰 Kristy** — 假设 verify 通过 + 浏览器实测时跑一次就能验收。

修复关键点:
1. **mock seed Luna→Dora**(verify-lib 的 check_no_luna_regression 兜底)
2. **prompt 变量化:** 所有 hardcode "Luna" 替换为 `${childName}` 或 `{{childName}}`
3. **优先级链路:** 在 story 生成入口处实现:

```javascript
// 伪代码
const childName = (
  extractedFromConversation(history) ||      // 优先级 1: 用户口头
  await getChildFromMyDen(deviceId) ||        // 优先级 2: My Den
  'Dora'                                       // 优先级 3: 默认
);
```

4. **conversation extraction 实现:**
   - 简单做法:在 LLM 对话 prompt 加指令,让模型在某个 turn 末识别孩子提到的主角名,返回到 JSON `extracted_protagonist` 字段
   - 复杂做法:对话结束后跑一次额外 LLM 调用专门提取(成本高,不做)
   - **WO-3.19 走简单做法**

### Step 4: 落地 marker

```bash
touch /opt/wonderbear/coordination/markers/WO-3.19/.fix-applied
```

---

## §verify

```bash
bash /opt/wonderbear/workorders/WO-3.19-verify.sh
```

---

## §OUT-OF-SCOPE

1. ❌ **不引入新的 conversation extraction 服务**(简单做法,加到现有 LLM prompt)
2. ❌ **不重新设计 Child 表 schema**(用现有的)
3. ❌ **不动 ASR 配置**
4. ❌ **不重新设计草稿表**(WO-3.18 范围)
5. ❌ **不修 5 项产品反馈中其他 4 项**(WO-3.18 范围)

---

## §risk

### 🔴 Risk 1: 取证发现链路比预期复杂

**缓解:** Step 1 取证报告是必交付物,V4 Pro 必须先取证再改。如取证发现需要改 5+ 个文件,V4 Pro 可在报告里建议「拆 WO-3.19.1」继续修。

### 🔴 Risk 2: prompt 变量化导致 LLM 输出格式漂移

**缓解:**
- 测试:V4 Pro 完成后跑一次端到端故事生成(用 curl 调 server-v7 测试 endpoint),确认仍返回 12 页 + 故事主角是传入的 childName
- 失败立即回滚 prompt 改动(只改 prompt 不改其他)

### 🔴 Risk 3: WO-3.18 与 WO-3.19 都改 DialogueScreen

**缓解:** WO-3.19 的 conversation extraction 实现优先放在 **server-v7** 端(LLM prompt 加指令),**最少 / 不动 DialogueScreen.vue**。这样 WO-3.19 派单时如果 WO-3.18 还在跑,不冲突。

---

## §deliverables

`coordination/done/WO-3.19-report.md` 必须包含:

1. **Luna 取证清单:** mock vs production 各几个命中
2. **主角链路诊断:** 3 个问题点(mock seed / prompt 硬编码 / 提取缺失)各自的 root cause
3. **修复文件清单 + 行号**
4. **端到端测试结果:** 用 curl 跑一次 story 生成,贴 request + response 主角字段
5. **WO-3.18 是否冲突:** 如果 WO-3.18 还在跑,本工单可能被某些文件锁,在报告里说明

---

## §previous-wo-files-allowed-to-modify

```
tv-html/src/utils/demoStory\.ts
tv-html/src/screens/.*\.vue
server-v7/src/routes/story\.js
server-v7/src/routes/dialogue\.js
```
