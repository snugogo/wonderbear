# Factory 工单 · 调度系统 VPS 部署

**日期**:2026-04-27
**目标**:在 VPS 154.217.234.241 落地 docs/orchestration/ 五份文档定义的调度系统
**前置条件**:
- ✅ Claude Code 已登录 Max 订阅
- ✅ Factory droid 已认证
- ✅ 钉钉 webhook 已通(2026-04-26 测试)
- ✅ docs/orchestration/01-07 已 push 到 GitHub main(执行前请 Kristy 先 push)

**预计时长**:2-3 小时
**风险等级**:中(创建新进程 / 修改 cron / 加 systemd 服务,但不动业务代码)
**对齐规范**:AGENTS.md §2.1 备份纪律 + §2.2 命令逐条

---

## 一、上岗前必读

执行此工单的 Factory Agent **必须先读完**:

```bash
ssh wonderbear-vps
```
```bash
cd /opt/wonderbear
```
```bash
git pull origin main
```
```bash
cat AGENTS.md  # 全文,不跳读
```
```bash
cat PRODUCT_CONSTITUTION.md  # 全文
```
```bash
cat docs/orchestration/01_VPS_CLAUDE_ROLES.md
```
```bash
cat docs/orchestration/02_FACTORY_AGENT_PROTOCOL.md
```
```bash
cat docs/orchestration/03_COORDINATION_FOLDERS.md
```
```bash
cat docs/orchestration/05_DINGDING_NOTIFICATIONS.md
```
```bash
cat docs/orchestration/06_BACKUP_AND_ROLLBACK.md
```
```bash
cat docs/orchestration/07_CONCURRENCY_CONTROL.md
```

读完后确认了解 §1.1 红线。

---

## 二、Phase 0 · 整体备份(必做!)

按 06 §2 + 06 §7,**任何自动化前必须先备份**。

### 0.1 创建备份目录

```bash
sudo mkdir -p /opt/wonderbear-backups
```
```bash
sudo mkdir -p /opt/wonderbear-tools
```
```bash
sudo chown root:root /opt/wonderbear-backups /opt/wonderbear-tools
```

### 0.2 第一次手动备份(Layer 1)

```bash
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
```
```bash
echo "Backup timestamp: $TIMESTAMP"
```
```bash
cd /opt/wonderbear
```
```bash
git tag -a "pre-orchestration-$TIMESTAMP" -m "Snapshot before orchestrator deployment"
```
```bash
git push origin "pre-orchestration-$TIMESTAMP"
```
```bash
sudo cp -r /opt/wonderbear "/opt/wonderbear-backups/snapshot-$TIMESTAMP-pre-orchestration"
```
```bash
ls -la /opt/wonderbear-backups/
```

### 0.3 验证备份

```bash
cd "/opt/wonderbear-backups/snapshot-$TIMESTAMP-pre-orchestration"
```
```bash
ls -la
```
```bash
git log --oneline | head -5
```

应该看到完整的代码 + git 历史。

### 0.4 备份成功推钉钉

```bash
curl -s -X POST "https://oapi.dingtalk.com/robot/send?access_token=1e6fa6c0706fd12c32ec18326e9ef1c6cbc9ee4da3779b21fed1e6bc440ecf44" \
  -H 'Content-Type: application/json' \
  -d "$(cat <<EOF
{
  "msgtype": "text",
  "text": {
    "content": "wonderbear: 调度系统部署前备份完成 - snapshot-$TIMESTAMP-pre-orchestration"
  }
}
EOF
)"
```

钉钉应收到一条消息。

---

## 三、Phase 1 · 创建 coordination/ 文件夹结构

按 03 §7。

### 1.1 创建子文件夹

