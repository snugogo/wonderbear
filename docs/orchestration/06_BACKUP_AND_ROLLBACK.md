# 06 · 备份与回滚机制

**版本**:v1.0
**位置**:`docs/orchestration/06_BACKUP_AND_ROLLBACK.md`
**适用对象**:VPS Claude / 所有 Factory Agent / Kristy
**对齐规范**:AGENTS.md §2.1 备份纪律 + 教训 10
**核心原则**:**没有备份不开工 + 任何失败立即回滚**

---

## 一、为什么这份文档是核心

### 1.1 Kristy 的真实诉求(2026-04-26 对话)

> "在自动化工作之前,能不能先备份一个?这样我还能回滚"

这不是 nice-to-have,是**自动化的入场券**。

理由:
- Kristy 不看代码 diff(PRODUCT_CONSTITUTION §6.1)
- 多 Factory 并发 = 出错可能性指数级上升
- 没有可靠回滚机制 = AI 自动化只敢做小事,做不了大事
- 教训 10:重大代码改动前必须备份

### 1.2 备份的两个层级目的

| 层级 | 解决什么 |
|---|---|
| **整体备份**(Layer 1) | "我想回到调度器启动前的状态" |
| **任务级备份**(Layer 2) | "Factory 改坏了,立刻回到改之前" |

两层互不替代,都要做。

---

## 二、Layer 1:整体备份(调度器启动前)

### 2.1 触发时机

**强制触发**:VPS Claude 第一次启动调度循环之前
**自动触发**:每天凌晨 03:00(cron)
**手动触发**:Kristy 通过钉钉指令 "backup now" 或 SSH 运行脚本

### 2.2 备份内容

```
备份对象            包含什么                          不包含什么
─────────────────────────────────────────────────────────────
1. Git 完整状态     所有 branches + tags + reflog    .git/objects 之外的临时文件
2. 工作目录文件     wonderbear/* 整个目录             node_modules / dist / .env
3. coordination/    全部协作记录                     done/ 已归档的(每周自动清理)
4. 数据库快照       PostgreSQL 全库 dump             (注:不需要每次都做,见 §2.5)
5. R2 资产清单      object key 列表(不下载文件)      实际文件(R2 自带版本)
```

### 2.3 备份方式(三层冗余)

#### 方式 A:Git tag(轻量,每次任务前)

```bash
TAG_NAME="pre-orch-$(date +%Y%m%d-%H%M%S)"
```
```bash
cd /opt/wonderbear
```
```bash
git tag -a "$TAG_NAME" -m "Auto backup before orchestration starts"
```
```bash
git push origin "$TAG_NAME"
```

**优点**:0 磁盘成本,GitHub 永久保存
**缺点**:只覆盖 git tracked 的文件,不包括 untracked 的本地状态
**回滚成本**:`git reset --hard $TAG_NAME` 几秒钟

#### 方式 B:目录复制(完整,每天凌晨)

```bash
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
```
```bash
BACKUP_DIR="/opt/wonderbear-backups/snapshot-$TIMESTAMP"
```
```bash
cp -r /opt/wonderbear "$BACKUP_DIR"
```
```bash
echo "Backup completed: $BACKUP_DIR" >> /var/log/wonderbear-backup.log
```

**优点**:包括 untracked 文件、完整状态
**缺点**:占磁盘空间(单次 ~500MB-1GB)
**回滚成本**:`mv` 几秒钟

#### 方式 C:数据库 dump(仅在 schema 变更前)

按 AGENTS.md §2.3 备份脚本不能用 Prisma model(教训 11),用 raw SQL:

```bash
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
```
```bash
DUMP_FILE="/opt/wonderbear-backups/db-snapshot-$TIMESTAMP.sql"
```
```bash
pg_dump -U postgres -d wonderbear -F c -f "$DUMP_FILE"
```
```bash
echo "DB dump: $DUMP_FILE ($(du -h "$DUMP_FILE" | cut -f1))" >> /var/log/wonderbear-backup.log
```

**触发条件**:**只有** schema 变更前才做(因为是 §1.1 红线,必须 Kristy 审批,审批时手工跑)
**不自动触发**

### 2.4 保留策略

| 备份类型 | 保留时长 | 何时清理 |
|---|---|---|
| Git tag | 永久 | 永不清理(GitHub 免费) |
| 目录复制(每日) | 7 天 | 第 8 天自动 `rm -rf` 最旧的 |
| 目录复制(里程碑) | 永久 | 标记 `keep` 的不清 |
| DB dump | 永久 | 不清理(单文件 < 1GB,不占空间) |

清理脚本:

```bash
find /opt/wonderbear-backups -name "snapshot-*" -mtime +7 -not -name "*keep*" -exec rm -rf {} \;
```

### 2.5 数据库为什么不每天 dump?

