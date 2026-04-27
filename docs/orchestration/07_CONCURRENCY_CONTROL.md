# 07 · 并发控制(文件锁 + 任务依赖 + Push 排队)

**版本**:v1.0
**位置**:`docs/orchestration/07_CONCURRENCY_CONTROL.md`
**适用对象**:VPS Claude / 所有 Factory Agent
**对齐规范**:AGENTS.md §6.2 git 纪律 + §7 协作模式
**核心使命**:**让多个 Factory Agent 并发工作时,git 永远不乱**

---

## 一、为什么这份文档存在

### 1.1 真实痛点(2026-04-26 之前现状)

```
Kristy 同时开 4 个 Factory Session:

  09:00  Factory-Server 开始改 server-v7/src/llm.js
  09:05  Factory-H5     开始改 h5/src/api.js
  09:10  Factory-TV     开始改 tv-html/src/utils.js,**也碰了 server-v7/src/api.js**
  09:15  Factory-Asset  开始改 server-v7/.env.example,**也碰了 server-v7/src/llm.js**
  
  09:30  Factory-Server push:               ✅ 成功
  09:32  Factory-H5     push:               ✅ 成功
  09:33  Factory-TV     push:               ❌ 冲突(也改了 src/api.js)
  09:34  Factory-Asset  push:               ❌ 冲突(也改了 src/llm.js)
  
       ↓ 
  Kristy 介入,花 1-2 小时手动解 conflict
```

### 1.2 这份文档要解决的问题

让上面的场景变成:

```
  09:00  Factory-Server 申请锁定 server-v7/src/llm.js → ✅ 获得锁
         Factory-Server 开始改

  09:05  Factory-H5     申请锁定 h5/src/api.js → ✅ 获得锁(目录不冲突)
         Factory-H5 开始改

  09:10  Factory-TV     申请锁定 tv-html/src/utils.js + server-v7/src/api.js
         → ✅ utils.js 拿到 / ⏳ api.js 排队(因为 H5 没碰 server,但调度器要看依赖)
         Factory-TV 只能改 utils.js

  09:15  Factory-Asset  申请锁定 server-v7/.env.example + server-v7/src/llm.js
         → 🟡 .env.example 高敏感,转 pending-approval
         → ⏳ src/llm.js 排队(Server 还在改)

  09:30  Factory-Server 改完 → push 队列
  09:31  调度器:Server push 完成 → 释放 src/llm.js 锁
  09:31  Factory-Asset 自动获得 src/llm.js 锁,开始改

  ✅ 0 冲突,全程自动化
```

---

## 二、三层并发控制机制

```
Layer A:文件锁         (谁在改哪个文件)
   ↓
Layer B:任务依赖图     (谁等谁完成才能开工)
   ↓
Layer C:Push 排队      (永远只有一个 push 在进行)
```

---

## 三、Layer A:文件锁(File Locking)

### 3.1 目录结构

```
coordination/locks/
  ├── server-v7/
  │   ├── src/
  │   │   ├── llm.js.lock              ← 一个文件锁定一个 .lock
  │   │   └── api.js.lock
  │   └── package.json.lock
  ├── h5/
  │   └── src/
  │       └── api.js.lock
  └── tv-html/
      └── src/
          └── utils.js.lock
```

每个 `.lock` 文件就是一个标记。**文件存在 = 被占用**,**文件不存在 = 空闲**。

### 3.2 锁文件内容

每个 `.lock` 文件是一个 markdown,包含元数据:

```markdown
# Lock: server-v7/src/llm.js

**Holder**: Factory-Server-Session-{sessionId}
**Task ID**: T-015-llm-prompt-update
**Acquired**: 2026-04-27 09:00:23
**Expected Release**: 2026-04-27 09:30:00 (30 min TTL)
**Branch**: feature/T-015-llm-prompt-update
**Reason**: 改 LLM 改写敏感词的 system prompt

## 申请记录
- 2026-04-27 09:00:23: Factory-Server 申请,VPS Claude 批准
```

### 3.3 锁的生命周期

```
申请锁 → 获得锁 → 改代码 → 释放锁
  ↓
拒绝锁 → 排队 → 通知申请者
```

#### 申请锁

Factory Agent 改任何文件前,**必须先申请锁**。流程:

1. Factory 写文件到 `coordination/factory-to-claude/LOCK-REQUEST-{taskId}.md`:

```markdown
# LOCK REQUEST: T-015-llm-prompt-update

**From**: Factory-Server
**Task**: 改 LLM system prompt 增加敏感词改写规则
**需要锁定的文件**:
- server-v7/src/llm.js
- server-v7/src/prompts/storyPrompt.js

**预计耗时**: 30 分钟
**Branch**: feature/T-015-llm-prompt-update
```

2. VPS Claude 检查所有目标文件:
   - 都没锁 → 创建 `.lock` 文件,通过 coordination/claude-to-factory/ 通知 Factory 开工
   - 任意一个有锁 → 写到 `coordination/queue/` 排队,通知 Factory 等待
   - 涉及高敏感文件(.env / package.json / schema.prisma)→ 转 pending-approval

#### 释放锁

Factory 改完 + 自检通过 + push 完成后,**主动释放锁**:

```bash
rm coordination/locks/server-v7/src/llm.js.lock
```

或写到 `coordination/factory-to-claude/RELEASE-LOCK-{taskId}.md`,VPS Claude 收到后自动删 lock 文件。

#### 锁过期(防死锁)

每个锁有 **30 分钟 TTL**。VPS Claude 巡检时检查:

```
如果 lock.acquired_time + 30min < now:
  - 推钉钉警告 "Lock 超时: {file},holder: {factory-session}"
  - 写到 coordination/orphan-locks/
  - 等 Kristy 决策(是否强制释放)
```

**为什么不自动释放?** 因为 30 分钟超时可能是 Factory 真的还在改,自动释放会破坏它的工作。让 Kristy 判断是"卡死"还是"还在做"。

### 3.4 锁的颗粒度规则

| 文件类型 | 锁颗粒度 | 理由 |
|---|---|---|
| 单一 .js / .vue / .ts 文件 | 单文件锁 | 标准做法 |
| package.json | **整个目录的所有任务** | 因为 npm install 影响全部 |
| schema.prisma | **整个 server-v7** | schema 变更影响所有用 prisma 的代码 |
| .env / .env.* | **永远 pending-approval** | §1.1 红线,Kristy 必审 |
| AGENTS.md / PRODUCT_CONSTITUTION.md | **永远 pending-approval** | §1.1 红线 |
| assets/ 目录的文件 | 子目录锁 | 资产可以并发改不同子目录 |

### 3.5 高敏感文件特殊处理

按 AGENTS.md §1.1,这些文件必须走 pending-approval(VPS Claude 不自己批):

```
server-v7/.env*                  → pending-approval
server-v7/prisma/schema.prisma   → pending-approval
**/package.json                  → pending-approval(怕意外引入恶意依赖)
AGENTS.md                        → pending-approval
PRODUCT_CONSTITUTION.md          → pending-approval
docs/orchestration/*             → pending-approval(本套文档自我保护)
```

---

## 四、Layer B:任务依赖图

### 4.1 依赖声明

每个任务文件**必须**声明依赖(对齐 AGENTS.md §7.3 协作消息格式):

```markdown
# Task: T-018-h5-call-new-api

**Depends on**: [T-015-server-add-api]
**Reason**: H5 要调用的接口由 T-015 添加
```

VPS Claude 看到 T-018 的依赖未完成,**不派任务**,写到 `coordination/pending-deps/T-018.md`。

### 4.2 依赖检查触发

```
触发 1:新任务到达 coordination/factory-to-claude/
  → VPS Claude 检查 task.depends_on 的所有前置
  → 任意未完成 → 排队
  → 全部完成 → 派发

触发 2:有任务完成,移到 coordination/done/
  → VPS Claude 扫 pending-deps/,看哪些任务的前置现在完成了
  → 把可以开工的任务搬到主队列
```

### 4.3 依赖图可视化(每天日报里)

VPS Claude 每天日报推送任务依赖图:

```
当前任务依赖图(2026-04-27 09:00):

T-015 (Server 改 API)              [ ✅ 已完成 ]
  ├─ T-018 (H5 调用新 API)         [ 🟢 可开工 ]
  └─ T-019 (TV 调用新 API)         [ 🟢 可开工 ]
       └─ T-021 (TV 测试新功能)    [ ⏳ 等 T-019 ]

T-020 (Asset 生成新故事)            [ 🟢 进行中 ]
  └─ T-022 (Server 用新故事测试)   [ ⏳ 等 T-020 ]

孤立任务(无依赖):
T-023 (修 H5 文案错别字)            [ 🟢 可开工 ]
T-024 (修 TV 启动闪屏 bug)         [ 🟢 进行中 ]
```