```bash
cd /opt/wonderbear
```
```bash
mkdir -p coordination/claude-to-factory
```
```bash
mkdir -p coordination/factory-to-claude
```
```bash
mkdir -p coordination/pending-approval
```
```bash
mkdir -p coordination/pending-deps
```
```bash
mkdir -p coordination/queue
```
```bash
mkdir -p coordination/push-queue
```
```bash
mkdir -p coordination/orphan-locks
```
```bash
mkdir -p coordination/conflicts
```
```bash
mkdir -p coordination/failed
```
```bash
mkdir -p coordination/done
```
```bash
mkdir -p coordination/responses
```
```bash
mkdir -p coordination/locks/server-v7/src
```
```bash
mkdir -p coordination/locks/h5/src
```
```bash
mkdir -p coordination/locks/tv-html/src
```
```bash
mkdir -p coordination/locks/assets
```
```bash
touch coordination/violations.log
```
```bash
ls -R coordination/ | head -40
```

应该看到完整的 12 个子文件夹结构。

### 1.2 更新 .gitignore

```bash
cat >> /opt/wonderbear/.gitignore << 'EOF'

# Coordination runtime state (do not track in git)
coordination/locks/
coordination/HALT.signal
coordination/format-violations/
coordination/responses/
EOF
```
```bash
cat /opt/wonderbear/.gitignore | tail -10
```

### 1.3 commit 文件夹结构

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

⚠️ 这次 push 是**结构性变更**,不是业务代码,可以直接 push main(对齐 §1.1 例外:目录结构本身不属于受保护)。

---

## 四、Phase 2 · 部署备份机制

按 06 §7。

### 2.1 写每日备份脚本

```bash
sudo cat > /opt/wonderbear-tools/backup-daily.sh << 'EOF'
#!/bin/bash
# WonderBear 每日备份脚本
# 由 cron 触发:每天 03:00

set -e

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="/opt/wonderbear-backups/snapshot-$TIMESTAMP"
LOG_FILE=/var/log/wonderbear-backup.log

echo "[$TIMESTAMP] Daily backup START" >> "$LOG_FILE"

# 1. Git tag(轻量)
cd /opt/wonderbear
git tag -a "auto-daily-$TIMESTAMP" -m "Auto daily backup" >> "$LOG_FILE" 2>&1
git push origin "auto-daily-$TIMESTAMP" >> "$LOG_FILE" 2>&1 || echo "[$TIMESTAMP] Git push failed (will retry next day)" >> "$LOG_FILE"

# 2. 目录复制(完整)
cp -r /opt/wonderbear "$BACKUP_DIR" 2>> "$LOG_FILE"

# 3. 清理 7 天前(保留里程碑)
find /opt/wonderbear-backups -maxdepth 1 -name "snapshot-2*" -mtime +7 -not -name "*keep*" -exec rm -rf {} \; 2>> "$LOG_FILE"

# 4. 推钉钉
SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
curl -s -X POST "https://oapi.dingtalk.com/robot/send?access_token=1e6fa6c0706fd12c32ec18326e9ef1c6cbc9ee4da3779b21fed1e6bc440ecf44" \
  -H 'Content-Type: application/json' \
  -d "{\"msgtype\":\"text\",\"text\":{\"content\":\"wonderbear: 每日备份完成 $TIMESTAMP, 大小 $SIZE\"}}" \
  >> "$LOG_FILE" 2>&1

echo "[$TIMESTAMP] Daily backup DONE: $BACKUP_DIR ($SIZE)" >> "$LOG_FILE"
EOF
```

⚠️ 上面的 cat 是单条命令(包含 EOF heredoc),不是 `&&` 链。

### 2.2 加可执行权限

```bash
sudo chmod +x /opt/wonderbear-tools/backup-daily.sh
```

### 2.3 写每周备份验证脚本

