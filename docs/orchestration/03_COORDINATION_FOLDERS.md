# 03 · coordination/ 文件夹协议

**版本**:v1.0
**位置**:`docs/orchestration/03_COORDINATION_FOLDERS.md`
**适用对象**:VPS Claude / 所有 Factory Agent
**对齐规范**:AGENTS.md §7 协作模式
**核心使命**:**定义协作沟通的物理载体**

---

## 一、为什么用文件夹做协作

### 1.1 设计哲学(对齐 AGENTS.md §5.1 工具是纪律的物质载体)

```
传统方式:
AI 对话 → 信息留在对话里 → 别的 AI / Kristy 看不到

文件夹方式:
AI 写文件到 coordination/ → 所有人都能看 → 有 git 历史 → 可追溯
```

**核心好处**:
1. **持久化**:对话窗口关掉,文件还在
2. **可审查**:Kristy 任何时候 ssh 到 VPS 一眼看清状态
3. **可回滚**:协作过程也在 git 里,任何"乱"都能回到之前
4. **可调试**:出问题时翻 coordination/ 历史就能复盘

### 1.2 这不是发明轮子

按 AGENTS.md §7.2,Kristy 已经定义过 coordination/ 结构。本文档是**实现细节扩展**,不是新设计。

---

## 二、完整文件夹结构

```
/opt/wonderbear/coordination/
  │
  ├── claude-to-factory/           VPS Claude 派给 Factory 的任务
  │   ├── 2026-04-27-090000-T-015.md
  │   ├── LOCK-GRANTED-T-015.md
  │   └── HALT-T-015.md
  │
  ├── factory-to-claude/           Factory 给 VPS Claude 的消息
  │   ├── LOCK-REQUEST-T-015.md
  │   ├── LOCK-RENEW-T-015.md
  │   ├── RELEASE-LOCK-T-015.md
  │   ├── SUCCESS-T-015.md
  │   ├── FAILED-T-015.md
  │   ├── SESSION-END-{sessionId}.md
  │   └── URGENT-{taskId}.md
  │
  ├── pending-approval/            等 Kristy 钉钉审批
  │   ├── PR-T-015.md             (push 请求 → PR)
  │   ├── ENV-CHANGE-T-020.md     (.env 变更)
  │   ├── SCHEMA-CHANGE-T-021.md  (schema 变更)
  │   └── HIGH-COST-T-022.md      (花费 > $5)
  │
  ├── pending-deps/                等前置任务完成
  │   └── T-018-h5-call-api.md    (depends on T-015)
  │
  ├── queue/                       排队等锁的任务
  │   └── T-016-asset.md          (等 T-015 释放 src/llm.js)
  │
  ├── push-queue/                  排队等 push
  │   ├── 1714203600-T-015.md
  │   └── 1714203900-T-018.md
  │
  ├── locks/                       文件锁
  │   ├── server-v7/
  │   │   ├── src/
  │   │   │   ├── llm.js.lock
  │   │   │   └── api.js.lock
  │   │   └── package.json.lock
  │   ├── h5/
  │   └── tv-html/
  │
  ├── orphan-locks/                超时孤立锁(等 Kristy 决策)
  │   └── server-v7-src-llm.js.lock
  │
  ├── conflicts/                   git 冲突无法自动解
  │   └── CONFLICT-T-015.md
  │
  ├── failed/                      失败归档
  │   └── 2026-04-27-T-015-FAILED.md
  │
  ├── done/                        成功归档(每周清理)
  │   └── 2026-04-27-T-015-DONE.md
  │
  ├── violations.log               违规日志(永久保留)
  │
  ├── HALT.signal                  全局停止信号(存在即停)
  │
  └── init-{timestamp}.md          调度器初始化记录
```

---

## 三、各子文件夹用途详解

### 3.1 claude-to-factory/

**写者**:VPS Claude
**读者**:Factory Agent