### 4.4 循环依赖检测

VPS Claude 每次派任务前,**强制检查**循环依赖:

```
T-A depends on T-B
T-B depends on T-C
T-C depends on T-A    ← 循环!
```

发现循环 → **拒绝派发任何相关任务**,推钉钉等 Kristy 重新规划。

---

## 五、Layer C:Push 排队(单线程 push)

### 5.1 核心规则

**任何时刻,只有一个 Factory 在 push origin main**

为什么?

- 多 Factory 并发 push 是**冲突的根源**
- 哪怕文件不重叠,git 协议层面也可能 race condition
- 串行 push 完全不影响速度(push 操作本身只要几秒)

### 5.2 Push 队列机制

```
coordination/push-queue/
  ├── 001-T-015-server.md       ← 排第 1
  ├── 002-T-018-h5.md           ← 排第 2
  └── 003-T-019-tv.md           ← 排第 3
```

Factory 完工后**不直接 push**,而是写一个 push 请求到 push-queue/:

```markdown
# Push Request: T-015-llm-prompt-update

**From**: Factory-Server
**Branch**: feature/T-015-llm-prompt-update
**Files Changed**: 
- server-v7/src/llm.js
- server-v7/src/prompts/storyPrompt.js
**Self-Test**: PASSED (lint + node --check + unit tests)
**Backup Files**:
- server-v7/src/llm.js.backup-2026-04-27-T015
- server-v7/src/prompts/storyPrompt.js.backup-2026-04-27-T015
**Commit Hash (local)**: abc1234
**Target**: PR or main? → PR (因为 §1.1 不直接 push main)
```

### 5.3 VPS Claude Push 处理流程

VPS Claude 看到 push 队列有新请求:

```
1. 取队列第 1 个请求
2. cd /opt/wonderbear
3. git pull origin main --rebase
4. 检查是否有 conflict
   ├─ 无 conflict → 进入 step 5
   └─ 有 conflict → 走 §6 冲突处理
5. 不直接 push,而是创建 PR(因为 §1.1 红线)
6. 写到 coordination/pending-approval/PR-{taskId}.md,推钉钉等 Kristy review
7. Kristy review 后合 main(VPS Claude 不动)
8. 队列下一个
```

### 5.4 Push 排队的等待时间

正常情况:

```
任务平均 push 等待时间 = 队列前面任务数 × 平均处理时间(5-10 秒)

队列长度 5 → 等 < 1 分钟
队列长度 50 → 等 5-10 分钟(异常,推钉钉警告)
```

如果队列长度 > 20 → 推钉钉 🟡 警告(可能调度卡了),Kristy 介入。

---

## 六、冲突处理(VPS Claude 三步法)

### 6.1 冲突级别分类

| 级别 | 描述 | 处理方式 |
|---|---|---|
| 🟢 简单冲突 | 不同文件改动 | git rebase 自动解决 |
| 🟡 中等冲突 | 同一文件不同行 | git rebase 尝试自动解决,失败转 🔴 |
| 🔴 复杂冲突 | 同一文件同一行 / 同一函数 | **不自动解**,推钉钉等 Kristy |

### 6.2 自动解决前的强制备份

按 AGENTS.md §2.1 + 教训 10,VPS Claude 尝试自动解决冲突前**强制备份**:

```bash
git tag pre-rebase-T-{taskId}-$(date +%Y%m%d-%H%M%S)
```
```bash
git push origin pre-rebase-T-{taskId}-$(date +%Y%m%d-%H%M%S)
```

如果 rebase 出问题:

```bash
git rebase --abort
```
```bash
git reset --hard pre-rebase-T-{taskId}-{timestamp}
```

### 6.3 自动解决失败后的流程

VPS Claude 自动解决失败 → **不再尝试**(对齐 §2.4 任何失败立即透明报告):

