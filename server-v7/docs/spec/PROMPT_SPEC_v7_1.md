# 10. Prompt 工程详细规范 · v7.1
> **v7.1 变更说明**：根据实际出图对比，修正风格后缀方向。
> 原版（v7.0）过度追求水彩纸张纹理感，导致颜色偏暖黄/发灰，
> 在投影仪场景（尤其低亮度 100-200 流明）上显示效果差。
> v7.1 改为「投影仪优化」方向：饱和鲜艳、高对比、干净笔触。
>
> 面向：后端开发、AI 工程师、创始人
> 本文档描述：孩子对话 → Gemini LLM → 生图 Prompt → OpenAI/Gemini/FAL
> 整条链路的 Prompt 构造、过滤、风格控制完整规范。

---

## 一、为什么这份文档必要

### 1.1 整条 Prompt 链路

```
孩子语音
  ↓ ASR（多语言，含波兰语/罗马尼亚语）
文本对话
  ↓
[Gemini 2.0 Flash 故事 LLM]
  系统 Prompt：儿童故事作家 + 12 页结构 + 年龄字数控制
  + 对话文本
  ↓
输出结构化 JSON：
  - title, titleEn
  - characterDescription（角色一致性锚点）
  - 12 页 × { text(多语言), imagePrompt(英文), emotion, beat }
  ↓
服务端 imagePromptSanitizer（安全清洗 + 风格后缀追加）
  ↓
[OpenAI gpt-image-1.5 / Gemini Imagen 3 / FAL Flux Kontext]
  ↓
12 张彩色绘本插图（1536×1024，3:2）
```

### 1.2 三个关键节点

| 节点 | 谁控制 | 风险 |
|---|---|---|
| **Gemini 故事 LLM** | 我们写系统 Prompt，LLM 生成 imagePrompt | 输出危险词组合 → 下游生图全挂 |
| **imagePromptSanitizer** | 我们写词表和规则 | 清洗过度 → 图质量差；清洗不足 → 账号被 flag |
| **OpenAI / Imagen / FAL** | 各家审核系统 | OpenAI 最严，`child+bedroom+night` 组合直接拒绝 |

**关键原则**：
- **Gemini LLM 是上游，在这里就规避高危词** → 根本性解决
- **Sanitizer 是最后防线** → 兜底清洗
- **风格后缀只在 Sanitizer 层追加**，LLM 不负责风格词 → 便于 OEM 切换和 A/B 测试

---

## 二、Gemini 故事 LLM 系统 Prompt

### 2.1 完整系统 Prompt

```
You are a professional children's book writer specialized in creating
magical illustrated storybooks for children aged 3-8.

Based on the dialogue provided, create a 12-page illustrated story
adapted to the child's age group and emotional arc.

OUTPUT FORMAT: Respond with ONLY a valid JSON object. No markdown,
no explanation, no code fences.

{
  "title": "Story title in primary language",
  "titleEn": "Story title in English",
  "characterDescription": "Main character visual description in English,
    20-30 words, specific physical details for image consistency.
    Example: 'A cheerful 5-year-old girl with short wavy chestnut hair,
    rosy cheeks, yellow polka-dot dress, red shoes'",
  "pages": [
    {
      "pageNum": 1,
      "text": {
        "zh": "...", "en": "...", "pl": "...", "ro": "..."
      },
      "imagePrompt": "Scene description in English, max 55 words.
        Must follow IMAGE PROMPT RULES below.",
      "emotion": "happy|wonder|excited|cozy|adventurous|peaceful",
      "beat": "One sentence story beat"
    }
    // ... 12 pages total
  ]
}

STORY STRUCTURE RULES:
- Pages 1-3: Establish character and world, introduce a gentle problem
- Pages 4-8: Adventure or journey, 2-3 small challenges
- Pages 9-11: Resolution, character grows or learns something
- Page 12: Warm, satisfying ending. Child feels safe and happy.
- Never use villains, violence, or frightening imagery
- Age 3-4: Simple vocabulary, short sentences, repetition is good
- Age 5-6: Can handle mild peril, 2-3 named characters
- Age 7-8: Can have light mystery, moral choices, richer vocabulary

TEXT LENGTH PER PAGE:
- zh/en: Age 3-4 → 30-45 chars/words; Age 5-6 → 45-70; Age 7-8 → 70-100
- pl/ro: Match en length, natural grammar always wins over word count

IMAGE PROMPT RULES — CRITICAL, FOLLOW EXACTLY:
1. Always start with: "[characterDescription], "
2. Describe ONE clear scene. No split panels, no collage.
3. Outdoor or warmly lit indoor scenes preferred.
4. DO NOT combine: child + bedroom + night/dark (OpenAI will reject)
5. DO NOT use: naked, bare, undressed, sleeping in bed, whispering alone
6. Evening indoor scenes → change to "cozy afternoon" or "golden sunset room"
7. Bedroom scenes → change to "child's reading nook" or "playroom corner"
8. Max 55 words per imagePrompt. Be specific about objects and colors.
9. Do NOT include style words — style suffix is added by server.
10. Example good prompt:
    "A cheerful girl with chestnut hair in yellow dress, sitting under
    a big oak tree in a sunny meadow, her small fox friend beside her,
    colorful wildflowers all around, gentle breeze, warm afternoon light"
```

