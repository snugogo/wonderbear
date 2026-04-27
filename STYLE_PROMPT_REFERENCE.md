# WonderBear 视觉风格 DNA

> **⚠️ 2026-04-27 update — v1.3 已回滚**
>
> v1.3(Carson Ellis 4212 字 WONDERBEAR_MODERN_GOUACHE)经 4 次真实引擎 A/B 对照实验
> ($3.72 总成本)证明导致**风格混乱 + 跨页一致性退化**。已回滚到 v1.0/v1.x 旧版
> "vibrant saturated + Miyazaki-inspired + clear outlines"。
>
> **当前 production STYLE 见 §三 v1.4**。
> **完整代码 + 测试流程见 `server-v7/docs/spec/IMAGE_PIPELINE_PLAYBOOK.md`**。
> **回滚证据:`/debug/story/cmog60h1m0001xss835absxpu`**(浏览器验收通过)

**版本**:v1.4(Rollback to vibrant saturated + Miyazaki-inspired,2026-04-27 锁定)
**位置**:仓库根目录 `STYLE_PROMPT_REFERENCE.md`
**适用对象**:所有图像生成任务(server-v7 / 本地 PY 工具 / 任何外部生成)
**v1.4 锁定方式**:Kristy 基于 4 次真实引擎单变量对照实验(Phase A / kill-switch / STYLE rollback / cover-anchored)收敛
**v1.3 失败教训**:见 §六 教训 39-42

---

## 一、风格定义

### 1.1 风格名
**`WonderBear Modern Gouache`**(WonderBear 当代水粉风)

### 1.2 5 大视觉特征

1. **色块刷感**:背景由可见笔触色块拼成,不是平涂渲染
2. **当代欧美感**:西方面孔、西方场景、当代亲切风(非日系动漫,非古典英式)
3. **角色精致可爱**:主角五官有神、表情生动、可爱讨喜(童书命脉)
4. **暖冷强对比**:金色阳光 vs 冷色阴影,但物体保留固有色(树绿天蓝)
5. **无墨线 + 无 wash**:形状靠颜色边界,不靠黑色描边或平滑水洗

### 1.3 参考画家(关键锚点)
- **Carson Ellis**(Wildwood / Du Iz Tak?)— 主参考,当代美式插画 + 色块感 + 角色精细
- **Oliver Jeffers**(《我们都是一家人》)— 现代极简 + 笔触可见 + 角色可爱
- **Jon Klassen**(《我要把帽子找回来》)— 哑光色块 + 现代审美

**为什么选这 3 位**:
- 三位都是 21 世纪当代国际童书获奖作家
- 风格本身就是"色块感 + 角色精致"的平衡
- 解决了"色块派画家(Eric Carle)→ 角色丑" vs "精致派(Beatrix Potter)→ 笔触消失"的二元对立

### 1.4 不要做的(明确反向)
- ❌ 日系动漫 / 大眼萌系审美(教训 32 + 37)
- ❌ Sumi-e 水墨画风(会加黑色墨线)(教训 30)
- ❌ Maurice Sendak / Eric Carle 反精致路线(角色画丑)(教训 36)
- ❌ Beatrix Potter / Jan Brett 古典英式(过于古典 + 偏 wash)(教训 38)
- ❌ 平滑水彩 wash(会消除笔刷感)
- ❌ 直接用"NO Asian / ethnicity"反向种族词(触发 Google 审核)(教训 33)

---

## 二、可接受的工程妥协

### 2.1 白边问题
- 实测多数无白边,少数有小幅白边
- **不追求 100% 修复**,理由:
  - TV overscan 硬件吃边 3-5%
  - H5 全屏 padding 自然吸收
  - 投影仪边缘衰减
  - 绘本本来就有"画框感"
- **production 接受现状**,不加后处理代码

### 2.2 风格漂移
- 跨场景跑同一 STYLE_SUFFIX,大部分情况一致
- 个别复杂场景(多角色 + 强动作)可能略漂移
- **接受 90% 一致性**作为 production 标准

### 2.3 主角精致度
- 当代风格 = 主角精致 + 背景粗笔
- 这种"前后景画法对比"是当代童书的特征,不是 bug
- 不强求 100% 精致或 100% 粗朴,接受这种"分层画法"

---

## 三、固化的 STYLE_SUFFIX — v1.4 当前 production(2026-04-27 锁定)

