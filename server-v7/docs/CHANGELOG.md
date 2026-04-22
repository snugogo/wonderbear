# Protocol Amendments Log

> 这份文件记录服务端窗口已接收并落地的跨窗口协议变更。
> 每次创始人发来 `TO_SERVER_*.md` 文件,在这里追加一条。

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
- API_CONTRACT.md §11.1 OemConfig 类型定义增补 `h5BaseUrl` —— 该文档由创始人维护,服务端不直接 own
- API_CONTRACT.md §14.5 新章节 —— 同上
- `GET /api/dev/qr-preview` —— 标"可选,非阻塞",计入批次 6 的 `/api/dev/*` 待办

**白名单守住**:接口字段名、错误码、Token 结构、其他 11 张表 —— 零修改。

**验证**:`npx prisma validate` 通过、`npx prisma generate` 成功、
`node test/smoke/run.mjs` 25/25 绿。

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
都能在 `docs/` 目录看到。

