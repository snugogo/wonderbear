# 05 · 钉钉通知规则

**版本**:v1.0
**位置**:`docs/orchestration/05_DINGDING_NOTIFICATIONS.md`
**适用对象**:VPS Claude(主要发送者)
**对齐规范**:AGENTS.md §7.3 协作消息格式 + PRODUCT_CONSTITUTION.md §6.1
**核心原则**:**信息密度高、噪音少、关键节点必到**

---

## 一、为什么要规范钉钉消息

### 1.1 真实痛点

```
错误示范(消息过多):
- 任务开始通知
- 任务进行 25%
- 任务进行 50%
- 任务进行 75%
- 任务完成
- 锁释放
- push queue 排上了
- PR 创建了
   ↓
 一个任务 8 条消息
 100 个任务一天 800 条
 Kristy 看到都不想点开
```

### 1.2 设计目标

```
理想状态:
- 关键节点(完工 / 失败 / 需审批 / 系统异常)→ 必到
- 中间过程 → 静默
- 一天总消息数 < 50 条(正常情况)
- 消息内容信息密度高,30 秒可读完
```

---

## 二、机器人配置

### 2.1 Webhook 信息

```
URL: https://oapi.dingtalk.com/robot/send?access_token={TOKEN}
关键词: wonderbear
注:每条消息内容必须包含 "wonderbear" 关键词(否则被钉钉拒收)
```

(实际 token 不写在文档里,放 VPS `/etc/wonderbear/.env-orchestrator`)

### 2.2 消息类型支持

| 类型 | 用途 |
|---|---|
| text | 简单文本 |
| markdown | 富文本 + 标题 |
| actionCard | 带操作按钮的卡片(适合 pending-approval) |
| feedCard | 列表式(适合每日汇总) |

---

## 三、5 类消息(决定推什么)

### 3.1 🟢 完工通知(MILESTONE)

**触发**:Factory 任务成功 + 创建 PR + Kristy review 待办

**频率上限**:不限(任务完成就推)

**格式**(markdown):

```markdown
# wonderbear · 完工 ✅ T-015

**任务**:改 LLM system prompt 增加敏感词改写规则
**Worker**:Factory-Server
**耗时**:45 分钟
**自检**:✅ lint + ✅ node --check + ✅ unit tests

## 改了什么
- server-v7/src/llm.js
- server-v7/src/prompts/storyPrompt.js

## 下一步(请你 review)
[查看 PR](https://github.com/snugogo/wonderbear/pull/{prNumber})

合 main 后,T-018(H5 调用) 和 T-019(TV 响应)将自动激活。
```

### 3.2 🔴 失败警报(FAILURE)

**触发**:Factory 任务失败 + 自愈 3 次后还失败

**频率上限**:每个任务最多 1 次

**格式**:

```markdown
# wonderbear · 失败 ❌ T-015

**任务**:改 LLM system prompt
**Worker**:Factory-Server
**失败原因**:LLM 改写后单元测试 case 3 不通过

## 已尝试
1. 改 prompt 措辞 → 失败(case 3 仍不过)
2. 加 few-shot 示例 → 失败(改了又破坏 case 1)
3. 调 temperature → 失败(不稳定)

## 当前状态
- 已回滚到 backup
- 锁已释放
- 任务标记 FAILED,移到 coordination/failed/

## 我建议
- case 3 可能本身定义有问题
- 或者需要换更强的 LLM(opus 而非 sonnet)

[完整失败报告](file:///opt/wonderbear/coordination/failed/2026-04-27-T-015-FAILED.md)
```

### 3.3 🟡 需审批(PENDING APPROVAL)

**触发**:任何 §1.1 红线被碰

- 改 .env / schema / package.json
- 花费 > $5
- push main(转 PR 也要审)
- 删除文件
- 修改 AGENTS.md / PRODUCT_CONSTITUTION.md

**频率上限**:不限,但必须每条独立(不能合并)

**格式**(actionCard):