### 2.2 Prompt 调用参数

```javascript
{
  model: "gemini-2.0-flash",
  temperature: 0.85,       // 故事需要创意，但不能太随机
  max_output_tokens: 4096,
  response_mime_type: "application/json"  // 强制 JSON 输出，减少解析错误
}
```

---

## 三、风格后缀系统（v7.1 核心修正）

### 3.1 背景：为什么要修正

**v7.0 的问题**：
原版风格后缀过度追求水彩纸张的物理质感：
```
// ❌ v7.0 旧版（不要用这个）
"soft watercolor illustration, aged paper texture, vintage wash,
muted warm tones, watercolor paper grain, delicate ink lines"
```
这类词汇会让 AI 生成：
- 颜色偏暖黄/米色/发灰
- 整体低对比、发旧发暗
- 在 150-300 流明投影仪上显示效果极差（本来暗的投影再加上暗色图 = 看不清楚）

**实际对比**（两张图直接对比结论）：
- 网页手动输入的提示词 → 颜色鲜艳，黄裙、红鞋、橙狐狸跳色，适合投影
- 服务器批量提示词 → 颜色发灰，纸感过重，不适合投影

### 3.2 v7.1 新版风格后缀（正式使用）

```javascript
// ✅ v7.1 新版：投影仪优化风格
const STYLE_SUFFIX_PROJECTOR = 
  "vibrant saturated colors, bright cheerful children's book illustration, " +
  "clean crisp watercolor style, vivid warm palette, " +
  "luminous glowing colors, high contrast, " +
  "professional storybook art, projection-display optimized, " +
  "Miyazaki-inspired color richness, clear outlines";
```

**每个词的用意**：

| 关键词 | 作用 |
|---|---|
| `vibrant saturated colors` | 主控饱和度，防止颜色发灰 |
| `bright cheerful children's book illustration` | 定调为商业儿童绘本风，不是艺术装饰风 |
| `clean crisp watercolor style` | 保留水彩感，但强调干净而非纸纹 |
| `vivid warm palette` | 暖色为主，儿童喜欢的糖果色系 |
| `luminous glowing colors` | 颜色有光感，在投影上更亮眼 |
| `high contrast` | 确保投影仪低亮度下仍能看清主体 |
| `professional storybook art` | 商业质感，避免 AI 过度"艺术化" |
| `projection-display optimized` | 提示模型考虑屏幕显示而非印刷 |
| `Miyazaki-inspired color richness` | 参考宫崎骏的色彩丰富感（非印象派的暗淡） |
| `clear outlines` | 主体轮廓清晰，投影低分辨率下不模糊 |

### 3.3 明确禁止的风格词（加了会变差）

```javascript
// ❌ 这些词会让颜色变暗/发旧，投影效果差
const FORBIDDEN_STYLE_WORDS = [
  "aged paper", "paper texture", "paper grain", "vintage wash",
  "muted tones", "muted palette", "soft muted", "desaturated",
  "antique", "faded", "worn", "painterly texture", "rough texture",
  "ink wash", "sepia", "earth tones", "monochromatic"
];
```

Sanitizer 扫到这些词（如果 LLM 误写进 imagePrompt）直接删除。

### 3.4 OEM 风格切换（为未来扩展预留）