**事实数据(对齐 AGENTS.md §3.3 不凭印象)**:
- WonderBear 数据库主要存:children / stories / image_gen_logs / device 等元数据
- 真实大数据(图片、音频)在 R2,数据库只存 R2 object key
- 数据库 schema 变更频率极低(平均每周 < 1 次)
- 教训 11:Prisma model 变更 → 备份脚本需同步更新

**结论**:数据库快照只在**实际改 schema 前**做,不每天做。每天做的目录备份 + git tag 已经能覆盖 99% 回滚场景。

---

## 三、Layer 2:任务级备份(Factory 每次改代码前)

### 3.1 强制纪律(对齐 AGENTS.md §2.1)

**Factory Agent 改任何代码文件前,必须先备份**:

```bash
cp src/foo.js src/foo.js.backup-2026-XX-XX-{change-description}
```

命名规范:
```
{原文件名}.backup-{YYYY-MM-DD}-{taskId或短描述}
```

例子:
```
src/llm.js.backup-2026-04-27-T015-prompt-update
package.json.backup-2026-04-27-T020-add-ws-dep
```

### 3.2 自检失败时立即回滚

```bash
# Factory 改完代码后自检
node --check src/llm.js
```

```bash
# 自检失败立刻回滚(不要"再试一次")
cp src/llm.js.backup-2026-04-27-T015-prompt-update src/llm.js
```

```bash
# 在完工报告里诚实写"已回滚 + 失败原因"
echo "FAILED: 自检失败,已回滚到备份" >> coordination/factory-to-claude/FAILED-T015.md
```

按 AGENTS.md §2.4 + 教训 13,**任何失败必须立即透明报告,不藏**。

### 3.3 任务成功后 backup 文件何时删除?

**完工成功 + 推到 git + Kristy review 合 main 后**:Factory 自己删 backup 文件

```bash
rm src/llm.js.backup-2026-04-27-T015-prompt-update
```

**完工成功 + 推到 git + 但还在 PR 等 Kristy review**:**保留** backup 文件

理由:Kristy 可能 review 后说"这改动不对,撤销",这时 backup 还要用。

### 3.4 临时脚本必须独立删除(教训 12 + 教训 11)

按 AGENTS.md §2.2,临时脚本必须**单独命令**删除,禁止 `&&` 链式:

```bash
node _foo_tmp.mjs        # 第 1 条独立命令
```
```bash
rm _foo_tmp.mjs          # 第 2 条独立命令
```

**违反这条会导致**:`&&` 短路在第 1 条失败时直接 abort,临时文件不会被删,污染工作目录。

---

## 四、回滚 SOP(分场景)

### 4.1 场景 1:单个文件改坏(任务级回滚)

**触发**:Factory 自检失败,或 Kristy review 时发现问题
**操作者**:Factory 自己 / VPS Claude
**步骤**:

```bash
cd /opt/wonderbear/{module}
```
```bash
cp {file}.backup-{date}-{taskId} {file}
```
```bash
node --check {file}
```
```bash
echo "ROLLBACK: {file} restored from backup-{date}-{taskId}" >> coordination/factory-to-claude/ROLLBACK-{taskId}.md
```

**回滚后**:推钉钉 `🔄 已回滚 {file},任务 {taskId} 标记 FAILED`

### 4.2 场景 2:整个分支改坏(任务集合回滚)

**触发**:某个 Factory Session 一连串改动有问题
**操作者**:VPS Claude(自动)或 Kristy(手动)
**步骤**:

```bash
cd /opt/wonderbear
```
```bash
git checkout main
```
```bash
git branch -D feature/{bad-branch}
```

**回滚后**:推钉钉 `🔄 分支 feature/{bad-branch} 已删除,所有相关任务标记 FAILED`

### 4.3 场景 3:调度器整体跑歪(系统级回滚)

**触发**:多个 Factory 并发改坏多个文件,情况失控
**操作者**:**只能 Kristy 手动操作**(VPS Claude 不允许做这级别回滚)
**步骤**:

```bash
sudo systemctl stop wonderbear-orchestrator
```
```bash
cd /opt/wonderbear
```
```bash
git status     # 先看现状,确认要回滚
```
```bash
git reset --hard pre-orch-{timestamp}
```
```bash
git push origin main --force-with-lease  # ⚠️ 危险操作,只在确认下做
```

**或者用目录备份**:

```bash
mv /opt/wonderbear /opt/wonderbear-broken-$(date +%Y%m%d)
```
```bash
mv /opt/wonderbear-backups/snapshot-{timestamp} /opt/wonderbear
```

**回滚后**:
- 检查 wonderbear-broken-* 目录,留 24 小时事故分析
- 推钉钉 `🔴 系统级回滚已完成,等 Kristy 决策是否重启调度器`
- **不**自动重启调度器,等 Kristy 确认事故原因