**用途**:
- 派任务给 Factory
- 批准 / 拒绝 lock request
- 通知前置任务已完成,你可以开工
- 紧急中断信号

**典型文件**:

```
2026-04-27-090000-T-015.md       ← 派任务
LOCK-GRANTED-T-015.md            ← 锁批准
LOCK-DENIED-T-016.md             ← 锁拒绝(说明排队位置)
DEPENDENCY-RESOLVED-T-018.md     ← 前置完成,你可开工
HALT-T-015.md                    ← 紧急中断这个任务
```

**消息格式示例**(派任务):

```markdown
# Task: T-015-llm-prompt-update

**From**: VPS-Claude
**To**: Factory-Server
**Time**: 2026-04-27 09:00:00
**Refs**: TODO-12, AGENTS.md §1.1, PRODUCT_CONSTITUTION §4.2, 教训 39

## 任务说明
改 LLM system prompt,加 IP 敏感词改写规则。
按 PRODUCT_CONSTITUTION §4.2 教训 39:
- 敏感词在对话阶段改写,不等图像生成兜底
- 验证清单:Cinderella → Mia, 暴力词 → 情绪冲突

## 范围
- 必改:server-v7/src/llm.js, server-v7/src/prompts/storyPrompt.js
- 不要改:server-v7/.env, server-v7/prisma/schema.prisma

## 依赖
- depends_on: 无

## 期望产出
- 新 prompt 模板
- 单元测试覆盖 5 个改写 case
- 完工报告里说明测试方式

## 资源约束
- 配额上限:50K tokens(自愈也算)
- 单次任务花费上限:$5
```

### 3.2 factory-to-claude/

**写者**:Factory Agent
**读者**:VPS Claude

详见 02_FACTORY_AGENT_PROTOCOL.md 第 3 节,涵盖:

- LOCK-REQUEST / LOCK-RENEW / RELEASE-LOCK
- SUCCESS / FAILED
- SESSION-END
- URGENT(紧急情况)

### 3.3 pending-approval/

**写者**:VPS Claude
**读者**:Kristy(通过钉钉链接)

**触发条件**(对齐 AGENTS.md §1.1 红线):

```
任何以下情况 → 必须写到 pending-approval/

1. Factory 想改 .env / .env.*
2. Factory 想改 schema.prisma
3. Factory 想改 package.json 依赖
4. Factory 想改 AGENTS.md / PRODUCT_CONSTITUTION.md / docs/orchestration/*
5. Factory 任务花费 > $5
6. Factory 完工想 push main(转 PR)
7. git rebase 失败需要人工解
8. Factory 想删除文件 / 目录
```

**消息格式示例**(.env 变更):

```markdown
# ENV CHANGE REQUEST: T-020

**From**: Factory-Server (via VPS-Claude)
**Time**: 2026-04-27 10:00:00
**Refs**: AGENTS.md §1.1, 教训 24

## 请求详情
Factory-Server 任务 T-020 (集成 Stripe) 需要在 server-v7/.env 加:
\`\`\`
STRIPE_API_KEY=sk_live_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
\`\`\`

## 风险评估
- 低风险:只增加,不修改已有
- 高风险:涉及生产 API key

## 处理流程
请 Kristy 用 vps_console_v3 工具:
\`\`\`
vps_console_v3 set-env STRIPE_API_KEY sk_live_xxxxx
vps_console_v3 set-env STRIPE_WEBHOOK_SECRET whsec_xxxxx
\`\`\`

完成后回复钉钉 "approved T-020",VPS Claude 会通知 Factory 继续。

## 钉钉操作链接
{对应钉钉消息链接}
```

VPS Claude 写到 pending-approval/ 后,**同步推钉钉**消息(详见 05_DINGDING_NOTIFICATIONS.md),让 Kristy 看到。

### 3.4 pending-deps/

**写者**:VPS Claude
**读者**:VPS Claude(自己巡检)

