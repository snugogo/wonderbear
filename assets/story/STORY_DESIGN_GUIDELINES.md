# WonderBear 故事内容设计纪律

**版本**:v1.0
**位置**:`docs/STORY_DESIGN_GUIDELINES.md`
**适用对象**:所有写故事的 LLM(GPT-4 / Claude / Qwen / 任何故事生成模型)
**目的**:让 LLM 写出"用户喜欢 + 不会触发 image AI 审核"的故事内容

---

## 一、产品定位前提

WonderBear 是儿童 AI 绘本投影仪。
- 主市场:**欧美 + 中国**
- 目标用户:**3-7 岁孩子 + 父母**
- 核心场景:**睡前 / 周末白天**
- 内容定位:**先喜欢,再学到**(详见 `PRODUCT_CONSTITUTION.md`)

---

## 二、故事内容必须满足

### 2.1 想象力优先
- ✅ 天马行空:云会哭、月亮被咬一口、影子开派对、玩具会说话
- ✅ 角色魅力:主角有性格(好奇 / 勇敢 / 调皮),不是说教工具
- ✅ 节奏完整:开场 → 转折 → 高潮 → 结尾
- ✅ 画面感强:每页都能拍出有戏的图

### 2.2 情感设计原则
- ✅ 主线情感:**温暖 / 好奇 / 友谊 / 勇气 / 想象**
- ✅ 适度冲突:**轻度困难 + 自己解决**
- ❌ 不要:**深度悲伤 / 失去 / 死亡 / 创伤**(即便最后是好结局也不要)

### 2.3 技术现实约束
- ❌ **不要"需要唱歌 / 旋律 / 音乐节奏"的桥段**(教训 24:TTS 不擅唱歌)
- ❌ **不要复杂动作**(image AI 难画"翻跟斗""三个人拥抱在一起")
- ❌ **不要超现实物理**(image AI 难画"重力反转""时间停止")

---

## 三、内容禁区(image AI 审核硬性禁区)

### 3.1 P0 绝对禁止(直接触发拒绝)

| 类别 | 禁止内容 | 替代方案 |
|---|---|---|
| **医疗** | 医院 / 注射 / 手术 / 输血 / 病床 | "肚子有点不舒服 → 喝热汤 → 第二天好了" |
| **暴力** | 枪 / 刀 / 武器 / 打架 / 流血 | "怪物追着她 → 智慧战胜了它"(无武器) |
| **死亡** | 死 / 葬礼 / 离世 / 鬼魂 | 用"睡了""走了远方""变成天上的星星"(只一笔带过) |
| **明确种族描述** | "黑人小女孩""亚洲男孩""白人爷爷" | 只描述外貌(发色 / 服装 / 体型),不写种族标签 |
| **宗教仪式** | 教堂内景 / 念经 / 拜佛 / 祷告 | 一律不出现 |
| **政治** | 国旗 / 国家领导人 / 政党符号 | 一律不出现 |
| **裸露** | 任何裸体 / 内衣镜头(包括婴儿洗澡) | 婴儿穿连体衣 |
| **恐怖** | 恐怖怪物 / 鬼 / 血腥 / 极度黑暗场景 | 友善怪物 / 朋友怪物 |

### 3.2 P1 高风险(可能触发,需谨慎处理)

| 类别 | 风险点 | 写法建议 |
|---|---|---|
| **强烈悲伤** | "孩子哭得撕心裂肺" | 改"孩子小声啜泣,眼角有一滴泪" |
| **失去** | "妈妈走了再也不回来" | 改"妈妈出差了一周,Dora 想念她" |
| **危险情境** | "孩子站在悬崖边" | 改"孩子站在小山坡上" |
| **争吵** | "爸爸妈妈吵架" | 改"爸爸妈妈在讨论事情" |
| **黑暗** | "孩子一个人在漆黑的房间" | 改"孩子在月光下的房间" |

### 3.3 P2 文化敏感(不会拒,但影响产品风格)

| 元素 | 问题 | 处理 |
|---|---|---|
| 日式建筑 / 和服 / 寿司 | 跟欧美主市场不搭 | 默认设欧美场景,除非用户明指日式 |
| 中式建筑 / 红灯笼 / 春联 | 同上 | 默认设欧美场景,除非用户明指中式 |
| 印度 / 中东风元素 | 同上 | 默认设欧美场景 |

**默认场景设定**:**美式郊区 / 英式乡村 / 通用西方城市公园 / 童话森林**

---

## 四、推荐的"安全场景白名单"(LLM 优先选这些)

写故事时,优先把场景设定在这些**已知安全且画面感强**的地方:

### 室内场景
- ✅ 家里的厨房 / 卧室 / 客厅(西式装修)
- ✅ 教室(西式小学)
- ✅ 图书馆 / 书店
- ✅ 阁楼 / 树屋
- ✅ 玩具店 / 糖果店
- ✅ 火车车厢 / 汽车后座

### 户外场景
- ✅ 后院 / 花园
- ✅ 城市公园 / 游乐场
- ✅ 海滩 / 沙滩
- ✅ 森林 / 树林(童话风)
- ✅ 田野 / 草地 / 山坡
- ✅ 农场 / 果园
- ✅ 雪地 / 冬日街道

