# WonderBear 产品宪法

**版本**:v1.2
**位置**:仓库根目录 `PRODUCT_CONSTITUTION.md`
**适用对象**:所有协作者(Claude / Factory / 设计师 / 工程师)
**更新原则**:重大产品决策、产品哲学、IP 战略、商业模式变更时升级版本号

**v1.2 更新(2026-04-26 凌晨 5 点)**:
- §2.5 新增"故事 IP 安全"章节(基于 Cinderella 拒绝实测)
- §4.2 图像路由策略改为双引擎兜底(基于教训 39)

---

## 一、产品定位

### 1.1 我们是什么
WonderBear 是 **AI 儿童故事投影仪**,目标用户是**中国家庭 + 海外华人 + 海外 OEM 渠道**。核心场景是**孩子睡前**。

### 1.2 我们不是什么
- ❌ **不是教辅产品**:不做"小熊学颜色""数字朋友"那种内容
- ❌ **不是技术展示**:不追求"AI 完美感"
- ❌ **不是单纯翻译工具**:中英对照不是核心卖点,故事质量才是

### 1.3 核心产品哲学:**先喜欢,再学到**
- 内容设计第一标准:**5 岁孩子求妈妈再讲一本**
- 内容设计第二标准:**妈妈也愿意陪着听**
- 教育性是副产品,不是目标
- 类比:Pixar 不是为了教孩子物理才拍《飞屋环游记》,但孩子看完知道氦气球能升空

---

## 二、IP 战略(分两层)

### 2.1 L1 主角:WonderBear(品牌核心)
- 小棕熊形象,出现在 Logo / 主页 / 营销素材 / 部分故事客串
- 形象由 OpenAI gpt-image-1 在特定 prompt 下出来,**跨故事一致性是品牌资产**
- **不要求每本绘本都有 WonderBear**(避免流程过于复杂)

### 2.2 L1 主角:Dora 朵拉
- 5 岁小女孩,创始人女儿名,致敬 Dora the Adventurer(Brazilian 官方版本叫法)
- 形象规范:卷发 + 黄色短裙 + 白上衣
- **避开**:深粉短袖 + 橘色短裤 + 黄色袜子 + 紫色发箍 + 粉色靴子(Dora Márquez 标志性造型)
- **避开**:背包(Backpack)、地图(Map)、橘色狐狸反派(Swiper)
- **避开**:配西班牙语学习 + 拉丁裔人设
- 配角:WonderBear(熊,自然区分于 Dora the Explorer 的猴子 Boots)

### 2.3 L2 衍生角色(每本独立)
- 每本一个原创想象生物:会唱歌的牙刷、不下雨的云、影子、被咬的月亮等
- 不要求跨故事一致(创作自由度极大)

### 2.4 命名安全
- "Dora" 单独不是商标(Nickelodeon 注册的是 "Dora the Explorer" 完整短语)
- **本系列名**:朵拉历险记 / Dora's Adventures(避开 Explorer)
- **海外发行前必须 IP 律师 trademark search**(预算 $300-500)
- **教训**:产品命名携带创始人个人故事 = 营销资产(投资人 demo 时讲"我女儿叫 Dora"是真实情感锚点)

### 2.5 故事 IP 安全(避开商业 IP 陷阱)⭐ 2026-04-26 凌晨新增

**背景**:实测 Google Nano Banana 对商业 IP 角色名极度敏感,即使是"公版童话"被商业化的角色也会拒绝。
- ❌ **拒绝率高的角色名**(被迪士尼 / 大公司商标化):
  - Cinderella / Snow White / Rapunzel(被 Disney 视觉绑定)
  - Mickey / Elsa / Olaf / Anna / Frozen 系列
  - Harry Potter / Spider-Man / Batman 等
  - 任何 Pokemon / Marvel / DC 角色
- ✅ **安全做法**:
  - 用原创角色名(Dora / Mia / Theo / Liam)
  - 故事框架可以借鉴经典童话,但不直接用商业 IP 名字
  - 例:不写 "Cinderella loses her glass slipper",写 "a young girl in a blue dress loses her glass shoe"
- **海外发行前**:所有角色名做 trademark search(WIPO Global Brand Database 免费查)

**教训**:image AI 的 IP 审核比"内容审核"更狠,因为版权方有法律手段追究 AI 公司。OpenAI 和 Google 对此处理方式不同:
- OpenAI:可能放行(实测 Cinderella 通过)
- Google:严格拦截(实测 Cinderella 拒绝)
- → 必须用**原创角色名**而非依赖某家放行

---

## 三、内容设计纪律

### 3.1 故事内容必须满足
- ✅ 想象力 + 天马行空
- ✅ 角色有魅力(WonderBear 调皮 + Dora 好奇)
- ✅ 节奏完整(12 页 = 开场→展开→转折→高潮→结尾)
- ✅ 画面感强(每页都能拍出有戏的图)

### 3.2 故事内容**绝对不要**
- ❌ "学颜色 / 学数字 / 学 ABC" 直白教育
- ❌ "需要唱歌 / 旋律 / 音乐节奏" 桥段(TTS 不擅长,效果差)
- ❌ 完美主角 + 简单美德教化(无聊)
- ❌ 美国主流绘本已经做烂的题材

### 3.3 故事内容设计 checklist(每个新故事必过)
1. 5 岁孩子读完会不会想看第二遍?
2. 这个故事在 Amazon/京东 童书榜里能不能找到 5 本以上类似的?(找得到 = 不要做)
3. 有没有 "需要唱歌/有旋律" 的核心桥段?(有 = 改)
4. WonderBear 是必现还是客串?(客串就好,不强求每本)
5. 跟同主角(Dora)的其他故事是否风格冲突?

---

## 四、技术战略

