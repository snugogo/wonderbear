# Changelog

> 所有跨窗口协议变更、文档版本变化按时间倒序记录。最新的在最上面。

---

## 2026-04-22 · v3 · dialogue/turn 增加 audioBase64 字段

**来源**:TV 窗口 Q2 决策(创始人确认)

**优先级**:P0(批次 4 实现 dialogue 时必须按这个走)

**详细 patch**:`docs/spec/API_CONTRACT_PATCH_v3.md`

**变更**:`POST /api/story/dialogue/:id/turn` 增加可选字段:
- request 加 `audioBase64?: string` + `audioMimeType?: string`
- response 加 `recognizedText?: string`
- 二选一原则:userInput / audioBase64 至少传一个,优先 audioBase64

**目的**:TV 投影仪儿童产品,7 轮对话累计省 1+ 秒延迟,产品体验改善显著。

**白名单守住**:接口字段名仅新增、不删除、不重命名。`/api/asr/upload` 接口保留不动。

**给批次 4 窗口接手包的 todo**:服务端实现 dialogue/turn 时,按 patch v3 走;
代码示例已写在 patch 文档末尾。

---

## 2026-04-22 · 联调验证机制(API_ACTUAL_FORMAT)

**来源**:TV 窗口 Q3 决策(创始人确认)

**优先级**:P1(从批次 2 开始执行)

**新文档**:`docs/spec/API_ACTUAL_FORMAT.md`

**机制**:每个后端批次完成后,**必须**在 API_ACTUAL_FORMAT.md 对应章节追加:
- 实际 curl 命令
- 真实 response JSON 实例
- 主要错误码触发示例

**目的**:TV / H5 联调前 git pull 拉这份文档,跟 API_CONTRACT.md 比对,
任何差异先手动适配,避免联调到一半发现字段名不对。

**给所有未来批次窗口的硬规则**:不写就不算批次完成。

---

## 2026-04-22 · 权威文档统一收编进 repo

**来源**:创始人决策——"版本太多了,太乱了"

**优先级**:P0(影响所有未来批次窗口的工作流)

**变更**:把项目的 3 份核心文档放进 `docs/spec/`,以后**版本以 GitHub 上为准**:

- `docs/spec/API_CONTRACT.md` — 三端共用的接口契约
- `docs/spec/SERVER_HANDOFF.md` — 服务端项目初始上下文
- `docs/spec/REFACTOR_MAPPING_v7.md` — 7 个批次路线图

**新窗口接手新批次的工作流变化**:

```
旧:创始人手动上传 4 份资料 → 新窗口读
新:创始人给 GitHub 链接 → 新窗口拉 repo → 自动看到所有规范
```

创始人只需上传:
- 当前批次的 `HANDOFF_BATCH{N}.md`(虽然在 repo 里也有,但贴方便)
- 任何新出现的协议补充(然后它们会被收进 repo)

**白名单守住**:不修改任何代码、不修改任何接口字段。仅文档归位。

---

## 2026-04-22 · Prompt 工程文档 v7.1 已纳入 repo

**来源**:创始人在 server-v7 窗口确认

**优先级**:P1(批次 4 开工时使用)

**说明**:`docs/spec/PROMPT_SPEC_v7_1.md` 是 prompt 工程的**权威版本**。

v7.1 相对 v7.0 的关键改动(创始人验证过出图效果):
- 风格后缀从"水彩纸张纹理"改为"投影仪优化方向"
- 颜色更饱和鲜艳,对比度更高,适配 100-200 流明低亮度投影
- 笔触更干净

**批次 4 实现 `/api/story/*` 故事生成时,LLM prompt + 生图 prompt
全部以 `docs/spec/PROMPT_SPEC_v7_1.md` 为准**,不要用 v7 完整交付包里那份旧版。

文档已随代码 push 到 GitHub repo,任何接手批次 4 的窗口
都能在 `docs/spec/` 目录看到。

---

## 2026-04-21 · v2 · OemConfig.h5BaseUrl

**来源**:`TO_SERVER_hash_route.md` v2(对齐 `H5_HANDOFF.md §96`)

**优先级**:P0

**变更**:`prisma/schema.prisma` 的 `OemConfig` 表新增字段:

```prisma
h5BaseUrl   String   @default("https://h5.wonderbear.app")
```

**目的**:TV 端激活页生成扫码绑定 URL,格式锁为
`{h5BaseUrl}/#/register?device={deviceId}&code={activationCode}`,
不同 OEM 走自己的 H5 域名。

**关键约定**(写入代码注释):URL 参数用短名 `device`/`code`,
但所有 API 请求体仍用长名 `deviceId`/`activationCode`,服务端永远只接受长名。

**未做**(标为非阻塞):
- API_CONTRACT.md §11.1 OemConfig 类型定义增补 `h5BaseUrl` —— patch 在 `docs/spec/API_CONTRACT_PATCH_v2.md`
- API_CONTRACT.md §14.5 新章节 —— 同上
- `GET /api/dev/qr-preview` —— 标"可选,非阻塞",计入批次 6 的 `/api/dev/*` 待办

**白名单守住**:接口字段名、错误码、Token 结构、其他 11 张表 —— 零修改。

**验证**:`npx prisma validate` 通过、`npx prisma generate` 成功、
`node test/smoke/run.mjs` 25/25 绿(批次 0 当时的 smoke 数)。