1. `git rebase --abort`
2. 写完整冲突详情到 `coordination/conflicts/CONFLICT-T-{taskId}.md`
3. 推钉钉:`🔴 T-{taskId} 冲突无法自动解决,需 Kristy 介入`
4. **挂起**该任务,Push 队列跳过它处理下一个
5. 等 Kristy 在钉钉回复 "skip" / "manual" / "rollback"

### 6.4 不允许的"硬解"

VPS Claude **绝不允许**做这些事:

- ❌ `git rebase --skip`(跳过冲突,丢失 commit)
- ❌ `git reset --hard origin/main`(覆盖 Factory 工作)
- ❌ 自己 review 冲突区域决定保留哪边(超出协调员职责)
- ❌ "再试一次相同操作"期望不同结果

---

## 七、并发场景实战示例

### 7.1 场景 1:同目录不同文件(理想情况)

```
09:00  Factory-Server 申请 server-v7/src/llm.js
09:00  Factory-Asset  申请 server-v7/src/imagegen.js

VPS Claude:
  - llm.js 没锁 → 给 Factory-Server
  - imagegen.js 没锁 → 给 Factory-Asset
  
两个并发跑,push 队列串行,无冲突。
```

### 7.2 场景 2:同文件被两个任务想改

```
09:00  Factory-Server 申请 server-v7/src/llm.js (T-015 改 prompt)
09:05  Factory-Asset  申请 server-v7/src/llm.js (T-016 改 cost 表)

VPS Claude:
  - T-015 拿到锁 → 开工
  - T-016 排队,写到 coordination/queue/T-016.md
  - 通知 Factory-Asset:"等 T-015 完成,预计 09:30 释放"

09:32  T-015 push 完成,锁释放
09:32  T-016 自动激活,Factory-Asset 开始干
```

### 7.3 场景 3:跨模块依赖

```
T-020:Server 加 /child/switch 接口
T-021:H5 调用新接口
T-022:TV 响应 child:switched WS 事件
  
T-021 depends on T-020
T-022 depends on T-020

VPS Claude:
  - T-020 立即派给 Factory-Server
  - T-021 / T-022 移到 pending-deps/
  
T-020 完成 →
  - 自动激活 T-021 + T-022
  - **同时**派给 Factory-H5 和 Factory-TV(无冲突,因为不同模块)
```

### 7.4 场景 4:高敏感操作

```
Factory-Server 想改 server-v7/.env 加新 API key

VPS Claude:
  - 看到 .env 在高敏感清单
  - 不批准锁
  - 转 coordination/pending-approval/
  - 推钉钉:"🟡 Factory-Server 想改 .env,需 Kristy 用 vps_console_v3 批准"
  - **不允许 Factory 自己改**

等 Kristy 钉钉回复 "approve" + 用 vps_console_v3 实际改完 → 通知 Factory-Server 后续可继续。
```

---

## 八、并发监控指标(每天日报)

VPS Claude 每天 09:00 日报包含:

```markdown
## 📊 并发健康度(过去 24h)

### 文件锁
- 平均锁持有时间:XX 分钟
- 最长锁持有:T-{xxx} 持有 server-v7/src/llm.js 共 45 分钟
- 锁超时事件:0 次
- 孤立锁清理:0 次

### 任务队列
- 完成任务:N 个
- 当前进行中:M 个
- 等依赖排队:K 个
- 平均等依赖时间:XX 分钟

### Push 队列
- Push 成功:N 次
- Push 等待平均时间:< 1 分钟
- 队列峰值长度:5

### 冲突
- 自动解决成功:N 次
- 转 Kristy 处理:M 次  ← 这个数字应该 ≤ 1/天才正常
- 冲突总耗时:XX 分钟

### 异常警报
- 🔴 严重事件:无 / N 条
```

---

## 九、Factory Agent 必须遵守的规则

### 9.1 ✅ Factory 必做

- 改任何文件前申请锁
- 改完释放锁
- 完工后写 push request 到 push-queue/,**不**自己 push
- 自检失败立即回滚 + 释放锁
- 完成报告里必须包含锁持有时间

### 9.2 ❌ Factory 不允许

- 不申请锁直接改文件
- 直接 `git push origin main`(违反 §1.1)
- 长时间不释放锁(超 30 分钟必须续期或释放)
- 持有锁时跑长时间脚本(锁应该只覆盖"实际改文件"的时间)
- 强占已被锁的文件