```bash
sudo cat > /opt/wonderbear-tools/backup-verify.sh << 'EOF'
#!/bin/bash
# WonderBear 每周备份验证
# 由 cron 触发:每周一 04:00

set -e

LATEST_BACKUP=$(ls -t /opt/wonderbear-backups/snapshot-* 2>/dev/null | head -1)
LOG_FILE=/var/log/wonderbear-backup.log

if [ -z "$LATEST_BACKUP" ]; then
    echo "[$(date)] ❌ No backup found!" >> "$LOG_FILE"
    curl -s -X POST "https://oapi.dingtalk.com/robot/send?access_token=1e6fa6c0706fd12c32ec18326e9ef1c6cbc9ee4da3779b21fed1e6bc440ecf44" \
      -H 'Content-Type: application/json' \
      -d '{"msgtype":"text","text":{"content":"wonderbear: 🛑 备份验证失败 - 找不到任何备份!"}}'
    exit 1
fi

TEST_DIR=/tmp/restore-test-$(date +%Y%m%d)
cp -r "$LATEST_BACKUP" "$TEST_DIR" >> "$LOG_FILE" 2>&1

# 验证关键文件
if [ ! -f "$TEST_DIR/AGENTS.md" ]; then
    echo "[$(date)] ❌ AGENTS.md missing in backup!" >> "$LOG_FILE"
    rm -rf "$TEST_DIR"
    exit 1
fi

if [ ! -d "$TEST_DIR/server-v7" ]; then
    echo "[$(date)] ❌ server-v7/ missing in backup!" >> "$LOG_FILE"
    rm -rf "$TEST_DIR"
    exit 1
fi

# 验证 git 状态
cd "$TEST_DIR"
git log --oneline | head -1 >> "$LOG_FILE"

# 清理
rm -rf "$TEST_DIR"

# 推钉钉成功
curl -s -X POST "https://oapi.dingtalk.com/robot/send?access_token=1e6fa6c0706fd12c32ec18326e9ef1c6cbc9ee4da3779b21fed1e6bc440ecf44" \
  -H 'Content-Type: application/json' \
  -d "{\"msgtype\":\"text\",\"text\":{\"content\":\"wonderbear: ✅ 备份验证通过 - $LATEST_BACKUP\"}}"

echo "[$(date)] ✅ Backup verify passed: $LATEST_BACKUP" >> "$LOG_FILE"
EOF
```
```bash
sudo chmod +x /opt/wonderbear-tools/backup-verify.sh
```

### 2.4 配 cron

```bash
sudo crontab -l > /tmp/cron-current 2>/dev/null || touch /tmp/cron-current
```
```bash
echo "0 3 * * * /opt/wonderbear-tools/backup-daily.sh" >> /tmp/cron-current
```
```bash
echo "0 4 * * 1 /opt/wonderbear-tools/backup-verify.sh" >> /tmp/cron-current
```
```bash
sudo crontab /tmp/cron-current
```
```bash
sudo crontab -l
```

应该看到两条新加的 cron。

### 2.5 立即手动跑一次备份验证(初始化)

```bash
sudo /opt/wonderbear-tools/backup-daily.sh
```
```bash
ls -la /opt/wonderbear-backups/
```
```bash
tail -10 /var/log/wonderbear-backup.log
```

钉钉应收到一条"每日备份完成"。

---

## 五、Phase 3 · 部署钉钉通知工具

按 05 §7。

### 3.1 创建 token 文件

```bash
sudo mkdir -p /etc/wonderbear
```
```bash
sudo cat > /etc/wonderbear/orchestrator.env << 'EOF'
DINGTALK_TOKEN=1e6fa6c0706fd12c32ec18326e9ef1c6cbc9ee4da3779b21fed1e6bc440ecf44
EOF
```
```bash
sudo chmod 600 /etc/wonderbear/orchestrator.env
```

### 3.2 写 notify.sh

