# WonderBear 视觉风格 DNA

**版本**:v1.0(WonderBear Vibrant Gouache,纯水粉笔刷无墨线版)
**位置**:仓库根目录 `STYLE_PROMPT_REFERENCE.md`
**适用对象**:所有图像生成任务(server-v7 / 本地 PY 工具 / 任何外部生成)
**确立日期**:2026-04-26
**确立方式**:Kristy 基于 6 轮 Nano Banana 真实生成对比测试 + 反推 Theo 雨天参考图

---

## 一、风格定义

### 1.1 风格名
**`WonderBear Vibrant Gouache`**(WonderBear 鲜艳水粉风)

### 1.2 5 大视觉特征

1. **色块刷感**:每个色块由多个可见笔触并排拼成,不是平涂渲染
2. **笔刷物理感**:同一笔内有深浅(笔毛分叉 + 飞白 + 渗透感)
3. **高饱和颜料**:cadmium red / cobalt blue / emerald green 等专业颜料色
4. **暖冷强对比**:每张图都有温暖中心 vs 冷色环境的视觉张力
5. **无墨线**:形状靠颜色边界定义,不靠黑色描边

### 1.3 参考画家
- **Kazuo Oga**(吉卜力背景画大师)— 主参考
- **Iwasaki Chihiro**(岩崎知弘,日本经典童书水彩)— 主参考

### 1.4 不要做的(明确反向)
- ❌ Sumi-e 水墨画风(会加黑色墨线)
- ❌ Maurice Sendak 风(粗犷美式,跟 WonderBear 不搭)
- ❌ 现代精修水彩(细笔无笔刷感)
- ❌ 动漫赛璐璐 cel shading
- ❌ 数字渲染光滑感

---

## 二、可接受的工程妥协

### 2.1 白边问题
- 实测 60% 命中率(无白边),40% 有小幅白边
- **不追求 100% 修复**,理由:
  - TV overscan 硬件吃边 3-5%
  - H5 全屏 padding 自然吸收
  - 投影仪边缘衰减
  - 绘本本来就有"画框感",轻微白边反而像传统书页
- **production 接受现状**,不加后处理代码

### 2.2 风格漂移
- 跨场景跑同一 STYLE_SUFFIX,大部分情况一致
- 个别复杂场景(多角色 + 强动作 + 奇幻生物)可能略漂移
- **接受 90% 一致性**作为 production 标准

---

## 三、固化的 STYLE_SUFFIX(完整版)

**使用方式**:任何图片生成 prompt 末尾**直接贴这一整段**,不修改。