### 4.1 双服务器架构
```
美国/欧洲服务器(server-v7 现在)        中国/东南亚服务器(待建)
├── TTS:    ElevenLabs                 ├── TTS:    Qwen CosyVoice
├── 首图:   Nano Banana 主             ├── 首图:   Nano Banana 主(同方案)
├── 内页:   FAL Flux Kontext           ├── 内页:   FAL 或 Qwen(看地区/审核/成本)
└── DNS:    全球                       └── DNS:    cn / sea
```

**核心判断**:
- 首图统一(Nano Banana)→ 品牌资产层一致性
- 内页地区差异化 → 内容生产层灵活
- TTS 地区差异化 → 语言适配 + 合规

### 4.2 图像路由策略(2026-04-26 凌晨更新,基于实测教训 39)

**核心原则**:**主路径 + 兜底必须用"审核基因互补"的引擎**,单引擎策略会因审核盲区导致系统性失败。

**Cover 图路由**:
```
Nano Banana 主 → OpenAI gpt-image 兜底 → FAL Flux 兜底
```
- Nano Banana:速度快(~7s)、成本低($0.03)、内容审核宽松、**但 IP 严格**
- OpenAI:**对儿童内容严格(78% 拒绝率)**、但 **IP 宽松**(可以画 Cinderella 等公版童话)
- FAL:质量中等、最后一道防线

**内页图路由**:
```
fal-kontext img2img(reference cover)→ Nano Banana 兜底 → OpenAI 兜底
```
- fal-kontext:速度快(~14s)、保 cover 一致性
- 失败兜底走 Nano Banana / OpenAI

**为什么要双引擎兜底**(教训 39):
- 实测 Nano Banana 拒绝场景:"Cinderella" / "Snow White" / 含明确种族描述
- 实测 OpenAI 拒绝场景:儿童哭泣过强 / 任何医疗 / 任何武器联想
- **两家审核盲区互补**:一家拒、另一家可能接
- 组合命中率从单引擎 78% → 双引擎 95%+

**STYLE_SUFFIXES 重写**:
- 整体重写为 WonderBear Modern Gouache v1.3
- 详见 `STYLE_PROMPT_REFERENCE.md`

### 4.3 成本透明性
- **历史经验**:server 写死价格估算 → 偏离真账单 33%
- **新规则**:
  - cost 表注释里必须写"对齐哪个 model 哪个 quality 哪个 resolution 的 2026-XX 公开价"
  - 切 model 时必须同步改 cost 表
  - 月度跑 OpenAI Usage API 真账单对账(本周内做)

### 4.4 Fail Fast 三件套
- **Fail Fast on Config**:任何 .env 变更后必须立即 validate-config
- **health 端点扩展**:覆盖所有外部依赖(R2 / OpenAI / Gemini / FAL)
- **进程守护**:PM2 自动重启 + 监控告警

---

## 五、协作纪律(给所有 AI 协作者)

### 5.1 数据精度要求
- **涉及定价的数字必须 4 维度齐全**:model + quality + resolution + 单位
  - 错:"gpt-image 是 $0.05"
  - 对:"gpt-image-1.5 medium 1536×1024 landscape per image = $0.05"
- **涉及失败统计**:必须给二元数字("X 张成功 / Y 张失败"),不接受"整本失败"这种叙述

### 5.2 透明度要求
- 操作失误立即透明报告(教训 13)
- 比"假装一切正常然后被发现"损失小 100 倍

### 5.3 工具是纪律的物质载体
- 任何反复犯的错应该问一次:"能不能用工具消除?"
- 例:R2 占位符事故 → vps_console v3 加占位符校验,永久消除

### 5.4 安全默认值是 P0 风险
- 任何引入第三方组件,必须 review 它的全部默认配置
- "开箱即用"是假象
- 例:helmet 默认 CSP 拒外部图,直接让产品功能瘫痪

### 5.5 备份纪律
- 重大代码改动前必须备份(教训 10)
- bash 单独命令逐条,禁止 `&&` 链式(教训 12)
- 临时脚本必须独立 rm

### 5.6 git 纪律
- 不直接 push main(AGENTS.md §3)
- 大改动前先 PR,Kristy review
- commit message 必须描述"为什么改",不只是"改了什么"

---

## 六、决策风格

### 6.1 Kristy 的决策风格
- 产品 PM 视角,不看代码 diff
- 偏好 A/B/C 选项 + Claude 推荐 + 理由
- 重大决策喜欢"按你推荐"快速通过(信任 AI 判断)
- 凌晨高风险操作必停(三个变量同时变 = 不做)

### 6.2 决策升级规则
- git push 到 main 之前 → 钉钉通知 Kristy
- 烧钱操作 > $10 → 钉钉通知
- schema 变更(prisma db push)→ 钉钉通知
- .env 变更 → 用 vps_console_v3 工具 diff 预览
- 三端"看起来能用了"的里程碑 → 让 Kristy 浏览器验收

### 6.3 协作模式
- 第一阶段(已完成):Kristy 当传送机,凡事都过她
- 第二阶段(三端自动化,本周开始):VPS coordination/ 文件夹 + 钉钉节点确认
- 第三阶段(产品稳定后):专业 orchestration 平台

---

## 七、产品宪法的更新规则

- 这份宪法是 WonderBear 全产品周期的根资产,**比任何代码都重要**
- 修改这份文档必须 Kristy 亲自审核(不允许 AI 自主修改)
- 每次升级版本号要在文档顶部记录
- 所有协作者(包括新加入的 Claude / Factory / 工程师)第一件事是读这份文档

---

**By: 创始人 Kristy + 协作 AI(Claude + Factory)**
**v1.0 → v1.1: 2026-04-26 凌晨完整审视后升级**