**配置位置**:`server-v7/src/utils/storyPrompt.js` `STYLE_SUFFIXES` 字典(3 个变体)
**调用方式**:`getStyleSuffix('default')` (server-v7 内部),不需要在 prompt 里手贴

### 3.1 Default(默认 — 12 页生产路径都用这个)

```
vibrant saturated colors, bright cheerful children's book illustration,
clean crisp watercolor style, vivid warm palette, luminous glowing colors,
high contrast, professional storybook art, projection-display optimized,
Miyazaki-inspired color richness, clear outlines
```

### 3.2 Screen HD(高清屏适配)

```
vibrant saturated colors, bright storybook illustration, sharp detail,
rich color depth, HD screen optimized, professional children's book art,
clean digital illustration
```

### 3.3 Print(印刷版)

```
soft watercolor illustration, gentle pastel tones, fine brushwork detail,
printable color range, warm natural palette, children's book print quality
```

### 3.4 v1.4 设计原则(教训 39 + 41 + 42)

- **轻量化**:每个 SUFFIX < 200 字,留权重给场景描述
- **不强调作家**:Miyazaki 是色彩描述锚点(不是技法绑定),不深挖 Carson Ellis / Oliver Jeffers / Jon Klassen 这种"画家+笔触+材质"重 prompt
- **跨页一致**:配合 storyJob `cover-anchored ref`(P_n→P_1,不漂移),12 页风格自然统一
- **测试入口**:`tools/run_dora_test_mock.mjs --real` 一次性完成 4 层验证(详见 PLAYBOOK)

### 3.5 ⛔ v1.3 历史版(已废弃,**仅作教训对照,不要复用**)

v1.3 是 4212 字超长 prompt,锚定 Carson Ellis / Oliver Jeffers / Jon Klassen + 笔触 + 颜料 + 纸张材质 + reverse anchors。实测把生成模型(Nano Banana Pro / Gemini 3)推向风格混乱。完整内容见 git history `tag v1.3-deprecated` 或 commit `3448b32^`。

---

## 四、使用模板(给开发者 / 协作 AI)

### 4.1 完整 prompt 结构

```
[场景描述部分]
A 5-year-old girl named Dora with long brown curly hair,
wearing a yellow skirt and white sleeveless top,
sitting by a window looking up at a small white cloud crying in the sky,
warm cottage interior,

[空一行,然后贴 STYLE_SUFFIX 整段]
art style: contemporary children's book illustration in the tradition of Carson Ellis...
```

### 4.2 场景描述部分的写作纪律

- **限制在 50-100 词**(太长会稀释 STYLE 部分权重)
- **只描述人物、物体、动作、环境** — 不描述风格(风格交给 STYLE_SUFFIX)
- **不要写 "in watercolor style" 这类**(会跟 STYLE_SUFFIX 冲突)
- **保持中性描述**:`a child / a bear / a cloud`,**不要加形容词**(`beautiful / cute / amazing` 会被 AI 自由发挥)

### 4.3 角色描述纪律(关键 — 防止种族审核 + 文化漂移)

❌ **禁止使用的词**:
- `Asian / Japanese / Chinese / Black / African / White / Caucasian`(直接说种族 → Google 审核拒绝)
- `ethnicity / racial`(同上)
- `big bright eyes` / `kawaii` / `cute anime` / `chibi`(日系审美词)

✅ **应该使用的词**:
- 发色:`brown / blond / black / red / curly / wavy / pigtails`
- 体型:`small / tall / plump / thin`
- 服装:`red sweater / yellow dress / blue overalls`
- 表情:`smiling / thoughtful / surprised / curious`

### 4.4 错误示例

```
❌ A beautiful watercolor scene of a cute little Asian girl named Dora 
   with big bright eyes, sitting in a Japanese style room...
```
问题:Asian + big bright eyes 会触发 Google 审核 + AI 偏向日系动漫。

```
✅ A 5-year-old girl named Dora with long brown curly hair,
   wearing a yellow skirt and white sleeveless top,
   sitting by a window looking up at a small white cloud,
   warm cottage interior,
```
正确:中性外貌描述 + 西方场景元素 + 让 STYLE_SUFFIX 处理画风。

---

## 五、版本历史与迭代教训