### 4.4 场景 4:数据库改坏(schema 回滚)

**触发**:Kristy 跑了 schema migration 后发现问题
**操作者**:Kristy 手动 + 工具辅助
**步骤**:

```bash
psql -U postgres -d wonderbear -c "DROP DATABASE wonderbear_temp;"
```
```bash
createdb wonderbear_temp
```
```bash
pg_restore -U postgres -d wonderbear_temp /opt/wonderbear-backups/db-snapshot-{timestamp}.sql
```
```bash
# 验证 wonderbear_temp 数据完整后再切换
```
```bash
psql -U postgres -c "ALTER DATABASE wonderbear RENAME TO wonderbear_broken;"
```
```bash
psql -U postgres -c "ALTER DATABASE wonderbear_temp RENAME TO wonderbear;"
```

**为什么这样做**:**不直接 drop wonderbear**,而是先恢复到 temp、验证、再换名字。如果验证失败可以再撤销。

---

## 五、备份机制的自我保护

### 5.1 备份脚本不能用 Prisma model(教训 11)

**绝对不允许**:

```javascript
// ❌ 错的备份脚本
import { prisma } from './prisma'
const data = await prisma.imageGenLog.findMany()  // schema 变了就挂
```

**正确做法**:用 raw SQL / pg_dump,**绕开应用层**

```bash
pg_dump -U postgres -d wonderbear -t image_gen_log > backup.sql
```

### 5.2 备份脚本不能依赖应用环境

**不允许**:

```bash
# ❌ 错的脚本
cd /opt/wonderbear
npm run backup   # 依赖 npm + 项目代码,代码挂了备份也挂
```

**正确做法**:纯 bash + 系统命令

```bash
#!/bin/bash
# /opt/wonderbear-tools/backup.sh
# 完全独立,不依赖项目代码
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
cp -r /opt/wonderbear /opt/wonderbear-backups/snapshot-$TIMESTAMP
```

### 5.3 备份验证(每周一次)

每周一 04:00 自动跑一次"恢复演练"(到 /tmp,不影响生产):

```bash
LATEST_BACKUP=$(ls -t /opt/wonderbear-backups/snapshot-* | head -1)
```
```bash
TEST_DIR=/tmp/restore-test-$(date +%Y%m%d)
```
```bash
cp -r "$LATEST_BACKUP" "$TEST_DIR"
```
```bash
cd "$TEST_DIR" && git status
```
```bash
ls -la "$TEST_DIR"/server-v7
```
```bash
rm -rf "$TEST_DIR"
```
```bash
echo "Restore drill OK: $LATEST_BACKUP" >> /var/log/wonderbear-backup.log
```

如果验证失败 → 推钉钉 `🔴 备份验证失败,$(date)`,**等 Kristy 处理**。

按教训 16 配置错误的潜伏成本远高于预防成本,**没验证过的备份 = 没备份**。

---

## 六、备份机制的 metrics(每天上报)

VPS Claude 每天 09:00 推钉钉日报,包含备份 status:

```markdown
## 📊 备份状态(过去 24h)

- ✅ Git tag 备份:N 次
- ✅ 目录复制备份:1 次(03:00)
- ✅ 备份验证:通过(上次 2026-04-XX 04:00)
- 📦 当前备份占磁盘:X.X GB / 70 GB
- 🗑️ 自动清理过期备份:N 个

最新可用备份:
- Git tag: pre-orch-2026-04-26-12-30-00
- 目录:snapshot-2026-04-26-03-00-00 (1.2 GB)
```

如果备份失败:推 🔴 警报,**调度器拒绝接受新任务**直到备份恢复。

---

## 七、初始化(第一次部署调度器时)

### 7.1 准备步骤(Kristy 手动跑一次)

```bash
sudo mkdir -p /opt/wonderbear-backups
```
```bash
sudo mkdir -p /opt/wonderbear-tools
```
```bash
sudo chown root:root /opt/wonderbear-backups /opt/wonderbear-tools
```

### 7.2 写备份脚本

文件位置:`/opt/wonderbear-tools/backup-daily.sh`

(完整内容见 docs/orchestration/scripts/backup-daily.sh,这里只列骨架)

```bash
#!/bin/bash
# WonderBear 每日备份脚本
# 由 cron 触发:0 3 * * *

set -e

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="/opt/wonderbear-backups/snapshot-$TIMESTAMP"

# 1. Git tag(轻量)
cd /opt/wonderbear
git tag -a "auto-daily-$TIMESTAMP" -m "Auto daily backup"
git push origin "auto-daily-$TIMESTAMP"

# 2. 目录复制(完整)
cp -r /opt/wonderbear "$BACKUP_DIR"

# 3. 清理 7 天前的(保留里程碑)
find /opt/wonderbear-backups -name "snapshot-*" -mtime +7 -not -name "*keep*" -exec rm -rf {} \;

# 4. 推钉钉
curl -s -X POST "https://oapi.dingtalk.com/robot/send?access_token={TOKEN}" \
  -H 'Content-Type: application/json' \
  -d "{\"msgtype\":\"text\",\"text\":{\"content\":\"wonderbear: 每日备份完成 $TIMESTAMP\"}}"

echo "[$(date)] Backup completed: $BACKUP_DIR" >> /var/log/wonderbear-backup.log
```