```javascript
const STYLE_VARIANTS = {
  default:     STYLE_SUFFIX_PROJECTOR,              // 投影仪默认（WonderBear GP15）
  screen_hd:   "vibrant saturated colors, bright storybook illustration, " +
               "sharp detail, rich color depth, HD screen optimized, " +
               "professional children's book art, clean digital illustration",
  print:       "soft watercolor illustration, gentle pastel tones, " +
               "fine brushwork detail, printable color range, " +
               "warm natural palette, children's book print quality",
  nordic:      "Scandinavian minimalist illustration, soft pastels, " +
               "clean simple shapes, warm light, cozy hygge aesthetic",
  china:       "Chinese watercolor style, vibrant traditional colors, " +
               "ink outline, warm red-gold palette, festive storybook feel"
};
```

当前 WonderBear GP15 投影仪产品，固定使用 `default`。
OEM 贴牌方可在 Admin 后台选择其他风格。

### 3.5 环境变量配置

```bash
# .env 生产配置
IMAGE_STYLE_SUFFIX="vibrant saturated colors, bright cheerful children's book illustration, clean crisp watercolor style, vivid warm palette, luminous glowing colors, high contrast, professional storybook art, projection-display optimized, Miyazaki-inspired color richness, clear outlines"

IMAGE_PAGE1_COMPOSITION="centered composition, character fills lower center third, generous sky above, colorful ground below, horizontal landscape orientation, wide 16:9 cinematic format"
```

`IMAGE_STYLE_SUFFIX` 存环境变量，不硬编码，便于热更新不重启服务。

---

## 四、imagePromptSanitizer 三路清洗规则

### 4.1 架构概述

```
输入: LLM 生成的 imagePrompt（55 词以内，英文）
  ↓
步骤 1: 基础清洗（三路通用）
  ↓
步骤 2: 危险词替换（三路通用）
  ↓
步骤 3: 危险组合检测（仅 OpenAI 通道）
  ↓
步骤 4: 追加 characterDescription 前缀
  ↓
步骤 5: 追加风格后缀
  ↓
输出: 完整生图 Prompt
```

### 4.2 基础清洗（三路通用）

```javascript
function basicClean(prompt) {
  return prompt
    .replace(/\n+/g, ' ')           // 去换行
    .replace(/\s{2,}/g, ' ')        // 去多余空格
    .replace(/["""]/g, '')          // 去引号（LLM 偶尔会加）
    .trim()
    .slice(0, 400);                 // 硬截断，防止超长
}
```

### 4.3 危险词替换表（三路通用）

```javascript
const SAFE_REPLACEMENTS = [
  // 场景类（OpenAI 对儿童+这些场景组合敏感）
  ["child's bedroom",    "cozy small room"],
  ["bedroom",            "cozy reading nook"],
  ["at night",           "in the evening"],
  ["dark night",         "quiet evening"],
  ["in the dark",        "in soft golden light"],
  ["sleeping",           "resting peacefully"],
  ["in bed",             "curled up on a soft cushion"],
  ["undressing",         "changing clothes"],
  ["bath",               "washing hands"],
  ["bathtub",            "garden fountain"],

  // 肢体类
  ["bare feet",          "cozy feet"],
  ["bare arms",          "outstretched arms"],
  ["naked",              ""],                      // 直接删除
  ["undressed",          ""],
  ["bare skin",          ""],

  // 关系类（防 grooming 分类器）
  ["whispering to",      "talking softly with"],
  ["alone with adult",   "with a friendly adult nearby"],
  ["secret",             "surprise"],
  ["don't tell",         ""],

  // 被错判的无害词（儿童内容里出现会误触发）
  ["pistol",             "wooden toy"],
  ["gun",                "magic wand"],
  ["knife",              "cooking spoon"],
  ["blood",              "red berries"],
  ["dead",               "sleeping"],
  ["kill",               ""],
  ["monster",            "friendly creature"],
  ["witch",              "kind old woman"],

  // v7.1 新增：旧版风格词（LLM 可能误生成，需删除）
  ["aged paper",         ""],
  ["paper texture",      ""],
  ["vintage wash",       ""],
  ["muted tones",        ""],
  ["sepia",              ""],
  ["faded colors",       ""],
];
```

### 4.4 OpenAI 专用：危险组合检测