```bash
sudo cat > /opt/wonderbear-tools/notify.sh << 'EOF'
#!/bin/bash
# WonderBear 钉钉通知工具

source /etc/wonderbear/orchestrator.env

WEBHOOK_URL="https://oapi.dingtalk.com/robot/send?access_token=${DINGTALK_TOKEN}"

notify_text() {
    local content="$1"
    if [[ "$content" != *"wonderbear"* ]]; then
        echo "❌ Missing 'wonderbear' keyword, refusing to send" >&2
        return 1
    fi
    
    curl -s -X POST "$WEBHOOK_URL" \
        -H "Content-Type: application/json" \
        -d "$(jq -n --arg msg "$content" '{msgtype:"text",text:{content:$msg}}')"
}

notify_markdown() {
    local title="$1"
    local content="$2"
    if [[ "$content" != *"wonderbear"* ]]; then
        echo "❌ Missing 'wonderbear' keyword, refusing to send" >&2
        return 1
    fi
    
    curl -s -X POST "$WEBHOOK_URL" \
        -H "Content-Type: application/json" \
        -d "$(jq -n --arg t "$title" --arg c "$content" \
            '{msgtype:"markdown",markdown:{title:$t,text:$c}}')"
}

# 如果脚本被直接调用,运行测试
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    notify_text "wonderbear: notify.sh 烟雾测试 - $(date)"
fi
EOF
```
```bash
sudo chmod +x /opt/wonderbear-tools/notify.sh
```

### 3.3 烟雾测试

```bash
sudo /opt/wonderbear-tools/notify.sh
```

钉钉应收到一条"notify.sh 烟雾测试"。

### 3.4 5 类消息测试

```bash
source /opt/wonderbear-tools/notify.sh
```
```bash
notify_markdown "测试 1/5" "wonderbear · 🟢 完工通知测试"
```
```bash
sleep 3
```
```bash
notify_markdown "测试 2/5" "wonderbear · 🔴 失败警报测试"
```
```bash
sleep 3
```
```bash
notify_markdown "测试 3/5" "wonderbear · 🟡 需审批测试"
```
```bash
sleep 3
```
```bash
notify_markdown "测试 4/5" "wonderbear · 🛑 系统异常测试"
```
```bash
sleep 3
```
```bash
notify_markdown "测试 5/5" "wonderbear · 📊 日报测试"
```

钉钉应收到 5 条 markdown 消息。

---

## 六、Phase 4 · 部署 orchestrator 主循环

按 01 §4。

### 4.1 写 orchestrator-loop.sh

```bash
sudo cat > /opt/wonderbear-tools/orchestrator-loop.sh << 'EOF'
#!/bin/bash
# WonderBear Orchestrator (VPS Claude Code 调度循环)
# 由 systemd 守护

set -e

source /etc/wonderbear/orchestrator.env

WONDERBEAR_DIR="/opt/wonderbear"
WATCH_DIR="$WONDERBEAR_DIR/coordination/factory-to-claude"
RESPONSES_DIR="$WONDERBEAR_DIR/coordination/responses"
HALT_SIGNAL="$WONDERBEAR_DIR/coordination/HALT.signal"
LOG_FILE=/var/log/wonderbear-orchestrator.log
LAST_CLAUDE_RUN=$(date +%s)
PATROL_INTERVAL=900   # 15 分钟巡检

cd "$WONDERBEAR_DIR"

echo "[$(date)] Orchestrator START" >> "$LOG_FILE"

# 启动通知
curl -s -X POST "https://oapi.dingtalk.com/robot/send?access_token=${DINGTALK_TOKEN}" \
    -H 'Content-Type: application/json' \
    -d '{"msgtype":"text","text":{"content":"wonderbear: 🚀 调度器已启动"}}' \
    >> "$LOG_FILE" 2>&1

while true; do
    # 检查 HALT 信号
    if [ -f "$HALT_SIGNAL" ]; then
        echo "[$(date)] HALT signal detected, exiting" >> "$LOG_FILE"
        curl -s -X POST "https://oapi.dingtalk.com/robot/send?access_token=${DINGTALK_TOKEN}" \
            -H 'Content-Type: application/json' \
            -d '{"msgtype":"text","text":{"content":"wonderbear: 🛑 调度器收到 HALT 信号已退出"}}' \
            >> "$LOG_FILE" 2>&1
        exit 0
    fi
    
    # 同步 git
    git pull origin main --quiet 2>/dev/null || true
    
    # 检查 Kristy 的 responses
    if [ -d "$RESPONSES_DIR" ] && [ "$(ls -A "$RESPONSES_DIR" 2>/dev/null)" ]; then
        echo "[$(date)] Found Kristy response, invoking Claude" >> "$LOG_FILE"
        cd "$WONDERBEAR_DIR"
        claude -p "处理 coordination/responses/ 下的 Kristy 回复,按 docs/orchestration/ 协议响应" >> "$LOG_FILE" 2>&1
        LAST_CLAUDE_RUN=$(date +%s)
        continue
    fi
    
    # 30 秒粒度的事件检测(0 配额消耗)
    NEW_FILES=$(find "$WATCH_DIR" -newermt "@$LAST_CLAUDE_RUN" -type f 2>/dev/null)
    
    if [ -n "$NEW_FILES" ]; then
        # 有新任务,立刻调 Claude
        echo "[$(date)] New files detected: $NEW_FILES" >> "$LOG_FILE"
        cd "$WONDERBEAR_DIR"
        claude -p "处理 coordination/factory-to-claude/ 下的新文件,按 docs/orchestration/ 协议响应" >> "$LOG_FILE" 2>&1
        LAST_CLAUDE_RUN=$(date +%s)
    elif [ $(($(date +%s) - LAST_CLAUDE_RUN)) -ge $PATROL_INTERVAL ]; then
        # 15 分钟巡检
        echo "[$(date)] Patrol triggered" >> "$LOG_FILE"
        cd "$WONDERBEAR_DIR"
        claude -p "巡检 coordination/ 状态,处理待办,如果是早 09:00 生成日报推钉钉" >> "$LOG_FILE" 2>&1
        LAST_CLAUDE_RUN=$(date +%s)
    fi
    
    sleep 30
done
EOF
```
```bash
sudo chmod +x /opt/wonderbear-tools/orchestrator-loop.sh
```