```markdown
# wonderbear · 🟡 需审批 T-020

**类型**:.env 变更
**Factory**:Factory-Server
**任务**:集成 Stripe

## 申请的变更
\`\`\`
+ STRIPE_API_KEY=sk_live_xxxxx
+ STRIPE_WEBHOOK_SECRET=whsec_xxxxx
\`\`\`

## 风险评估
- 类别:增加(不修改已有)
- 涉及:生产 API key

## 你的操作
回复钉钉:
- "approve T-020":批准,我会通知 Factory 用 vps_console_v3 操作
- "deny T-020":拒绝,Factory 任务标记 ABORTED

[完整请求](file:///opt/wonderbear/coordination/pending-approval/ENV-CHANGE-T-020.md)
```

### 3.4 🛑 系统异常(SYSTEM CRITICAL)

**触发**:

- 调度器自身停机
- 备份失败
- 钉钉 webhook 推不出去(自动重试 5 次后)
- 单日 violations.log 超 5 条
- VPS 资源紧张(磁盘 > 90% / 内存 < 500MB)

**频率上限**:不限,但每个事件最多重发 3 次(避免循环)

**格式**:

```markdown
# wonderbear · 🛑 系统异常

**类型**:调度器停机
**时间**:2026-04-27 14:35

## 异常详情
- 单日 violations.log 累积 6 条(超过阈值 5)
- VPS Claude 已主动 exit
- systemd 已停止 auto-restart

## 当前状态
- 所有 Factory Agent 收到 HALT 信号已退出
- coordination/orchestrator-shutdown-{timestamp}.md 已写入

## 你的操作
1. SSH 到 VPS:`ssh wonderbear-vps`
2. 看停机报告:`cat /opt/wonderbear/coordination/orchestrator-shutdown-*.md`
3. 看违规:`tail -20 /opt/wonderbear/coordination/violations.log`
4. 决定后启动:`sudo systemctl start wonderbear-orchestrator`

⚠️ 不要急着重启,先看清楚发生了什么。
```

### 3.5 📊 每日汇总(DAILY DIGEST)

**触发**:每天 09:00 cron(Asia/Shanghai 时区)

**频率**:固定 1 次 / 天

**格式**(markdown):

```markdown
# wonderbear · 📊 日报 2026-04-27

## 任务概览
- 完成:8 个 (T-010 ~ T-017)
- 失败:1 个 (T-015 - prompt 测试 case 3 失败)
- 进行中:2 个 (T-018, T-019)
- 排队:3 个

## 配额消耗
- VPS Claude (Max 20x):占用 28% / 50% 上限
- 单日 token 消耗:约 12K input / 8K output
- 估算成本:不直接计费(Max 订阅),折算约 $0.40

## 备份状态
- ✅ 03:00 每日备份完成 (snapshot-20260427-030000)
- ✅ 上次验证通过(2026-04-26 04:00)
- 📦 backup 占磁盘:3.2 GB / 70 GB 总
- 🗑️ 自动清理:7 天前 1 个备份(2026-04-20)

## 并发健康
- 平均锁持有:18 分钟
- 锁超时事件:0 次
- 冲突自动解决:2 次成功 / 0 次失败
- 转 Kristy 处理:0 次 ✅

## 异常
- ⚠️ 1 条:T-015 失败(详见对应消息)
- ✅ 0 条:违规
- ✅ 0 条:系统异常

## 待你 review
- 2 个 PR 等合 main(T-016 / T-017)
- 0 个 .env 变更等审批

总体健康度:🟢 良好
```

---

## 四、消息频率管控(对齐 §8.2 预算)

### 4.1 上限规则

| 时间窗口 | 单一类型上限 | 总上限 |
|---|---|---|
| 1 小时 | 单类型 ≤ 10 条 | 总 ≤ 30 条 |
| 1 天 | 单类型 ≤ 50 条 | 总 ≤ 100 条 |

超过上限 → 切**降级模式**:
- 完工通知:合并发(每小时一条 batch)
- 系统异常:仍然发(必须保证)
- 每日汇总:仍然发