即使每个词都替换了，某些**组合**仍会触发 OpenAI 的分类器：

```javascript
const DANGEROUS_COMBOS_OPENAI = [
  // [检测词A, 检测词B, 检测词C] — 同时出现 → 触发二次改写
  ["child",    "bed",      "night"],
  ["child",    "bed",      "evening"],
  ["girl",     "bedroom",  "alone"],
  ["boy",      "bedroom",  "alone"],
  ["child",    "undress",  ""],         // 二词组合
  ["kid",      "bath",     ""],
];

function detectDangerousCombo(prompt, combos) {
  const lower = prompt.toLowerCase();
  return combos.some(combo =>
    combo.filter(Boolean).every(word => lower.includes(word))
  );
}
```

**触发后的二次激进改写**：

```javascript
function aggressiveRewrite(prompt) {
  // 整个把室内夜晚场景改为户外白天/黄昏
  return prompt
    .replace(/bedroom|room|indoor/gi,    "sunny meadow")
    .replace(/night|evening|dark/gi,     "golden afternoon")
    .replace(/bed|pillow|blanket/gi,     "soft grass")
    .replace(/lamp|candle/gi,            "warm sunlight")
    + " outdoor scene, daytime, open landscape";
}
```

### 4.5 三路通道配置

```javascript
const CHANNEL_CONFIG = {
  openai: {
    applyBasicReplacements: true,
    checkDangerousCombos:   true,    // ← OpenAI 专属
    aggressiveRewriteOnHit: true,    // ← OpenAI 专属
    appendCharacterDesc:    true,
    appendStyleSuffix:      true,
  },
  imagen: {
    applyBasicReplacements: true,
    checkDangerousCombos:   false,
    aggressiveRewriteOnHit: false,
    appendCharacterDesc:    true,
    appendStyleSuffix:      true,
  },
  fal: {
    applyBasicReplacements: true,    // 只过滤真正的硬禁词
    checkDangerousCombos:   false,
    aggressiveRewriteOnHit: false,
    appendCharacterDesc:    true,
    appendStyleSuffix:      true,
  }
};
```

### 4.6 最终 Prompt 组装

```javascript
function buildFinalPrompt(imagePrompt, characterDesc, channel) {
  const config = CHANNEL_CONFIG[channel];
  
  let prompt = basicClean(imagePrompt);
  
  if (config.applyBasicReplacements) {
    for (const [from, to] of SAFE_REPLACEMENTS) {
      prompt = prompt.replace(new RegExp(from, 'gi'), to);
    }
  }
  
  if (config.checkDangerousCombos) {
    if (detectDangerousCombo(prompt, DANGEROUS_COMBOS_OPENAI)) {
      prompt = aggressiveRewrite(prompt);
    }
  }
  
  // 组装最终 Prompt：角色描述 + 场景 + 风格后缀
  return `${characterDesc}, ${prompt}, ${process.env.IMAGE_STYLE_SUFFIX}`;
}
```

---

## 五、完整 Prompt 流转示例

### 5.1 输入：孩子对话

```
孩子（5岁，中文）：
"有一只小女孩，她有一只小狐狸朋友，他们在草地上玩"
→ 7轮对话后，Gemini 生成 12 页故事 JSON
```

### 5.2 Gemini 输出（第1页）

```json
{
  "pageNum": 1,
  "text": {
    "zh": "在一片开满野花的大草地上，小玲和她的好朋友小狐狸相遇了。",
    "en": "In a meadow full of wildflowers, Xiao Ling met her dear friend Little Fox.",
    "pl": "Na łące pełnej dzikich kwiatów Xiao Ling spotkała swojego przyjaciela Małego Lisa.",
    "ro": "Pe o pajiște plină de flori sălbatice, Xiao Ling și-a întâlnit prietenul Micul Vulpe."
  },
  "imagePrompt": "A cheerful girl with chestnut hair in yellow polka-dot dress, standing in a sunlit meadow with a small fluffy orange fox beside her, colorful wildflowers around them, both smiling, warm afternoon",
  "emotion": "happy",
  "beat": "Characters meet in a beautiful meadow"
}
```

### 5.3 Sanitizer 处理（OpenAI 通道）

