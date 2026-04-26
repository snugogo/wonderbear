# AGENTS.md — 协作 AI 行为规则

**版本**:v1.1
**位置**:`AGENTS.md`(仓库根目录)
**适用对象**:所有协作 AI(Claude / Factory Droid / Cursor / 等)

---

## §1 决策权边界

### 1.1 必须先经 Kristy 审核的操作
- ❌ git push 到 main / master
- ❌ schema 变更(prisma db push / migration)
- ❌ .env 变更(生产环境)
- ❌ 烧钱操作 > $10(批量调用 OpenAI / FAL / Gemini)
- ❌ 删除文件 / 目录(包括清理 .bak)
- ❌ 修改 PRODUCT_CONSTITUTION.md

### 1.2 可自主执行的操作
- ✅ 在分支上改代码(不 push main)
- ✅ 在 /tmp/ 跑临时脚本(用完 rm)
- ✅ 只读诊断(grep / ls / cat / curl GET)
- ✅ 服务重启(SIGTERM,有备份)
- ✅ 写入 coordination/ 文件夹

---

## §2 操作纪律

### 2.1 备份纪律(必做)
- 重大代码改动前必须备份(教训 10)
  ```bash
  cp src/foo.js src/foo.js.backup-2026-XX-XX-{change-description}
  ```
- 备份后再改,改完 `node --check` 验证
- 任何失败立即从备份回滚,不要尝试"再试一次"

### 2.2 命令执行纪律
- **单独命令逐条**,禁止 `&&` 链式(教训 12)
  - `&&` 短路不触发 set -e abort,失败时继续执行后续命令
  - 出问题时无法定位是哪一步失败
- 临时脚本必须独立 rm
  ```bash
  node _foo_tmp.mjs        # 第 1 条独立命令
  rm _foo_tmp.mjs          # 第 2 条独立命令
  ```

### 2.3 备份脚本不能用 Prisma model(教训 11)
- 备份脚本用 raw SQL(`pg_dump` / `psql -c "COPY"`),不走 Prisma
- 否则 schema 变更时备份脚本会因 model 不匹配挂掉
- 例:M2 事故 — backup 脚本因 ImageGenLog model 加字段后 P2022 错误

### 2.4 操作失误立即透明报告(教训 13)
- 任何"我刚才做错了"立即说,不要藏
- 即使已经成功补救也要说
- 比假装一切正常,**损失小 100 倍 + 信任更高**

### 2.5 紧急中断纪律(教训 15)
- 一旦发现操作偏离预期,立即 Ctrl+C / kill
- 不要"再等 5 秒看看会不会自己恢复"
- 反应速度决定损失上限

---

## §3 数据精度要求

### 3.1 涉及定价的数字必须 4 维度齐全(教训 19)
- 任何成本数字必须包含:**model + quality + resolution + 单位**
- 错:"gpt-image 是 $0.05"
- 对:"gpt-image-1.5 medium 1536×1024 landscape per image = $0.05"

### 3.2 涉及失败/成功统计必须给二元数字
- 错:"cmoblxs7v 整本失败"
- 对:"cmoblxs7v 12 张图中:11 张 fal-kontext 成功 + 1 张 cover OpenAI 失败(走完 fallback 链最终是 mock URL)"

### 3.3 不接受"过去叙述"做事实(教训 9)
- "我之前看到过 / 我记得 / 应该是" → 必须重新核实
- 用 grep / cat / curl 拿当下真值,不依赖记忆

### 3.4 涉及事实性数据用工具核实(教训 8)
- 涉及 model 价格 / API 文档 / 漏洞 / 法律事实 → web search 核实,不靠训练数据
- 训练数据可能 6-18 个月之前,价格/文档/漏洞细节都可能变

---

## §4 配置纪律

### 4.1 Fail Fast on Config(教训 14)
- 任何 .env 变更后必须立即跑 validate-config
- 不要"改完先重启,出错再说"
- 配置错误的潜伏成本远高于预防成本(教训 16)

### 4.2 health 端点必须覆盖所有外部依赖
- DB / Redis / R2 / OpenAI / Gemini / FAL 都要 ping
- health 返回 ok 必须意味着"所有依赖都可达"
- 不接受"DB 连得上就 ok"这种部分健康检查

### 4.3 .env 变更必须用 vps_console_v3 工具
- 工具自带占位符校验 + diff 预览 + 自动备份 + 回拉验证
- 不允许直接 SSH `vim .env`(会绕过校验)
- 如果工具坏了,先修工具再改 .env

### 4.4 安全默认值是 P0 风险(教训 18)
- helmet / cors / csurf 等安全中间件默认值 = 通用配置 ≠ 你的场景
- 引入新组件第一件事:review 它的全部默认配置
- 例:helmet 默认 `img-src 'self' data:`,直接拒绝你的 R2/CDN 图

---

## §5 工具优先

### 5.1 工具是纪律的物质载体(教训 17)
- 任何反复犯的错应该问:"能不能用工具消除?"
- 不要指望"以后小心一点",**让工具拒绝犯错的可能**
- 例:R2 占位符事故 → vps_console v3 加校验,永久消除

