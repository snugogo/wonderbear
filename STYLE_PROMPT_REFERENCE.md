# WonderBear 视觉风格 DNA

**版本**:v1.3(WonderBear Modern Gouache,当代欧美童书版)
**位置**:仓库根目录 `STYLE_PROMPT_REFERENCE.md`
**适用对象**:所有图像生成任务(server-v7 / 本地 PY 工具 / 任何外部生成)
**确立日期**:2026-04-26 凌晨 5 点
**确立方式**:Kristy 基于 9 轮 Nano Banana 真实生成对比测试 + Qwen 跨模型验证

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

## 三、固化的 STYLE_SUFFIX(完整版,production 直接用)

**使用方式**:任何图片生成 prompt 末尾**直接贴这一整段**,不修改。

```
art style: contemporary children's book illustration in the tradition of Carson Ellis, Oliver Jeffers, and Jon Klassen, painted with bold visible broad brush strokes and color block technique, each stroke a clear color shape, NOT smooth digital rendering, NOT cel shading, NOT airbrushed, NOT anime style, NO outlined shapes, NO line drawings, NO black contour lines, NO pencil sketch lines, surfaces built from multiple thick brush strokes laid side by side, shapes defined by color and brushwork alone, never by drawn lines, characters are drawn with care and contemporary craftsmanship, with expressive faces, rounded soft features, charming and lovable in modern picture book tradition, each brush stroke shows tonal variation within itself, darker where paint pools and lighter where brush runs dry, visible dry brush effect with broken streaks, visible bristle marks as fine parallel lines within strokes, paint absorbing into rough watercolor paper showing fiber texture and slight bleeding edges, uneven paint coverage with thinner washes letting paper texture show through, some strokes overlapping wet-on-wet creating natural color mixing, available pigments to choose from when painting: highly vibrant saturated pure pigments at maximum intensity, brilliant cadmium reds and oranges, deep cobalt and ultramarine blues, golden cadmium yellows, emerald and viridian greens, sap greens, rich burnt sienna and raw umber browns, pure titanium white highlights, think of children's poster paint freshly squeezed from the tube, never dilute, never muted, object colors must remain naturally true to life: trees and grass should be GREEN (use sap green or emerald), sky should be BLUE (use cobalt or ultramarine), brick walls should be RED-BROWN (use burnt sienna), do NOT paint trees orange or yellow unless the scene is explicitly autumn, do NOT change the natural local color of objects to fit a warm mood, global lighting and atmosphere should feel warm and inviting: warm late afternoon or golden hour sunlight bathing the scene from one direction, sunlit surfaces glow with golden warmth, shadows are slightly warm-toned, overall mood is cozy and comforting, but the underlying object colors stay realistic and natural, high color contrast and dramatic warm-cool tension throughout, warm sunlit areas vs cooler shadow areas creating visual depth, each color region painted in pure intense pigment without muddy mixing, apply specific brush technique to every element: warm objects (skin, wood, lamps, sunlit areas) built from confident yellow ochre and burnt sienna strokes, cool objects (sky, water, shadows) built from ultramarine and cobalt slashes, foliage built from quick stamping brush dabs in saturated green tones, fabric and clothing in their own natural colors painted with visible parallel strokes, each shape painted in 2-3 confident strokes, no smooth blending, visible heavy watercolor paper texture, paint sitting on top of paper grain, flat color regions with hard or soft edges where brush strokes meet, hand-painted quality where individual brushstrokes are countable, contemporary western children's picture book art style with rounded friendly characters, character designs follow modern award-winning storybook tradition, backgrounds depict western suburban or rural environments, CRITICAL composition rule: full-bleed edge-to-edge artwork filling 100 percent of the canvas, ABSOLUTELY NO white border, NO paper edge frame, NO margin, NO scanned page effect, the painting must extend completely to all four edges of the image, no visible paper edges or frame whatsoever, absolutely NO smooth gradients, NO smooth watercolor washes, NO digital airbrush, NO illustration sheen, NO desaturated colors, NO muted pastels, NO flat plastic color blocks, NO pale tones, NO washed out look, NO unnatural object color shifts, NO crude or simplified character faces, NO Japanese cartoon big-eye style, characters must look polished and lovable in modern western tradition, must look like real gouache paint on watercolor paper at maximum vibrancy with visible brush physics, shapes must be defined purely by color and brushwork, never by drawn lines, aspect ratio 16:9, landscape orientation
```

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

### v1.3 final(2026-04-26 凌晨 5 点) ⭐ 当前锁定
- **画家锚定**:Carson Ellis / Oliver Jeffers / Jon Klassen(当代国际童书获奖派)
- **结果**:角色精致可爱 + 笔刷感保留 + 西方场景 + 当代美式亲切感
- **测试场景**:Mia 上学 + Dora 看云 + WonderBear 户外
- **验证模型**:Nano Banana(主)+ Qwen(辅)

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

## 八、Production 实施细节

### 8.1 server-v7 集成位置
路径:`src/utils/storyPrompt.js` 的 `STYLE_SUFFIXES` 字典

```javascript
// WonderBear Modern Gouache v1.3
// Source: STYLE_PROMPT_REFERENCE.md (repo root)
// Locked: 2026-04-26 after 9 iterations of Nano Banana real-generation testing
// DO NOT modify without PR + Kristy approval (see PRODUCT_CONSTITUTION §7)
const WONDERBEAR_MODERN_GOUACHE = `art style: contemporary children's book illustration in the tradition of Carson Ellis, Oliver Jeffers, and Jon Klassen, ...`;

const STYLE_SUFFIXES = {
  "default": WONDERBEAR_MODERN_GOUACHE,
  "screen_hd": WONDERBEAR_MODERN_GOUACHE,
  "print": WONDERBEAR_MODERN_GOUACHE,
};
```

### 8.2 路由策略
- **Cover**: Nano Banana 主路径(快、省、不拒)
- **内页**: fal-kontext img2img(reference cover 保持角色一致)
- **不再用 OpenAI cover 主路径**(78% 拒绝率)

### 8.3 跨服务器架构
- 美国/欧洲服务器 → Nano Banana(同 STYLE)
- 中国/东南亚服务器 → Qwen Image(同 STYLE,已验证可用)
- 双服务器架构保证品牌视觉一致性

---

**By: 创始人 Kristy + 协作 AI(Claude + Factory)**
**v1.3 final:2026-04-26 凌晨 5 点,9 轮迭代收敛后锁定**