```
输入 imagePrompt:
"A cheerful girl with chestnut hair in yellow polka-dot dress,
 standing in a sunlit meadow with a small fluffy orange fox beside her,
 colorful wildflowers around them, both smiling, warm afternoon"

步骤1 基础清洗: ✅ 无需修改
步骤2 危险词替换: ✅ 无命中
步骤3 危险组合检测: ✅ 无命中
步骤4 追加角色描述: ✅ 
步骤5 追加风格后缀: ✅
```

### 5.4 最终发给 OpenAI 的 Prompt

```
A cheerful 5-year-old girl with short wavy chestnut brown hair,
rosy cheeks, yellow polka-dot dress, red shoes,
standing in a sunlit meadow with a small fluffy orange fox beside her,
colorful wildflowers around them, both smiling, warm afternoon,
vibrant saturated colors, bright cheerful children's book illustration,
clean crisp watercolor style, vivid warm palette, luminous glowing colors,
high contrast, professional storybook art, projection-display optimized,
Miyazaki-inspired color richness, clear outlines
```

**对比**（展示 v7.1 修正效果）：

| | v7.0 旧版后缀 | v7.1 新版后缀 |
|---|---|---|
| 颜色饱和度 | 偏低，发灰 | 高，跳色 |
| 投影显示效果 | 暗，看不清 | 亮，鲜艳 |
| 纸张纹理 | 强（不适合投影） | 无（适合投影） |
| 水彩感 | 有，但"旧书感" | 有，但"新书感" |

---

## 六、三路降级与 Sanitizer 联动

### 6.1 降级链

```
FAL Flux Kontext（最快最便宜，$0.04/张）
  ↓ 超时 / 失败
Gemini Imagen 3（中等，$0.04/张）
  ↓ 超时 / 失败
OpenAI gpt-image-1.5（最贵最严，$0.05/张）
  ↓ 仍失败
使用占位符图（预生成的通用场景图，对应 emotion 字段）
```

### 6.2 降级时自动切换 Sanitizer

```javascript
async function generateWithFallback(imagePrompt, charDesc, storyId, pageNum) {
  const channels = ['fal', 'imagen', 'openai'];
  
  for (const channel of channels) {
    try {
      const finalPrompt = buildFinalPrompt(imagePrompt, charDesc, channel);
      const imageUrl = await callImageAPI(channel, finalPrompt);
      await logSuccess(storyId, pageNum, channel);
      return imageUrl;
    } catch (err) {
      await logFailure(storyId, pageNum, channel, err.message);
      continue;
    }
  }
  
  // 全部失败，用 emotion 对应占位符
  return getPlaceholderImage(page.emotion);
}
```

**关键点**：降级到 OpenAI 时，Sanitizer 自动切换为最严格模式（含危险组合检测），不需要手动触发。

---

## 七、Prompt 规则版本管理

### 7.1 数据库表结构

```sql
CREATE TABLE prompt_config (
  id          SERIAL PRIMARY KEY,
  config_key  VARCHAR(100) UNIQUE NOT NULL,
  config_val  TEXT NOT NULL,
  version     INT DEFAULT 1,
  is_active   BOOLEAN DEFAULT true,
  updated_at  TIMESTAMP DEFAULT NOW(),
  updated_by  VARCHAR(50)
);

-- 关键配置项
INSERT INTO prompt_config (config_key, config_val) VALUES
  ('style_suffix_default',    '...v7.1 投影仪风格词...'),
  ('style_suffix_print',      '...印刷版风格词...'),
  ('sanitizer_replacements',  '...JSON 格式的词替换表...'),
  ('gemini_system_prompt',    '...故事 LLM 系统 Prompt...');
```

### 7.2 热更新（不重启服务）

```javascript
// 每 5 分钟从数据库重新加载一次规则
setInterval(async () => {
  const configs = await db.query('SELECT * FROM prompt_config WHERE is_active=true');
  configs.rows.forEach(row => {
    promptConfigCache[row.config_key] = row.config_val;
  });
}, 5 * 60 * 1000);
```

Admin 后台改规则 → 5 分钟内所有服务端实例自动生效，无需重启。

---

## 八、监控指标与每日报告

### 8.1 需要记录的指标