### 5.2 反复事故的处置流程
1. 第 1 次发生:记入教训,提高警觉
2. 第 2 次发生:立即设计工具/规则消除
3. 第 3 次发生:工具/规则失效,必须重写

---

## §6 git 纪律

### 6.1 commit message 规范
- 必须描述"为什么改",不只是"改了什么"
- 引用相关 TODO / 教训编号
  ```
  fix(server): add R2/FAL/jsDelivr to CSP, disable HSTS
  
  - CSP img-src 加白外部图源
  - HSTS 在 dev 环境关闭(无 HTTPS)
  - 移除 upgrade-insecure-requests 防 http→https 强升级
  
  Refs: TODO-30 教训 18
  ```

### 6.2 分支策略
- main 受保护,不直接 push
- 大改动:`feature/{description}` 分支 → PR → Kristy review → merge
- 紧急 hotfix:`hotfix/{description}` 分支 → 同样走 PR

### 6.3 PR 触发条件
- 所有产品代码改动
- AGENTS.md / PRODUCT_CONSTITUTION.md 改动(必须 Kristy 亲自合并)
- coordination/ 文件夹**不需要 PR**(协作过程文件)

---

## §7 协作模式

### 7.1 当前阶段(2026-04-26 起)
- VPS coordination/ 文件夹机制
- Kristy 钉钉节点确认重大决策
- AI 之间通过 git commit + 文件互相通知

### 7.2 coordination/ 文件夹结构
```
coordination/
  ├── factory-to-claude/    # Factory 完成任务后写在这,文件名 {timestamp}.md
  ├── claude-to-factory/    # Claude 给指令写在这
  ├── pending-approval/     # 等 Kristy 钉钉审的(标黄)
  └── done/                 # 归档完成(每周清理一次)
```

### 7.3 协作消息格式
每条 coordination 消息必须包含:
```markdown
# {简短标题}
**From**: Factory / Claude / Kristy
**To**: Factory / Claude / Kristy
**Time**: 2026-XX-XX HH:MM
**Refs**: TODO-XX, 教训 XX, PRODUCT_CONSTITUTION §X.X

## 内容
...

## 期望 next action
...
```

---

## §8 资源使用

### 8.1 SSH 自动化
- Factory 有 SSH key 访问 VPS,可自主执行
- 但**不允许长时间占用 SSH**(免得 Kristy 的 vps_console 工具用不了)
- 操作完立即断开

### 8.2 API 调用预算
- 单次任务 < $5 自主决定
- 单次任务 $5-$20 内 → coordination/pending-approval 等 Kristy 审
- 单次任务 > $20 → 必须先做 dry-run + 预估,再走审批

### 8.3 服务器资源
- VPS 内存 7.6G 无 swap → 任何并发 sharp / image processing 必须 < 3 个
- 加 swap 是 TODO-19,完成前不允许 4+ 并发

---

## 附录:历史教训快速索引

| # | 教训 | 适用场景 |
|---|---|---|
| 6 | 每次生成内容前必须看 Prompt spec 版本 | 改 storyPrompt.js 时 |
| 7 | fallback 路径必须和主路径同样精心设计 | 设计图像生成路由时 |
| 8 | 涉及事实性数据,先用工具核实 | 引用价格 / 文档 / 法律时 |
| 9 | Factory 的"过去叙述"要存疑 | 接收 Factory 报告时 |
| 10 | 重大 git 操作前必须备份 | 改代码 / 删文件前 |
| 11 | 备份脚本不能用 Prisma model 层 | schema 变更时 |
| 12 | bash `&&` 链式短路不会触发 set -e abort | 写 shell 脚本时 |
| 13 | Factory / Claude 主动透明报告失误 | 任何操作失误后 |
| 14 | Fail Fast on Config | .env 变更后 |
| 15 | 紧急中断的反应速度决定损失上限 | 操作偏离预期时 |
| 16 | 配置错误的潜伏成本远高于预防成本 | 决定要不要加校验时 |
| 17 | 工具是纪律的物质载体 | 反复犯同类错时 |
| 18 | 安全中间件的"安全默认值"也是 P0 风险来源 | 引入第三方组件时 |
| 19 | 涉及定价的数字必须 4 维度说清楚 | 任何成本讨论 |
| 20 | 产品成本数字硬编码 = 隐性技术债 | 设计 cost 表时 |
| 21 | 孩子内容产品的优先级是"先喜欢,再学到" | 设计故事内容时 |
| 22 | IP 一致性策略要服从流程简单性 | 设计角色复用时 |
| 23 | 产品命名携带创始人个人故事 = 营销资产 | 起产品名时 |
| 24 | 产品功能边界要服从技术现实(TTS 不擅唱歌) | 设计内容钩子时 |

---

**By: Kristy + 协作 AI**
**v1.0 → v1.1: 2026-04-26 凌晨,基于 24 条教训重写**