### 4.2 防消息洪水

VPS Claude 发钉钉消息前自查:

```
1. 这条消息是否是关键节点?(不是 → 不发,留给日报合并)
2. 同样内容的消息过去 30 分钟内发过吗?(发过 → 不重发)
3. 当前小时发了几条?(超 30 → 进入降级)
```

### 4.3 静默时段

凌晨 23:00 - 早 8:00:**只发系统异常**,其他消息攒到 09:00 日报。

理由:Kristy 不应该被半夜的"完工通知"吵醒(教训 19 凌晨纪律)。

但 🛑 系统异常**必须立刻发**(磁盘满、调度器停机这种不能等)。

---

## 五、消息内容质量要求

### 5.1 强制包含

每条钉钉消息必须包含:

```
□ "wonderbear" 关键词(钉钉拒收过滤)
□ 类型 emoji (🟢/🔴/🟡/🛑/📊)
□ 任务 ID(如有)
□ 时间(精确到分钟)
□ "你的操作"段落(如需 Kristy 介入)
```

### 5.2 数据 4 维度(对齐 AGENTS.md §3.1)

涉及定价 → 必须 model + quality + resolution + 单位

```
✅ 正确:
"Nano Banana 1024x1024 1张 $0.039"

❌ 错的:
"图像生成成本 $0.04"
"图像费用大约 4 分"
```

### 5.3 失败二元数字(§3.2)

涉及失败统计 → 必须 N/M 形式

```
✅ 正确:"测试 case 8/10 通过,2 个失败"
❌ 错的:"测试基本通过"
```

### 5.4 不允许的内容

```
❌ 推完整代码 diff(太长,放 PR)
❌ 推完整错误堆栈(太长,放 failed/ 文件链接)
❌ 推 token / API key(安全)
❌ 推 R2 object 完整 URL(占空间)
❌ 推情绪化语言("失败了真糟糕")
❌ 推过多 emoji(每条 ≤ 5 个)
```

---

## 六、Kristy 反向控制(钉钉 → VPS Claude)

### 6.1 设计目标

Kristy 在钉钉发命令,VPS Claude 收到并执行。

### 6.2 实现方式(简化版,Phase 1)

**Phase 1 不做**反向 webhook(需要建一个 endpoint 接钉钉回调,复杂)。

**简化方式**:Kristy 钉钉发完指令后,**SSH 到 VPS 写信号文件**:

```bash
ssh wonderbear-vps
```

批准任务:
```bash
echo "approved" > /opt/wonderbear/coordination/responses/T-020.response
```

拒绝任务:
```bash
echo "denied" > /opt/wonderbear/coordination/responses/T-020.response
```

紧急停止:
```bash
touch /opt/wonderbear/coordination/HALT.signal
```

VPS Claude 巡检时**自动**读这些文件,做对应处理。

### 6.3 Phase 2(后续优化)

- 部署一个简单的 webhook server(Fastify)
- 接钉钉的"消息回调"
- Kristy 直接在钉钉点按钮 / 回复文字
- 解析后写到 coordination/responses/

不在 Phase 1 范围。

---

## 七、消息发送代码模板

### 7.1 bash 函数(VPS Claude 用的)

文件:`/opt/wonderbear-tools/notify.sh`

```bash
#!/bin/bash
# WonderBear 钉钉通知工具

WEBHOOK_URL="https://oapi.dingtalk.com/robot/send?access_token=${DINGTALK_TOKEN}"

# 必含关键词检查
notify_text() {
    local content="$1"
    if [[ "$content" != *"wonderbear"* ]]; then
        echo "❌ 钉钉消息缺少 wonderbear 关键词,拒发" >&2
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
        echo "❌ 钉钉消息缺少 wonderbear 关键词,拒发" >&2
        return 1
    fi
    
    curl -s -X POST "$WEBHOOK_URL" \
        -H "Content-Type: application/json" \
        -d "$(jq -n --arg t "$title" --arg c "$content" \
            '{msgtype:"markdown",markdown:{title:$t,text:$c}}')"
}
```