```
art style: traditional Japanese gouache background painting,
inspired by Studio Ghibli Kazuo Oga background art and Iwasaki Chihiro original paintings,
painted with bold visible broad brush strokes, each stroke a clear color shape,
NOT smooth digital rendering, NOT anime cel shading, NOT airbrushed,
NO ink outlines, NO line drawings, NO black contour lines, NO pencil sketch lines,
surfaces built from multiple thick brush strokes laid side by side,
shapes defined by color and brushwork alone, never by drawn lines,

each brush stroke shows tonal variation within itself, darker where paint pools and lighter where brush runs dry,
visible dry brush effect with broken streaks, visible bristle marks as fine parallel lines within strokes,
paint absorbing into rough watercolor paper showing fiber texture and slight bleeding edges,
uneven paint coverage with thinner washes letting paper texture show through,
some strokes overlapping wet-on-wet creating natural color mixing,

color palette: highly vibrant saturated pure pigments at maximum intensity,
brilliant cadmium reds and oranges, deep cobalt and ultramarine blues, golden cadmium yellows,
emerald and viridian greens, rich burnt sienna and raw umber browns, pure titanium white highlights,
think of children's poster paint freshly squeezed from the tube, never dilute, never muted,
high color contrast and dramatic warm-cool tension throughout the entire image,
each color region painted in pure intense pigment without muddy mixing,

apply specific brush technique to every element:
warm objects (skin, wood, lamps, sunlit areas) built from confident yellow ochre and burnt sienna strokes,
cool objects (sky, water, shadows, distant areas) built from rapid ultramarine and cobalt slashes,
fabric and clothing built from multiple visible parallel strokes showing texture,
foliage and plants built from quick stamping brush dabs in saturated greens,

each shape painted in 2-3 confident strokes, no smooth blending,
visible heavy watercolor paper texture, paint sitting on top of paper grain,
flat color regions with hard or soft edges where brush strokes meet,
hand-painted quality where individual brushstrokes are countable,
1980s classic Japanese picture book and animation background art,

CRITICAL composition rule: full-bleed edge-to-edge artwork filling 100 percent of the canvas,
ABSOLUTELY NO white border, NO paper edge frame, NO margin, NO scanned page effect,
the painting must extend completely to all four edges of the image,
no visible paper edges or frame whatsoever,

absolutely NO smooth gradients, NO digital airbrush, NO AI illustration sheen,
NO desaturated colors, NO muted pastels, NO flat plastic color blocks,
NO pale tones, NO washed out look,
NO ink lines, NO contour drawings, NO outlined shapes,
must look like real gouache paint on watercolor paper at maximum vibrancy with visible brush physics,
shapes must be defined purely by color and brushwork, never by drawn lines,

aspect ratio 16:9, landscape orientation
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

[空一行,然后贴 STYLE_SUFFIX]
art style: traditional Japanese gouache background painting,
inspired by Studio Ghibli Kazuo Oga background art and Iwasaki Chihiro original paintings,
...(完整 STYLE_SUFFIX)
```

### 4.2 场景描述部分的写作纪律

- **限制在 50-100 词**(太长会稀释 STYLE 部分权重)
- **只描述人物、物体、动作、环境** — 不描述风格(风格交给 STYLE_SUFFIX)
- **不要写 "in watercolor style" 这类**(会跟 STYLE_SUFFIX 冲突)
- **保持中性描述**:`a child / a bear / a cloud`,**不要加形容词**(`beautiful / cute / amazing` 会被 AI 自由发挥)

### 4.3 错误示例

```
❌ A beautiful watercolor scene of a cute little girl named Dora 
   sitting in a magical cottage with stunning vibrant colors,
   she wears a yellow skirt and looks adorable...
```
问题:重复描述了风格,加了主观形容词,稀释了 STYLE_SUFFIX 权重。

```
✅ A 5-year-old girl named Dora with long brown curly hair,
   wearing a yellow skirt and white sleeveless top,
   sitting by a window looking up at a small white cloud,
   warm cottage interior,
```
正确:中性描述,只说"是什么 + 在哪里 + 在做什么"。

---

## 五、版本历史

### v1.0(2026-04-26)
- 基于 Theo 雨天参考图反推
- 6 轮迭代收敛(失败方向:Sendak 路线 → 平涂色块 → 笔刷物理 → 加墨线变 sumi-e → 删墨线 final)
- 关键迭代过程见 v1.7 待办清单 教训 25-31

---

## 六、未来升级触发条件

只有满足以下任一条件,才升级 v1.1:

1. **跑 100 本绘本后,Kristy 觉得视觉疲劳** → 评估子风格分支(如夏季暖色版 / 冬季冷色版)
2. **海外市场反馈风格不接受** → 评估目标市场偏好(欧美家长 vs 亚洲家长)
3. **Nano Banana 模型升级,出图风格改变** → 重新校准
4. **新协作画家 / 真人画家加入,视觉资产人工生产** → 调整 AI 风格匹配真人版

**不允许的升级原因**:
- ❌ "我突然觉得另一种风格更好"(感性,非数据驱动)
- ❌ "看到别家产品风格不错"(竞品焦虑)
- ❌ "凌晨 4 点想出来的新方向"(疲劳决策)

风格 DNA 是品牌资产,**稳定性比新颖性重要**。