**用途**:任务依赖未完成时存放

```markdown
# Pending Dependencies: T-018

**Task**: T-018 (H5 调用新 API)
**Depends on**: T-015 (Server 加 API)
**Status**: T-015 进行中,预计 2026-04-27 09:30 完成
**Will Be Activated When**: T-015 移到 done/
```

VPS Claude 每次有任务完成时,**扫这个文件夹**看哪些 pending 任务的依赖现在满足了。

### 3.5 queue/

**写者**:VPS Claude
**读者**:VPS Claude

**用途**:等文件锁的任务排队

```markdown
# Queue: T-016

**Task**: T-016 (Asset 改 src/llm.js cost 表)
**Waiting For**: server-v7/src/llm.js (held by T-015)
**Position**: 1
**Expected Wait**: 30 分钟
```

锁释放后,VPS Claude 自动激活队列第 1 个任务。

### 3.6 push-queue/

**写者**:Factory Agent
**读者**:VPS Claude

详见 07_CONCURRENCY_CONTROL.md §5。

**关键规则**:文件名以 timestamp 开头(如 `1714203600-T-015.md`),保证 FIFO 顺序。

### 3.7 locks/

**写者**:VPS Claude
**读者**:VPS Claude

**结构**:**镜像 wonderbear/ 的目录结构**,每个被锁的文件创建一个同名 `.lock` 文件。

例:
```
wonderbear/server-v7/src/llm.js
   ↓ 被锁后
coordination/locks/server-v7/src/llm.js.lock
```

**为什么镜像目录?** 这样 `find coordination/locks/` 直接看出哪些文件被锁,符合 §5.1 工具是纪律的物质载体。

### 3.8 orphan-locks/

**写者**:VPS Claude
**读者**:Kristy

**触发**:锁超过 30 分钟 TTL,VPS Claude **不自动释放**(防止破坏 Factory 工作),搬到 orphan-locks/。

**Kristy 处理**:

```bash
ls /opt/wonderbear/coordination/orphan-locks/
```
```bash
cat /opt/wonderbear/coordination/orphan-locks/server-v7-src-llm.js.lock
```

判断 Factory 是真卡死还是还在改:
- 真卡死 → `rm` 该文件,VPS Claude 看到 orphan-locks/ 空了恢复正常
- 还在改 → 等 Factory 自然完工

### 3.9 conflicts/

**写者**:VPS Claude
**读者**:Kristy

**触发**:git rebase 自动解决失败(对齐 07 §6.3)

```markdown
# CONFLICT: T-015

**From**: VPS-Claude
**Time**: 2026-04-27 09:35:00

## 冲突详情
git rebase feature/T-015 onto main 失败。

冲突文件:
- server-v7/src/llm.js (lines 45-52)

## 已尝试
- git rebase --abort: ✅(已恢复)
- 备份 tag: pre-rebase-T-015-2026-04-27-093500

## 不再尝试的原因
按 AGENTS.md §2.4 + 07 §6.4,自动解失败立即停,不"再试一次"。

## 等 Kristy 决策

回复钉钉:
- "skip T-015":跳过这个任务,标记 ABORTED
- "manual":Kristy 手动解决冲突
- "rollback":整个分支删除,回到任务前
```

### 3.10 failed/ 和 done/

**写者**:VPS Claude
**读者**:Kristy(每周 review)

**done/ 清理规则**:每周日凌晨 04:00 cron 清理 7 天前的 done/ 文件(已 push 到 git,coordination/ 不需要永久保留)。

**failed/ 永久保留**:作为下一版 AGENTS.md 教训库的输入。

### 3.11 violations.log

**写者**:VPS Claude(主动违规 + 检测到 Factory 违规都写)

**格式**:每条一行,append-only