调用例:

```bash
source /opt/wonderbear-tools/notify.sh
```
```bash
notify_markdown "wonderbear · 完工 ✅ T-015" "$(cat <<'EOF'
# wonderbear · 完工 ✅ T-015

**任务**:改 LLM system prompt
...
EOF
)"
```

### 7.2 频率检查(notify-with-quota.sh)

```bash
#!/bin/bash
# 带频率限制的通知

LOG_FILE=/var/log/wonderbear-notify.log
HOUR=$(date +%Y%m%d-%H)

# 当前小时已发数
COUNT=$(grep "^$HOUR " "$LOG_FILE" 2>/dev/null | wc -l)

if [ "$COUNT" -ge 30 ]; then
    echo "⚠️ 当前小时已发 30 条,进入降级模式"
    # 记录到待发队列
    echo "$@" >> /opt/wonderbear/coordination/notify-queue.txt
    exit 0
fi

# 发送
notify_markdown "$@"

# 记录
echo "$HOUR $(date +%H:%M:%S) $1" >> "$LOG_FILE"
```

---

## 八、消息测试(部署前必做)

### 8.1 烟雾测试

部署完调度器后,跑一次:

```bash
source /opt/wonderbear-tools/notify.sh
```
```bash
notify_text "wonderbear: 钉钉链路烟雾测试 - $(date)"
```

钉钉群应该立刻收到。如果没收到:
- 检查 token 是否正确
- 检查关键词是否含 wonderbear
- 检查 VPS 出网是否通 oapi.dingtalk.com

### 8.2 5 类消息测试

依次跑(每条等 3 秒):

```bash
notify_markdown "wonderbear 测试 1/5" "🟢 完工通知测试"
```
```bash
sleep 3
```
```bash
notify_markdown "wonderbear 测试 2/5" "🔴 失败警报测试"
```
```bash
sleep 3
```
```bash
notify_markdown "wonderbear 测试 3/5" "🟡 需审批测试"
```
```bash
sleep 3
```
```bash
notify_markdown "wonderbear 测试 4/5" "🛑 系统异常测试"
```
```bash
sleep 3
```
```bash
notify_markdown "wonderbear 测试 5/5" "📊 日报测试"
```

钉钉应收到 5 条,每条 emoji 不同,样式区分明显。

---

## 九、不发钉钉的情况

### 9.1 ❌ 不要发

| 不发的事 | 替代方案 |
|---|---|
| 任务进度 25% / 50% / 75% | 静默 |
| 锁申请 / 锁批准 | 静默(只在 coordination/) |
| Push queue 排队 | 静默 |
| PR 已创建 | 合并到完工通知里 |
| 配额消耗 1% / 2% / 3% | 静默(超 80% 才推) |
| 心跳 / 健康检查 | 只在每日汇总里 |

### 9.2 静默策略保证消息密度

预期消息数(正常一天):

```
✅ 完工:5-15 条
❌ 失败:0-2 条
🟡 审批:0-3 条
🛑 异常:0 条(理想)
📊 日报:1 条

合计:6-21 条 / 天
```

---

## 自查清单(对齐 AGENTS.md)

- [✓] §1.1 决策权边界:§3.3 需审批章节明确触发条件
- [✓] §2.4 透明报告:§3.2 失败警报 + §3.4 系统异常
- [✓] §3.1 数据精度 4 维度:§5.2 强制
- [✓] §3.2 二元数字:§5.3 强制
- [✓] §5.1 工具是纪律的物质载体:§7.1 关键词强制 + §7.2 频率检查
- [✓] §7.3 消息格式:本文档定义钉钉版的格式
- [✓] §8.2 预算控制:§4 频率管控
- [✓] 教训 19:凌晨静默时段(§4.3)

**违反检查**:本文档无违反 AGENTS.md 的内容。

---

**By**: 主控台 Claude(网页端)+ Kristy
**版本**: v1.0
**Refs**: AGENTS.md §3.1 / §3.2 / §7.3 / §8.2, 教训 19