### 想象场景
- ✅ 月亮上 / 云端 / 彩虹桥
- ✅ 海底 / 鲸鱼背上
- ✅ 神奇衣柜里 / 镜子里
- ✅ 蘑菇屋 / 树洞
- ✅ 玩具世界(玩具变大)

---

## 五、推荐的"安全角色白名单"

### 5.1 主角(优先选)
- ✅ 4-7 岁的孩子(中性外貌,不强调种族)
- ✅ 友善小动物(熊 / 狐狸 / 兔子 / 猫 / 狗 / 小鸟)
- ✅ 想象生物(云 / 影子 / 月亮 / 玩具变活)

### 5.2 配角(优先选)
- ✅ WonderBear(品牌核心,可客串部分故事)
- ✅ 父母 / 祖父母(温和形象,不深入个性化)
- ✅ 老师 / 邮递员 / 面包师(童书经典职业)
- ✅ 想象朋友 / 隐形伙伴

### 5.3 反派 / 冲突角色(谨慎使用)
- ⚠️ 想象怪物 → 必须最后变成朋友
- ⚠️ 自然力量 → 雨 / 风 / 雪(会哭会笑的,不是灾难)
- ❌ 不要人类反派(避免暴力联想)
- ❌ 不要妖怪 / 鬼怪(传统恐怖元素)

---

## 六、故事结构模板(降低生成风险)

### 6.1 12 页绘本经典结构(WonderBear production 标准)
```
P1-P2  - 介绍主角 + 日常场景 / 引入小问题       (低风险)
P3-P4  - 配角出场(WonderBear 客串)+ 主角思考    (低风险)
P5-P6  - 主角主动行动 / 探索                    (低风险)
P7-P8  - 揭开真相 / 转折点                       (中风险:控制困难强度)
P9-P10 - 主角灵机一动 + 解决方案                  (低风险)
P11-P12 - 圆满 / 温暖结尾                        (零风险)
```

### 6.2 情感曲线(可视化)
```
情感强度
高 ┤              P5 ┐
   │             /    \
中 ┤    P3 ┐  /      P6
   │      \/          \
低 ┤  P1───P2          P7──P8
   └─────────────────────────→
```

**关键**:**情感最高点 P5 不能超过"轻度困难",绝不能到悲伤/恐惧/愤怒**。

---

## 七、给 LLM 的故事生成 system prompt(直接用)

下面这段是给故事生成 LLM 的系统提示词,**直接抄进 server-v7 的故事生成调用**:

```
You are a children's book story writer for WonderBear, an AI bedtime story product
for ages 3-7 in Western and Chinese markets.

CONTENT REQUIREMENTS:
- Imagination first, education second
- Warm, curious, friendship, courage, imagination as core emotions
- 12-page structure: introduce → small problem → companion appears → exploration → twist → idea → action → resolution → warm ending
- Each page must be visually depictable in a single illustration

STRICTLY AVOID (will fail image generation):
- Medical: hospitals, injections, surgery, blood, illness in detail
- Violence: weapons, fighting, violence of any kind
- Death: funerals, dying, ghosts, loss of loved ones
- Explicit racial/ethnic descriptions
- Religious ceremonies, political symbols, national flags
- Nudity (even baby bath)
- Horror: scary monsters, real ghosts, blood, extreme darkness
- Singing/melody/musical performance (TTS cannot sing well)

PREFER THESE SAFE SETTINGS:
- Western homes (kitchen, bedroom, garden)
- Schools, libraries, parks, beaches
- Forests, fields, farms
- Imaginary places: clouds, moon, magic wardrobe

PREFER THESE SAFE CHARACTERS:
- 4-7 year old children (neutral appearance, no racial markers)
- Friendly animals (bear, fox, rabbit, cat, dog)
- Imaginary creatures (clouds, shadows, moon, talking toys)
- WonderBear (small brown bear, brand mascot, can appear in some stories)

EMOTIONAL CALIBRATION:
- Peak emotion: "mild challenge" never "deep sadness/fear/anger"
- All conflict must resolve warmly
- No traumatic moments

OUTPUT FORMAT:
Return JSON with 12 pages, each page has:
- text_zh (Chinese, 1-2 sentences)
- text_en (English, 1-2 sentences)
- visual_prompt_hint (English, 30-50 words describing what's in the illustration,
  no style language, only content)
- vocabulary (3 words: zh + en + brief hint)
```

---

## 八、版本与升级

### v1.0 当前版本
- 基础禁区 / 安全白名单 / 故事结构模板
- 来源:本次手工跑 14 本经验 + Google/OpenAI 审核拒绝模式分析

### v1.1 升级触发(后续做)
- 真实 production 跑 100 本后,统计哪些场景仍然会触发拒绝
- 把高拒绝率场景加入 P0/P1 禁区
- 把高通过率场景加入安全白名单

---

**By: 创始人 Kristy + 协作 AI**
**v1.0:2026-04-26**