```
2026-04-27 09:35 - VPS-Claude - SELF - 违规 §1.1 - 尝试派 .env 变更任务给 Factory(已自动拦截)
2026-04-27 10:15 - VPS-Claude - DETECTED - Factory-Server 试图直接 push main(已拦截,转 PR)
2026-04-27 11:00 - VPS-Claude - SELF - 违规 §3.1 - 推钉钉消息没用 4 维度数据(已重发)
```

**用途**:每周 review,识别系统性问题。

### 3.12 HALT.signal

**写者**:VPS Claude
**读者**:所有 Factory + VPS Claude 自己

**触发**:Kristy 钉钉发 "STOP ALL"(详见 05 §X)

**所有 Factory 看到这个文件存在 → 立即停止 + 释放锁 + 退出**

**恢复**:Kristy 钉钉发 "RESUME" → VPS Claude 删除 HALT.signal,Factory 重新上岗。

### 3.13 init-{timestamp}.md

**写者**:VPS Claude(每次启动)

**用途**:记录调度器启动时的 checklist 结果(对齐 01 §9)

---

## 四、文件命名规范

### 4.1 通用规则

```
{动作 / 状态}-{taskId}[-{额外信息}].md
```

例:
- `LOCK-REQUEST-T-015.md`
- `SUCCESS-T-015.md`
- `FAILED-T-015.md`
- `2026-04-27-090000-T-015.md`(派任务用 timestamp 前缀)

### 4.2 不允许的命名

- ❌ 中文文件名(跨平台问题)
- ❌ 空格(用 `-` 替代)
- ❌ 特殊字符 `:`、`/`、`?`、`*`、`<`、`>`、`|`(Windows 不允许)
- ❌ 无 taskId 的文件(无法定位归属)

---

## 五、消息格式 SCHEMA(强制)

### 5.1 所有 coordination/ 文件必须包含

```markdown
# {简短标题}

**From**: VPS-Claude / Factory-{Role}-{SessionId} / Kristy
**To**: VPS-Claude / Factory-{Role} / Kristy
**Time**: {ISO 8601 时间}
**Refs**: {引用的 TODO / 教训编号 / AGENTS.md §X / PRODUCT_CONSTITUTION §X}

## 内容
{主体}

## 期望 next action(如有)
{下一步谁该做什么}

## 数据(如有,严格对齐 AGENTS.md §3.1-3.2)
- 涉及定价 → model + quality + resolution + 单位
- 涉及失败统计 → 二元数字
```

### 5.2 schema 校验

VPS Claude 收到 factory-to-claude/ 文件时,**自动校验**这 4 个字段。

缺失则:
1. 写到 `coordination/format-violations/`
2. 推钉钉 🟡 警告
3. 退回让 Factory 重写

按 §5.1 工具是纪律的物质载体,**强制校验**比"软提醒"有效。

---

## 六、git 跟踪策略

### 6.1 哪些文件跟 git

`coordination/` 整个文件夹**跟 git**(对齐 AGENTS.md §7),理由:

- 协作历史可追溯
- 出问题可 git blame
- 多 VPS / 多机器协作时同步

### 6.2 .gitignore 例外

但**这些不跟 git**(放 .gitignore):

```
coordination/locks/        # 锁是运行时状态,不持久化
coordination/HALT.signal   # 信号文件,运行时
coordination/format-violations/  # 自动生成
```

理由:这些是"运行时状态",不是"协作历史"。如果 push 到 git,会和别的 VPS 的状态冲突。

### 6.3 commit 频率

VPS Claude **不**为 coordination/ 文件单独 commit。

而是:
- 每天 09:00 日报时打包 commit:`chore(coord): daily snapshot`
- 重要事件(violations / shutdown)立即 commit
- 普通 task 完成时 coordination 文件已经被 push request 流程带走了

---

## 七、初始化(第一次部署)

### 7.1 创建文件夹结构