### v1.0(2026-04-26 凌晨 4 点) — Vibrant Gouache 日系版
- **基线参考**:Theo 雨天图反推
- **画家锚定**:Studio Ghibli Kazuo Oga + Iwasaki Chihiro
- **失败原因**:跨场景测试发现"日系" STYLE 把所有主角文化感都带成日本娃娃,西方角色出不来

### v1.1 失败方向(2026-04-26 凌晨 5 点) — 反种族关键词版
- 试图用 `NO Asian, NO Japanese, ethnicity neutral` 去日系
- **失败原因**:Google 内容审核拒绝(种族保护机制触发,即便是反向用词)

### v1.2 失败方向 — 古典英式版
- **画家锚定**:Helen Oxenbury / Garth Williams / Beatrix Potter
- **结果**:角色画工提升,但风格偏 1990s 古典,不够现代

### v1.3(2026-04-26 凌晨 5 点) ❌ 已回滚
- **画家锚定**:Carson Ellis / Oliver Jeffers / Jon Klassen(当代国际童书获奖派)
- **prompt 长度**:4212 字(WONDERBEAR_MODERN_GOUACHE 单常量)
- **回滚原因**:见 §六 教训 39。在 4 次真实引擎对照里(2026-04-27)主体 Dora 故事画面**风格混乱 + 跨 12 页角色一致性退化**,不及 v1.0 旧版基线。
- **测试场景**:Mia 上学(2026-04-26 静态测试,过) → Dora 故事(2026-04-27 12 页动态测试,败)
- **结论**:静态单图测试 ≠ 12 页动态生成测试,**v1.3 在动态场景失效**

### v1.4 final(2026-04-27 晚) ⭐ 当前锁定 — Rollback to vibrant + Miyazaki
- **路线**:回滚到 v1.0/v1.x 基线("vibrant saturated + Miyazaki-inspired + clear outlines"),不强调画家+笔触
- **prompt 长度**:default 9 行 ~80 字(vs v1.3 的 4212 字,**减压 50×**)
- **配套**:storyJob 改 cover-anchored ref(P_n→P_1),不漂移
- **测试场景**:Dora "不下雨的云" 12 页动态生成 + 4 层验证
- **验证 storyId**:`/debug/story/cmog60h1m0001xss835absxpu`(2026-04-27 Kristy 浏览器验收"好了")
- **总成本**:$3.72(4 次真实跑)+ Layer 1-4 全过(Layer 4 仅 FAL 平台预设 1.851 与画质无关)
- **流程文档**:`server-v7/docs/spec/IMAGE_PIPELINE_PLAYBOOK.md`(完整故障排查 + ENV 开关)

---

## 六、迭代教训(产品级)

完整教训库见 `WonderBear_待办清单_v1.7_2026-04-26.md`,本节列出风格迭代专属教训:

### 教训 25 — 产品风格判断必须基于真实视觉对比
错误:听到"童书感"→ 关键词联想 Sendak / Beatrix Potter
正确:看 1 张满意图 → 视觉解构 → 反推 prompt → 真实生成对照 → 选定方向

### 教训 27 — image AI 的默认风格偏现代精修,逼"粗犷手绘"需要多重反向关键词压制

### 教训 30 — 删风格类比关键词时要警惕"画法绑定"(sumi-e = 必带墨线)

### 教训 32 — 风格类比关键词必须"剥离文化标签",只保留技法描述
错误:用 `Japanese gouache / Studio Ghibli` 这种**绑定文化的画派名**
AI 不仅学画风,还把人物文化感也带过来

### 教训 33 — 用"NO 种族 / NO 文化"反向词试图去文化化,会触发审核拒绝
即使是反向用词,审核器也会触发(它不区分肯定/否定,只识别敏感词)
正确做法:**正向锚定西方场景元素**,而不是反向排斥日系

### 教训 35 — 让 AI 调"色调"时必须明确区分"光照色调" vs "物体固有色"
错误:笼统说 "warm tones dominant" → AI 把所有物体都改暖色 → 树变橙草变黄
正确:**两层明确分离**
- 物体固有色(树绿、天蓝、砖红)→ 必须自然真实
- 光照氛围(金色阳光、暖色阴影)→ 只调全局光,不改物体本色