```javascript
// 每次生图记录
{
  storyId, pageNum,
  channel,          // fal/imagen/openai
  isDowngrade,      // 是否因降级才用这个通道
  replacementHits,  // 触发词替换次数
  comboDetected,    // 是否触发危险组合检测
  aggressiveRewrite,// 是否触发二次激进改写
  promptLength,     // 最终 Prompt 字符数
  costUsd,          // 本次生图费用
  latencyMs,        // 响应时间
  success           // 是否成功
}
```

### 8.2 每日报告模板

```
📊 WonderBear 图像生成日报 YYYY-MM-DD

总生成量：XXX 张（XXX 本故事）
成功率：XX%（FAL XX% / Imagen XX% / OpenAI XX%）

渠道分布：
  FAL（主力）：XX%
  Imagen（降级）：XX%
  OpenAI（降级）：XX%

安全过滤：
  词替换触发：XX 次（最常触发词：bedroom×X, night×X）
  危险组合检测：XX 次
  二次激进改写：XX 次

成本：
  本日：$XX.XX（均值 $X.XX/本）
  本月累计：$XX.XX

⚠️ 需要关注：
  [如果有异常模式，列在这里]
  [例如：今日 "bedroom+night" 组合触发率上升 → 检查 Gemini 系统 Prompt 是否漂移]
```

---

## 九、常见问题 & 坑

### 9.1 LLM 不听话，偶尔还是输出危险词

**现象**：Gemini 有时在 imagePrompt 里写 `child sleeping in bedroom at night`
**原因**：LLM temperature=0.85，偶有发挥
**解决**：Sanitizer 双保险，LLM 侧是第一道防线，Sanitizer 是最后防线，两道都有了

### 9.2 清洗后图和文字不符

**现象**：第 8 页文字写"晚上睡觉前"，但图变成了"阳光草地"
**原因**：情绪词被误清洗
**解决**：替换规则只替换**场景词**，不替换 `quiet`/`peaceful`/`cozy` 这类情绪词

### 9.3 角色每页长得不一样

**现象**：第 1 页小女孩有棕发，第 5 页变成金发
**原因**：imagePrompt 前缀的 characterDescription 没加，或每页描述不一致
**解决**：`characterDescription` 每页都从 JSON 顶层取，拼在 imagePrompt 前面，而不是让 LLM 每页重写

### 9.4 颜色还是发灰（v7.1 修正后）

**检查清单**：
1. 确认 `.env` 里 `IMAGE_STYLE_SUFFIX` 已更新为 v7.1 版本
2. 确认 Sanitizer 里的 `FORBIDDEN_STYLE_WORDS` 把 `muted tones` 等旧词删了
3. 确认 Gemini LLM 系统 Prompt 里没有鼓励 LLM 写 `paper texture` 类词

### 9.5 FAL 生成图有明显黑边（16:9 裁切问题）

**原因**：FAL Flux Kontext 原生 16:9，但角色被裁到边缘
**解决**：`IMAGE_PAGE1_COMPOSITION` 里已加 `character fills lower center third, generous sky above, colorful ground below`，确保这个环境变量没丢

---

## 十、给另一窗口 Claude 实现本文档的提示

```
你要实现 WonderBear 的 imagePromptSanitizer 服务。
请阅读文档 10（本文档），实现以下内容：

1. basicClean 函数
2. SAFE_REPLACEMENTS 完整词替换表
3. detectDangerousCombo 函数（仅 OpenAI 通道）
4. aggressiveRewrite 函数
5. buildFinalPrompt 函数（含三路通道差异）
6. generateWithFallback 函数（三路降级 + 自动切换 Sanitizer）
7. Prompt 规则从数据库加载 + 5 分钟热更新

注意：
- Sanitizer 不是字符串替换工具，是完整的安全审查系统
- 三个通道对应三套清洗规则
- 风格后缀在 Sanitizer 层追加，LLM 不生成风格词
- 所有规则存数据库，支持热更新

参考文档：
- 文档 2（系统架构）§8.2 三路降级链
- 文档 7（内容安全）§二 三级过滤
- 文档 9（决策日志）§4.1-4.2
```

---

**相关文档**：
- `2_系统架构说明.md` §8.2（三路降级链）
- `4_视觉素材生产规范.md`（静态素材的风格一致性）
- `7_内容安全与合规.md` §二（内容过滤三级机制）
- `9_决策变更日志.md` §4.1-4.2

---

**v7.1 · 2026-04-22 · 修正投影仪风格后缀，删除旧纸感词表**