```bash
cd /opt/wonderbear
```
```bash
mkdir -p coordination/{claude-to-factory,factory-to-claude,pending-approval,pending-deps,queue,push-queue,orphan-locks,conflicts,failed,done}
```
```bash
mkdir -p coordination/locks/{server-v7,h5,tv-html,assets}
```
```bash
touch coordination/violations.log
```

### 7.2 创建 .gitignore

```bash
cat >> /opt/wonderbear/.gitignore << 'EOF'

# Coordination runtime state (do not track in git)
coordination/locks/
coordination/HALT.signal
coordination/format-violations/
EOF
```

### 7.3 提交初始化

```bash
cd /opt/wonderbear
```
```bash
git add coordination/ .gitignore
```
```bash
git commit -m "chore(coord): initialize coordination folder structure

按 docs/orchestration/03_COORDINATION_FOLDERS.md v1.0
- 创建 12 个子文件夹
- locks/ 镜像 wonderbear 目录结构
- runtime state 加入 .gitignore

Refs: AGENTS.md §7"
```
```bash
git push origin main
```

### 7.4 第一次启动调度器前检查

```bash
ls /opt/wonderbear/coordination/
```

应该看到所有 12 个子文件夹。如果缺,补创建。

---

## 八、并发安全(防止文件读写冲突)

### 8.1 写文件用 atomic write

VPS Claude / Factory 写 coordination/ 文件时,**先写到临时文件再 rename**:

```bash
echo "..." > /opt/wonderbear/coordination/factory-to-claude/.SUCCESS-T-015.tmp
```
```bash
mv /opt/wonderbear/coordination/factory-to-claude/.SUCCESS-T-015.tmp /opt/wonderbear/coordination/factory-to-claude/SUCCESS-T-015.md
```

理由:`mv` 是原子操作,不会出现"半个文件"被读到。

### 8.2 读文件加锁(可选)

VPS Claude 处理某文件时,如果担心并发,用 flock:

```bash
flock -x /opt/wonderbear/coordination/factory-to-claude/SUCCESS-T-015.md sleep 1
```

---

## 九、运维操作

### 9.1 每天看一眼

```bash
ssh wonderbear-vps
```
```bash
cd /opt/wonderbear/coordination
```
```bash
ls factory-to-claude/  # 看 Factory 都报告了啥
```
```bash
ls pending-approval/   # 看有没有等我审的
```
```bash
ls failed/             # 看有没有失败的
```
```bash
tail -20 violations.log  # 看违规
```

### 9.2 紧急清理(只在调度器停机时)

如果 coordination/ 乱了,需要清理:

```bash
sudo systemctl stop wonderbear-orchestrator
```
```bash
cd /opt/wonderbear
```
```bash
git status   # 看 coordination 有什么
```
```bash
git checkout -- coordination/    # 恢复到 git 版本
```
```bash
sudo systemctl start wonderbear-orchestrator
```

---

## 自查清单(对齐 AGENTS.md)

- [✓] §1.1 决策权边界:pending-approval/ 章节明确触发条件(§3.3)
- [✓] §2.1 备份纪律:§9.2 紧急清理走 git checkout 恢复
- [✓] §2.2 命令逐条:全文 bash 块单独命令
- [✓] §3.1 数据精度:消息格式强制要求 4 维度(§5.1)
- [✓] §5.1 工具是纪律的物质载体:整份文档就是这条原则的体现
- [✓] §6.1 commit:§7.3 给了 commit 模板,有"为什么"
- [✓] §7 协作模式:全文以 §7 为基础展开
- [✓] §7.2 文件夹结构:扩展并细化
- [✓] §7.3 消息格式:§5 定义强制 schema
- [✓] §8.2 API 调用预算:atomic write 减少 VPS Claude 重读消耗

**违反检查**:本文档无违反 AGENTS.md 的内容。

---

**By**: 主控台 Claude(网页端)+ Kristy
**版本**: v1.0
**Refs**: AGENTS.md §7