### 教训 36 — 画家锚定关键词不仅传递"画风",还传递"画工质量基线"
错误:为了去日系,选 Eric Carle / Brian Wildsmith / Ezra Jack Keats(故意粗朴的中世纪现代主义画家)
AI 学到的不是"欧美童书",而是"故意画粗朴 = 欧美童书"
正确:选**画风对、画工精细**的当代画家(Carson Ellis / Oliver Jeffers / Jon Klassen)

### 教训 37 — 角色描述词 "big bright eyes" 会偏向日系卡通审美,要慎用
"大眼睛"这个词在 AI 训练数据里跟日系动漫强绑定
改用欧美童书惯用的"expressive eyes / spirited expression"

### 教训 38 — 画家锚定的"画法基因"会覆盖 prompt 里的笔触描述
错误:加 "bold broad brush strokes" 但选 Tomi Ungerer / Beatrix Potter(watercolor wash 大师)
AI 学画家基因优先,prompt 里的 "broad strokes" 被忽视
正确:**画家锚定 + 画法描述必须同向**
- 要粗笔触 → 选 Carson Ellis / Mary Blair(色块派 + 当代精致)
- 不能"色块派画家但要精致可爱" — 这种本质冲突会让 AI 摇摆

### 教训 39(2026-04-27)— 静态单图测试 ≠ 12 页动态测试,STYLE 锁定必须经动态验证
v1.3 Carson Ellis 在 Mia 上学 + Dora 看云**单张静态测试**全过,被 lock 为 production。
然而真实生成 Dora "不下雨的云" 12 页时,跨页角色发型/服装/比例**累积漂移**,
画风混乱(STYLE 4212 字过长稀释场景描述权重)。
**正确做法**:STYLE 锁定**必须**跑一次 12 页 fixture(`run_dora_test_mock.mjs --real`)
浏览器肉眼验跨页一致性,数据层 4 层验证全过才算 lock。

### 教训 40(2026-04-27)— 强提示词不一定优于弱提示词,prompt 长度有最优区间
v1.0 旧版 STYLE_SUFFIX 默认变体仅 ~80 字 → 跨场景一致性好。
v1.3 加压到 4212 字(放进画家+笔触+颜料+纸张+reverse anchors)→ 跨页混乱。
**prompt 长度 sweet spot 实测 50-200 字**,过长会:
1. 稀释场景描述权重(LLM/IMG 模型 attention 散开)
2. 增加 reverse anchors 跟正向描述冲突的概率
3. 增加 Google 审核命中风险
**单变量隔离实证此教训**:`/debug/story/cmog5lgtb0001i3z7sx5jtjw8`(STYLE 回滚后即改善)

### 教训 41(2026-04-27)— 跨页一致性靠 ref strategy,不靠 prompt
原假设:"链式 ref(P_n→P_{n-1})让相邻页连贯"。
实证打脸:**链式 ref 累积漂移**,12 页跑下来主角发型/服装走偏。
正确:**cover-anchored**(P_n→P_1)— 全部内页都 ref Cover,Cover 一锚,12 页都锚。
代码已固化(`storyJob.js` 默认 cover-anchored,`USE_CHAINED_REF=1` 留 ENV 兜底)。
**对照实证**:`/debug/story/cmog5lgtb...`(链式)vs `/debug/story/cmog60h1m...`(cover-anchored)。

### 教训 42(2026-04-27)— 任何 STYLE / orchestrator 改动都要走"4 步单变量对照流程"

**4 步流程**(已固化进 IMAGE_PIPELINE_PLAYBOOK.md §7):

```
Step 1.  跑 mock 验结构层(0 成本)
         node tools/run_dora_test_mock.mjs
         全过 → Layer 1 没坏,可进 Step 2

Step 2.  跑 --real 与 Kai 标杆对照(成本 ~$0.93)
         node tools/run_dora_test_mock.mjs --real
         浏览器看 /debug/story/<新>  vs  /debug/story/cmocuudx700012u0mgkjaycho

Step 3.  单变量隔离(每跑一次只改一处)
         风格嫌疑 → cp storyPrompt.js.backup 临时回滚
         ref 嫌疑  → set USE_CHAINED_REF=1 / 0
         prompt 嫌疑 → 在 storyJob.js 加临时 kill switch
         每次跑一次 --real --baseline,Kristy 浏览器拍

Step 4.  找到凶手 → commit + 写 coordination/factory-to-claude/<日期>.md 留痕
         最后更新 STYLE_PROMPT_REFERENCE.md + IMAGE_PIPELINE_PLAYBOOK.md
```

