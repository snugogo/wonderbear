# WonderBear

AI 儿童故事投影仪。中英双语睡前故事 + 投影显示。Monorepo。

---

## 协作必读

所有协作者(包括 AI 助手)动手之前必须先读:

- 📜 [PRODUCT_CONSTITUTION.md](./PRODUCT_CONSTITUTION.md) — **产品宪法**(产品定位 / IP 战略 / 内容设计纪律 / 技术战略)
- 🤖 [AGENTS.md](./AGENTS.md) — **AI 协作行为规则**(操作纪律 / 数据精度 / 备份纪律 / 24 条历史教训)

---

## 子工程

| 目录 | 内容 | 状态 |
|---|---|---|
| `server-v7/` | Node.js 服务端 (Fastify + Prisma + PG + Redis) | ✅ 部署在 VPS,健康运行 |
| `assets/` | 视觉素材 (100+ WebP / SVG)| ✅ 已上传 jsDelivr CDN |
| `h5/` | 家长 Vue 3 + Vant 4 H5 | 🔄 三端自动化阶段 |
| `tv-html/` | TV 端 Vue 3 (GP15 WebView) | 🔄 三端自动化阶段 |

每个子项目有自己的 README、依赖和部署流程。

---

## 当前阶段

### 已完成里程碑
- ✅ server-v7 Batch 0 + 1(基础架构 + 故事生成)
- ✅ R2 对象存储集成 + 168 张图迁移
- ✅ ImageGenLog 失败模式分析(获得真实路由数据)
- ✅ Helmet CSP / SSL 配置修复(浏览器调试可用)
- ✅ 14 本测试绘本生成完毕(/debug/gallery 可看)

### 进行中
- 🔄 三端 UI shell 化(H5 / TV-HTML 用 fake data 跑通)
- 🔄 Dora 朵拉系列绘本生成(童书水彩风 + 中英双语 + TTS)
- 🔄 协作模式升级(Factory + Claude 在 VPS 自主协作)

### 战略路线
- ⬜ 中国服务器架构(Qwen CosyVoice + Qwen Image)
- ⬜ Nano Banana cover 主路径切换
- ⬜ 投资人 demo / 海外 OEM 渠道对接

---

## 技术栈

**后端**:Node.js / Fastify / Prisma / PostgreSQL / Redis / Cloudflare R2
**前端**:Vue 3 / Vant 4(H5)/ Vue 3 + GP15 WebView(TV)
**AI 服务**:OpenAI GPT Image / Google Gemini Nano Banana / FAL Flux Kontext
**TTS**:ElevenLabs(英文)/ 阿里 CosyVoice(中文)
**部署**:Ubuntu 22.04 VPS,jsDelivr CDN,Cloudflare R2

---

## 产品定位(核心一句话)

WonderBear 不是教辅,是**绘本厂**。
内容设计第一标准:**5 岁孩子求妈妈再讲一本**。
详细产品哲学见 [PRODUCT_CONSTITUTION.md](./PRODUCT_CONSTITUTION.md)。

---

## License & 协作

私有项目。
协作 AI 需遵循 [AGENTS.md](./AGENTS.md) 的全部纪律。
重大产品决策由创始人 Kristy 拍板。