### 4.2 写 systemd service

```bash
sudo cat > /etc/systemd/system/wonderbear-orchestrator.service << 'EOF'
[Unit]
Description=WonderBear Orchestrator (VPS Claude Code)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/wonderbear
EnvironmentFile=/etc/wonderbear/orchestrator.env
ExecStart=/opt/wonderbear-tools/orchestrator-loop.sh
Restart=on-failure
RestartSec=60
StandardOutput=append:/var/log/wonderbear-orchestrator.log
StandardError=append:/var/log/wonderbear-orchestrator.log

[Install]
WantedBy=multi-user.target
EOF
```

### 4.3 reload + 启用(暂不启动)

```bash
sudo systemctl daemon-reload
```
```bash
sudo systemctl enable wonderbear-orchestrator
```
```bash
sudo systemctl status wonderbear-orchestrator
```

应该看到 `enabled` 但 `inactive (dead)` —— 启用了但还没启动。

---

## 七、Phase 5 · 第一次启动 + 烟雾测试

### 5.1 启动调度器

```bash
sudo systemctl start wonderbear-orchestrator
```
```bash
sudo systemctl status wonderbear-orchestrator
```

应该看到 `active (running)`。

### 5.2 看启动日志

```bash
sudo tail -f /var/log/wonderbear-orchestrator.log
```

应该看到:
- `Orchestrator START`
- 钉钉应收到"调度器已启动"

按 Ctrl+C 退出 tail。

### 5.3 模拟 Factory 写一个测试文件

```bash
cat > /opt/wonderbear/coordination/factory-to-claude/SMOKE-TEST-001.md << 'EOF'
# SMOKE TEST: 001

**From**: Factory-Smoke-Test
**To**: VPS-Claude
**Time**: 2026-04-27 14:00
**Refs**: 实施工单 §5.3

## 内容
这是一个烟雾测试,确认 VPS Claude 能检测到 coordination/ 文件变化。

## 期望 next action
VPS Claude 读取本文件,推钉钉"已收到 SMOKE TEST"。
EOF
```
```bash
ls -la /opt/wonderbear/coordination/factory-to-claude/
```

### 5.4 等 30-60 秒,看 VPS Claude 反应

```bash
sleep 60
```
```bash
sudo tail -30 /var/log/wonderbear-orchestrator.log
```