**禁止**:跳过 Step 2,直接看模型 demo 图就 lock production STYLE。教训 39 的代价是 $3.72 + 一夜调试。

---

## 七、未来升级触发条件

只有满足以下任一条件,才升级 v1.4:

1. **跑 100 本绘本后,Kristy 觉得视觉疲劳** → 评估子风格分支(如夏季暖色版 / 冬季冷色版)
2. **海外市场反馈风格不接受** → 评估目标市场偏好
3. **Nano Banana 模型升级,出图风格改变** → 重新校准
4. **新协作画家 / 真人画家加入,视觉资产人工生产** → 调整 AI 风格匹配真人版

**不允许的升级原因**:
- ❌ "我突然觉得另一种风格更好"(感性,非数据驱动)
- ❌ "看到别家产品风格不错"(竞品焦虑)
- ❌ "凌晨 4 点想出来的新方向"(疲劳决策)

风格 DNA 是品牌资产,**稳定性比新颖性重要**。

---

## 八、Production 实施细节(v1.4 当前状态)

### 8.1 server-v7 集成位置
路径:`src/utils/storyPrompt.js`(commit `3448b32` 起 Carson Ellis WONDERBEAR_MODERN_GOUACHE 已删除)

```javascript
// v7.1 style suffixes — v1.4 (2026-04-27 rollback)
export const STYLE_SUFFIXES = {
  default:
    'vibrant saturated colors, bright cheerful children\'s book illustration, ' +
    'clean crisp watercolor style, vivid warm palette, luminous glowing colors, ' +
    'high contrast, professional storybook art, projection-display optimized, ' +
    'Miyazaki-inspired color richness, clear outlines',
  screen_hd:
    'vibrant saturated colors, bright storybook illustration, sharp detail, ' +
    'rich color depth, HD screen optimized, professional children\'s book art, ' +
    'clean digital illustration',
  print:
    'soft watercolor illustration, gentle pastel tones, fine brushwork detail, ' +
    'printable color range, warm natural palette, children\'s book print quality',
};

export function getStyleSuffix(variant = 'default', envOverride = null) {
  if (envOverride && envOverride.length > 0) return envOverride;
  return STYLE_SUFFIXES[variant] || STYLE_SUFFIXES.default;
}
```

`storyJob.runOne` 调用 `getStyleSuffix('default')`,production 12 页都用 default 变体。

### 8.2 路由策略(2026-04-27 锁定,实证版)

**双引擎,cover-anchored**:
- **Cover (P1)**: Nano Banana Pro 2K (gemini-3-pro-image-preview) → OpenAI gpt-image-1.5 → FAL flux/dev
- **Interior (P2-P12)**: FAL flux-pro/kontext img2img → Nano Banana Flash → OpenAI
- **Reference**: ALL P2-P12 ref **Cover URL**(不漂移,教训 41)
- **Mock 模式**: USE_MOCK_AI=true 全部走 mock(LLM + image + TTS),0 成本验结构层

**详细成本表 + ENV 开关 + 故障排查**:见 `server-v7/docs/spec/IMAGE_PIPELINE_PLAYBOOK.md`

### 8.3 测试入口(2026-04-27 新增)

```bash
cd /opt/wonderbear/server-v7
node tools/run_dora_test_mock.mjs              # mock,0 成本
node tools/run_dora_test_mock.mjs --real       # 真实引擎,~$0.93,~5 分钟
node tools/run_dora_test_mock.mjs --real --baseline   # A/B 隔离用
```

测试 runner 自带 4 层验证(DB / R2 image / R2 audio / 16:9 像素)+ post-hoc 成本统计。

### 8.4 跨服务器架构(规划)
- 美国/欧洲服务器 → Nano Banana(同 STYLE)
- 中国/东南亚服务器 → Qwen Image(同 STYLE,已验证可用)
- 双服务器架构保证品牌视觉一致性

---

**By: 创始人 Kristy + 协作 AI(Claude + Factory)**
**v1.4 final:2026-04-27 晚,4 次单变量对照实验 ($3.72) 后回滚锁定**
**v1.3 final:2026-04-26 凌晨 5 点,9 轮静态迭代锁定 → 实证不行已废弃 (见 §六 教训 39)**