### 9.3 续期机制

如果 Factory 真的需要超 30 分钟,**主动续期**:

```markdown
# LOCK RENEW: T-015 (server-v7/src/llm.js)

**Reason**: 任务复杂度超预期,需要再 30 分钟
**New TTL**: 2026-04-27 10:00
```

VPS Claude 同意续期 → 更新 lock 文件 TTL。
不同意 → 推钉钉等 Kristy 决策(可能任务被卡住了)。

---

## 十、紧急中断(对齐 AGENTS.md §2.5)

### 10.1 全局停止

Kristy 钉钉发指令 "STOP ALL" → VPS Claude:

```
1. 立即创建 coordination/HALT.signal 文件
2. 所有 Factory Agent 看到 HALT.signal 后:
   - 立即停止当前操作
   - 释放所有持有的锁(写 ABORT 报告)
   - 退出
3. VPS Claude 推钉钉:"🛑 全局停止已生效,N 个任务被中止"
4. 等 Kristy 钉钉发 "RESUME" 才继续
```

### 10.2 局部停止

Kristy 发 "STOP T-015" → VPS Claude:

```
1. 找到 T-015 的 Factory Agent
2. 通过 coordination/claude-to-factory/HALT-T-015.md 通知
3. Factory 收到 → 中止 + 释放锁 + 报告
4. 任务标记 ABORTED
```

### 10.3 反应速度承诺

按教训 15,**紧急中断的反应速度决定损失上限**。

VPS Claude 收到 STOP 信号后:
- 1 分钟内 HALT.signal 写入
- 5 分钟内所有 Factory 应该响应(超过推 🔴 警告)

---

## 十一、Kristy 操作手册

### 11.1 看现状

```bash
ssh wonderbear-vps
```
```bash
cd /opt/wonderbear
```
```bash
ls coordination/locks/        # 看当前锁
```
```bash
ls coordination/queue/        # 看排队任务
```
```bash
ls coordination/pending-approval/  # 看等审批
```

### 11.2 强制释放锁(应急)

只在 VPS Claude 推钉钉警告"锁卡死"时操作:

```bash
ls /opt/wonderbear/coordination/orphan-locks/
```
```bash
cat /opt/wonderbear/coordination/orphan-locks/server-v7-src-llm.js.lock
```
```bash
# 确认是真卡死(看 Factory Session 是否还活着)后
```
```bash
rm /opt/wonderbear/coordination/locks/server-v7/src/llm.js.lock
```

### 11.3 全局停止(钉钉)

钉钉群发:`wonderbear: STOP ALL`(必须含关键词)

VPS Claude 收到推送(通过反向 webhook,详见 05_DINGDING_NOTIFICATIONS.md)后,立即创建 HALT.signal。

---

## 自查清单(对齐 AGENTS.md)

- [✓] §1.1 决策权边界:.env / schema 等强制 pending-approval(§3.5)
- [✓] §2.1 备份纪律:rebase 前强制 git tag(§6.2)
- [✓] §2.2 命令逐条:所有 bash 块单独命令,无 `&&`
- [✓] §2.4 透明报告:冲突无法解决立即推钉钉(§6.3)
- [✓] §2.5 紧急中断:第 10 章独立 SOP
- [✓] §3.1 数据精度:并发指标用具体数字
- [✓] §3.2 二元数字:Push 成功 N / 失败 M
- [✓] §6.2 git 纪律:不直接 push main(§5.3)
- [✓] §6.3 PR 触发:所有产品代码改动走 PR(§5.3)
- [✓] §7 协作模式:全文以 coordination/ 文件夹为基础
- [✓] §7.2 文件夹结构:扩展了 push-queue / queue / orphan-locks 等子文件夹
- [✓] §7.3 消息格式:所有 lock / push request / queue 文件都有标准格式
- [✓] 教训 10:rebase 前强制 git tag(§6.2)
- [✓] 教训 12:bash 单独命令逐条
- [✓] 教训 15:紧急中断反应速度承诺(§10.3)

**违反检查**:本文档无违反 AGENTS.md 的内容。

---

**By**: 主控台 Claude(网页端)+ Kristy
**版本**: v1.0
**Refs**: AGENTS.md §1.1 / §2.1 / §2.5 / §6.2 / §6.3 / §7, 教训 10/12/15