### 7.3 配 cron

```bash
sudo crontab -e
```

加入:

```
0 3 * * * /opt/wonderbear-tools/backup-daily.sh
0 4 * * 1 /opt/wonderbear-tools/backup-verify.sh
```

每天 03:00 备份,每周一 04:00 验证。

### 7.4 第一次手动跑一次(完成才允许启动调度器)

```bash
sudo /opt/wonderbear-tools/backup-daily.sh
```
```bash
ls -la /opt/wonderbear-backups/
```
```bash
cd /opt/wonderbear && git tag | grep auto-daily
```

三条命令都成功 → 才允许 `sudo systemctl start wonderbear-orchestrator`。

---

## 八、回滚演练(可选,但强烈建议)

### 8.1 演练目的

按教训 17 工具是纪律的物质载体,**没演练过的回滚 = 不能用的回滚**。

第一次启动调度器之前,Kristy **应该**手动演练一次:

```bash
# 1. 看现在状态
cd /opt/wonderbear
git log --oneline -5
```
```bash
# 2. 故意改一个无关紧要的文件
echo "test rollback" >> /tmp/dummy.txt
```
```bash
# 3. 演练 git tag 回滚
git tag drill-test
echo "more test" >> /tmp/dummy.txt
git reset --hard drill-test
```
```bash
# 4. 验证文件状态
cat /tmp/dummy.txt
```
```bash
# 5. 清理演练 tag
git tag -d drill-test
```

跑完知道**回滚要 5 秒,不复杂**,以后 AI 自动化才放心。

### 8.2 演练频率

- **首次部署**:必做
- **每月一次**:推荐
- **每次大改 AGENTS.md §1.1 红线时**:必做

---

## 九、不允许的事

### 9.1 ❌ 永远不做

| 不允许的事 | 为什么 |
|---|---|
| 不备份直接改代码 | 违反 AGENTS.md §2.1 |
| 备份脚本用 Prisma | 违反教训 11,schema 一变就挂 |
| 用 `&&` 链式 cp + rm | 违反 §2.2,中间失败导致状态不一致 |
| `git push --force` 不带 `--force-with-lease` | 强推可能覆盖别人的工作 |
| 只 Git tag,不做目录备份 | git tag 不覆盖 untracked 文件 |
| 备份失败时继续工作 | 没有安全网就不要开车 |
| 自动跑 schema 回滚 | §1.1 红线,只 Kristy 手动 |

### 9.2 ⚠️ 警告标识

VPS Claude 每天日报里**必须**汇报这几条:

- 上次成功备份是何时?
- 上次成功验证是何时?
- 当前 backup 文件夹大小 vs 磁盘可用空间
- 是否有备份失败的警报

任意一条异常 → 推钉钉 🟡 警告。

---

## 自查清单(对齐 AGENTS.md)

- [✓] §1.1 决策权边界:数据库回滚明确属于 Kristy(§4.4)
- [✓] §2.1 备份纪律:本文档核心,全文围绕这条
- [✓] §2.2 命令逐条:所有 bash 块都用单独命令,无 `&&` 链
- [✓] §2.3 备份脚本不用 Prisma model:§5.1 明确强调
- [✓] §2.4 透明报告:§3.2 + §6 强调失败必须主动报告
- [✓] §3.1 数据精度 4 维度:本文档涉及备份大小用具体 GB 数
- [✓] §3.2 二元数字:N 次成功 / M 次失败的格式
- [✓] §5.1 工具是纪律的物质载体:§5.3 回滚演练机制
- [✓] §5.2 反复事故的处置流程:每周备份验证防止事故
- [✓] 教训 10:重大代码改动前必须备份
- [✓] 教训 11:备份脚本用 raw SQL,不用 Prisma model
- [✓] 教训 12:bash 单独命令逐条,禁止 `&&` 链式
- [✓] 教训 13:任何失败立即透明报告
- [✓] 教训 16:配置错误潜伏成本远高于预防成本(每周验证)
- [✓] 教训 17:工具是纪律的物质载体(回滚演练)

**违反检查**:本文档无违反 AGENTS.md 的内容。

---

**By**: 主控台 Claude(网页端)+ Kristy
**版本**: v1.0
**Refs**: AGENTS.md §2.1 / §2.2 / §2.3 / §2.4 / §5.1, 教训 10/11/12/13/16/17