应该看到:
- `New files detected: SMOKE-TEST-001.md`
- claude 命令执行的输出

钉钉应收到 VPS Claude 处理这个测试的消息(具体内容由 VPS Claude 决定,但应该提到 SMOKE-TEST-001)。

### 5.5 清理测试文件

```bash
mv /opt/wonderbear/coordination/factory-to-claude/SMOKE-TEST-001.md /opt/wonderbear/coordination/done/
```

---

## 八、Phase 6 · 完工报告

写完工报告(对齐 02 §3.12):

```bash
cat > /opt/wonderbear/coordination/factory-to-claude/SUCCESS-DEPLOY-ORCHESTRATOR.md << 'EOF'
# SUCCESS: 调度系统部署完成

**From**: Factory-Deploy-{sessionId}
**Time**: 2026-04-27 HH:MM
**总耗时**: ~2-3 小时

## 完成清单

### Phase 0 整体备份
- ✅ Git tag: pre-orchestration-{timestamp}
- ✅ 目录备份: /opt/wonderbear-backups/snapshot-{timestamp}-pre-orchestration
- ✅ 钉钉通知

### Phase 1 coordination/
- ✅ 12 个子文件夹创建
- ✅ .gitignore 更新
- ✅ commit + push

### Phase 2 备份机制
- ✅ /opt/wonderbear-tools/backup-daily.sh 部署
- ✅ /opt/wonderbear-tools/backup-verify.sh 部署
- ✅ cron 配置 (03:00 daily, 04:00 Mon weekly)
- ✅ 立即手动跑了一次备份成功

### Phase 3 钉钉通知
- ✅ /etc/wonderbear/orchestrator.env (token, 600 权限)
- ✅ /opt/wonderbear-tools/notify.sh
- ✅ 5 类消息烟雾测试通过

### Phase 4 主循环
- ✅ /opt/wonderbear-tools/orchestrator-loop.sh
- ✅ /etc/systemd/system/wonderbear-orchestrator.service
- ✅ systemctl enable

### Phase 5 启动 + 烟雾测试
- ✅ systemctl start
- ✅ status: active (running)
- ✅ SMOKE-TEST-001 测试通过

## 钉钉消息计数
- 部署过程中推送钉钉消息: ~8 条
- 全部送达成功

## 配额消耗(Claude Max)
- VPS Claude 第一次启动 + 处理 SMOKE-TEST: ~3K tokens

## 当前系统状态
- 调度器: 🟢 运行中
- 备份机制: 🟢 已配置
- 钉钉通知: 🟢 通畅
- coordination/: 🟢 结构齐全

## Kristy 下一步建议

### 验证调度器运行
\`\`\`bash
sudo systemctl status wonderbear-orchestrator
\`\`\`

### 看实时日志
\`\`\`bash
sudo tail -f /var/log/wonderbear-orchestrator.log
\`\`\`

### 紧急停止(如需要)
\`\`\`bash
sudo systemctl stop wonderbear-orchestrator
\`\`\`

或更软的方式:
\`\`\`bash
touch /opt/wonderbear/coordination/HALT.signal
\`\`\`

### 第一个真实任务测试
建议 Kristy 试试这样做:
1. 开一个新 Factory Session
2. 粘贴 docs/orchestration/02_FACTORY_AGENT_PROTOCOL.md
3. 让 Factory 跑一个简单任务(比如"加 README 一行")
4. 看完整链路:Factory → coordination/ → VPS Claude → 钉钉通知
EOF
```

推钉钉:

```bash
source /opt/wonderbear-tools/notify.sh
```
```bash
notify_markdown "wonderbear · 🚀 调度系统部署完成" "$(cat <<'EOF'
# wonderbear · 调度系统部署完成 ✅

**总耗时**: ~2-3 小时

## 已部署
- ✅ coordination/ 12 个子文件夹
- ✅ 备份机制(每日 03:00 + 每周一 04:00 验证)
- ✅ 钉钉通知工具(5 类消息)
- ✅ Orchestrator 主循环(systemd 守护)

## 当前状态
- 调度器: 🟢 运行中
- 第一次 Factory 任务测试: ✅ 通过

## 你的下一步
1. SSH 验证: `sudo systemctl status wonderbear-orchestrator`
2. 看实时日志: `sudo tail -f /var/log/wonderbear-orchestrator.log`
3. 开新 Factory Session 测试真实任务

完工报告: file:///opt/wonderbear/coordination/factory-to-claude/SUCCESS-DEPLOY-ORCHESTRATOR.md
EOF
)"
```

---

## 九、灾难情景处理

执行过程中如遇问题,按场景处理:

### 9.1 Phase 2 备份失败

```bash
sudo /opt/wonderbear-tools/backup-daily.sh
```

报错 → 看 `/var/log/wonderbear-backup.log` → 通常是磁盘空间或权限问题 → 修后重跑

**不允许**:跳过备份继续 Phase 3+。备份没通过,不允许启动调度器。

### 9.2 Phase 3 钉钉发不出去

```bash
curl -v "https://oapi.dingtalk.com/..."
```

如果 timeout → VPS 出网问题
如果 keyword error → 消息内容缺 wonderbear 字
如果 sign error → token 过期

**不允许**:钉钉通不了,继续启动调度器(失去通知耳朵)。

### 9.3 Phase 4 systemd 启动失败

```bash
sudo systemctl status wonderbear-orchestrator
```
```bash
sudo journalctl -u wonderbear-orchestrator -n 50
```

常见问题:
- 脚本权限不对 → `sudo chmod +x /opt/wonderbear-tools/orchestrator-loop.sh`
- env 文件不存在 → 检查 /etc/wonderbear/orchestrator.env
- jq 没装 → `sudo apt install jq`

### 9.4 Phase 5 SMOKE TEST 没反应

```bash
sudo tail -50 /var/log/wonderbear-orchestrator.log
```

可能原因:
- claude 命令没找到 → 检查 PATH
- claude 没登录 → `claude auth status`
- 检测间隔没到 → 等够 30 秒以上

### 9.5 严重失败 → 整体回滚

如果任何 Phase 出严重问题:

```bash
sudo systemctl stop wonderbear-orchestrator 2>/dev/null || true
```
```bash
sudo systemctl disable wonderbear-orchestrator 2>/dev/null || true
```
```bash
sudo rm /etc/systemd/system/wonderbear-orchestrator.service
```
```bash
sudo crontab -l | grep -v wonderbear-tools | sudo crontab -
```
```bash
cd /opt/wonderbear
```
```bash
git reset --hard pre-orchestration-{timestamp}
```

VPS 回到部署前状态。推钉钉报告 Kristy。

---

## 十、不允许的事

❌ 不要修改任何业务代码(server-v7 / h5 / tv-html)
❌ 不要安装新 npm 包(本工单只用系统命令)
❌ 不要改 server-v7/.env
❌ 不要改 .git/hooks(那是 Kristy 个人配置)
❌ 不要重启 PostgreSQL / Redis / nginx
❌ 不要硬扛失败"再试一次" — 失败立即停 + 推钉钉

---

## 十一、完工标准

只有以下全部满足才算完成:

- [ ] Phase 0 备份成功(git tag + 目录备份都在)
- [ ] Phase 1 coordination/ 12 个子文件夹齐全
- [ ] Phase 2 backup-daily + backup-verify 两个 cron 配好
- [ ] Phase 3 钉钉烟雾测试 + 5 类消息测试都通过
- [ ] Phase 4 systemd 服务 enabled 且能 start
- [ ] Phase 5 SMOKE TEST 触发 VPS Claude 响应,钉钉收到通知
- [ ] Phase 6 完工报告 + 钉钉部署完成消息推送
- [ ] 整体未触碰任何业务代码

---

> 工单 by 主控台 Claude · 2026-04-27
> 完工请 Kristy 钉钉确认后,标记本工单 DONE
