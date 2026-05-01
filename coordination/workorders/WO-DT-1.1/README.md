# WO-DT-1.1: 钉钉机器人慢命令立即 ack（B 范围）

**目标**：所有需要调 claude CLI / spawn Factory 的命令，**进入处理前 1 秒内**回钉钉一条"📥 已收到"，让 Kristy 看到反馈。

**改动范围**：4 条慢命令的 ack：
1. `派 WO-X`（dispatch）
2. `/sync <text>`
3. `/learn <text>`
4. `/status-refresh`

**改动文件**：`dingtalk-bot/src/command-router.js` + `dingtalk-bot/src/index.js`

**改动总量**：约 25-30 行（纯增量）

**风险等级**：低（只加防御性 ack，不改主路径）

---

## §1 背景

### 现状（v0.9.2）
所有"调 claude CLI / spawn Factory"的命令都是**先同步处理 → 完成后才回复**。处理时间 5-60 秒不等，期间 Kristy 在钉钉看不到任何反馈，以为机器人死了。

**已有反馈但太晚**：
- 自由对话：line 467 已有 `🤖 处理中...`（在 gate check 之后才发，OK）
- `/status-refresh`：line 451 有 `🔍 发现 N 个未消化的报告...`（也是 OK）

**完全没反馈**：
- 派单：handleDispatch 同步等 spawn droid，全程闭口
- `/sync`：line 426 直接 runClaude，等 60 秒才回
- `/learn`：line 519 直接 runClaude，等 60 秒才回

### 自由对话样板（参考）
```javascript
await reply(sessionWebhook, `🤖 处理中... (今日 ${gate.used}/${gate.limit} | 模型 ${model}...`);
```
关键模式：**调 runClaude 前先 reply**，不 await runClaude（runClaude 用 callback）。

---

## §2 改动列表

### §2.1 改动 1：command-router.js — handleDispatch 提前 ack

**文件**：`/opt/wonderbear/dingtalk-bot/src/command-router.js`
**位置**：line 22-29（`handleDispatch` 函数）

**当前**：
```javascript
function handleDispatch(content) {
  const r = factoryDispatch.resolveWorkorderId(content);
  if (!r.ok) return r.reason;
  const d = factoryDispatch.dispatch(r.id);
  if (!d.ok) return '❌ ' + d.reason;
  return d.message;
}
```

**改成**：
```javascript
function handleDispatch(content, sessionWebhook, atUserId, replyFn) {
  const r = factoryDispatch.resolveWorkorderId(content);
  if (!r.ok) return r.reason;

  // 立即 ack，让 Kristy 看到反馈（不 await，fire-and-forget，失败不影响派单）
  if (replyFn && sessionWebhook) {
    replyFn(sessionWebhook, '📥 已收到，正在派 Factory: ' + r.id, atUserId)
      .catch(e => console.error('[ACK-DISPATCH] failed:', e.message));
  }

  const d = factoryDispatch.dispatch(r.id);
  if (!d.ok) return '❌ ' + d.reason;
  return d.message;
}
```

**为什么这样改**：加 3 个新参数（向后兼容），ack 用 fire-and-forget 不阻塞主流程。

---

### §2.2 改动 2：command-router.js — route 函数透传参数

**文件**：`/opt/wonderbear/dingtalk-bot/src/command-router.js`
**位置**：line 158-180（`route` 函数）

**当前**：
```javascript
function route(content) {
  if (!content) return { handled: false };
  const c = content.trim();

  if (/^派单?\s/.test(c) || c === '派' || c === '派单') {
    return { handled: true, reply: handleDispatch(c) };
  }
  // ... 其它命令保持不变
}
```

**改成**：
```javascript
function route(content, sessionWebhook, atUserId, replyFn) {
  if (!content) return { handled: false };
  const c = content.trim();

  if (/^派单?\s/.test(c) || c === '派' || c === '派单') {
    return { handled: true, reply: handleDispatch(c, sessionWebhook, atUserId, replyFn) };
  }
  // ... 其它命令保持不变（不传 ack 参数，因为它们都是同步快命令）
}
```

**为什么这样改**：route 加 3 个参数，只把它们传给 handleDispatch。其它命令（进度/日志/重启/取消/帮助）本来就快（grep / pm2 jlist），不需要 ack。

---

### §2.3 改动 3：index.js — 调用 route 时传参数

**文件**：`/opt/wonderbear/dingtalk-bot/src/index.js`
**位置**：line 391

**当前**：
```javascript
const routed = commandRouter.route(effectiveContent);
```

**改成**：
```javascript
const routed = commandRouter.route(effectiveContent, sessionWebhook, senderStaffId, reply);
```

---

### §2.4 改动 4：index.js — /sync 命令提前 ack

**文件**：`/opt/wonderbear/dingtalk-bot/src/index.js`
**位置**：line 419-440（`if (content.startsWith('/sync ')) { ... }` 块）

**当前**：
```javascript
if (content.startsWith('/sync ')) {
  const text = content.slice(6).trim();
  if (!text) {
    await reply(sessionWebhook, '用法: /sync 我刚才在外面做了什么(我会自动整理成进度条目)', senderStaffId);
    return { status: EventAck.SUCCESS, message: 'OK' };
  }
  const syncPrompt = `Kristy 让你同步一条外部进度。她说:\n\n${text}\n\n请整理成 STATUS.md 标准格式...`;
  runClaude(syncPrompt, 'sonnet', async (err, output) => {
    // ...
  });
  return { status: EventAck.SUCCESS, message: 'OK' };
}
```

**改成**：在 `runClaude` 之前**插入一行 ack**（不 await）：
```javascript
if (content.startsWith('/sync ')) {
  const text = content.slice(6).trim();
  if (!text) {
    await reply(sessionWebhook, '用法: /sync 我刚才在外面做了什么(我会自动整理成进度条目)', senderStaffId);
    return { status: EventAck.SUCCESS, message: 'OK' };
  }

  // 立即 ack
  reply(sessionWebhook, '📥 已收到，正在整理进度...', senderStaffId)
    .catch(e => console.error('[ACK-SYNC] failed:', e.message));

  const syncPrompt = `Kristy 让你同步一条外部进度。她说:\n\n${text}\n\n请整理成 STATUS.md 标准格式...`;
  runClaude(syncPrompt, 'sonnet', async (err, output) => {
    // ...（保持不变）
  });
  return { status: EventAck.SUCCESS, message: 'OK' };
}
```

**为什么这样改**：runClaude 是异步 callback，**ack 在 runClaude 之前发**。完工后 callback 会再发一条带 STATUS_UPDATE 结果的——两条消息进度感清晰。

---

### §2.5 改动 5：index.js — /learn 命令提前 ack

**文件**：`/opt/wonderbear/dingtalk-bot/src/index.js`
**位置**：line 510-540（`if (content.startsWith('/learn ')) { ... }` 块）

**当前**：
```javascript
if (content.startsWith('/learn ')) {
  const text = content.slice(7).trim();
  if (!text) {
    await reply(sessionWebhook, '用法: /learn 教训内容', senderStaffId);
    return { status: EventAck.SUCCESS, message: 'OK' };
  }
  const learnPrompt = `Kristy 让你记录一条教训。她说的是:\n\n${text}\n\n请把它整理成 LESSONS.md 的标准格式...`;
  runClaude(learnPrompt, 'sonnet', async (err, output) => {
    // ...
  });
  return { status: EventAck.SUCCESS, message: 'OK' };
}
```

**改成**：在 `runClaude` 之前插入一行 ack：
```javascript
if (content.startsWith('/learn ')) {
  const text = content.slice(7).trim();
  if (!text) {
    await reply(sessionWebhook, '用法: /learn 教训内容', senderStaffId);
    return { status: EventAck.SUCCESS, message: 'OK' };
  }

  // 立即 ack
  reply(sessionWebhook, '📥 已收到，正在整理教训...', senderStaffId)
    .catch(e => console.error('[ACK-LEARN] failed:', e.message));

  const learnPrompt = `Kristy 让你记录一条教训。她说的是:\n\n${text}\n\n请把它整理成 LESSONS.md 的标准格式...`;
  runClaude(learnPrompt, 'sonnet', async (err, output) => {
    // ...（保持不变）
  });
  return { status: EventAck.SUCCESS, message: 'OK' };
}
```

---

### §2.6 改动 6：index.js — /status-refresh 命令优化 ack

**文件**：`/opt/wonderbear/dingtalk-bot/src/index.js`
**位置**：line 444-470（`if (content === '/status-refresh') { ... }` 块）

**当前**：
```javascript
if (content === '/status-refresh') {
  const reports = statusHelper.scanFactoryReports(10);
  if (reports.length === 0) {
    await reply(sessionWebhook, '🔍 coordination/done/ 没有未消化的 Factory 报告', senderStaffId);
    return { status: EventAck.SUCCESS, message: 'OK' };
  }
  const reportList = reports.map(r => `- ${r.name} ...`).join('\n');
  await reply(sessionWebhook, `🔍 发现 ${reports.length} 个未消化的 Factory 报告:\n\n${reportList}\n\n我接下来会逐个读取并整理到 STATUS.md (这会烧 ${reports.length} 次 token)`, senderStaffId);

  for (const report of reports) {
    // ... 同步串行处理
  }
}
```

**当前实际**：scanFactoryReports 本身就快（~1 秒），**已有的 "🔍 发现 N 个" reply 在快命令之后立即发**——其实 timing 是可接受的。

**改动建议**：**只在 scanFactoryReports 之前加一条更早的 ack**，因为如果 done/ 目录大，scan 也可能慢：
```javascript
if (content === '/status-refresh') {
  // 立即 ack（scanFactoryReports 偶尔慢）
  reply(sessionWebhook, '📥 已收到，正在扫描 done/ 目录...', senderStaffId)
    .catch(e => console.error('[ACK-REFRESH] failed:', e.message));

  const reports = statusHelper.scanFactoryReports(10);
  if (reports.length === 0) {
    await reply(sessionWebhook, '🔍 coordination/done/ 没有未消化的 Factory 报告', senderStaffId);
    return { status: EventAck.SUCCESS, message: 'OK' };
  }
  // ... 后续保持不变
}
```

---

## §3 红线

不要碰：
- `factory-dispatch.js` 任何代码（dispatch / cancel / listRunning 等）
- `done-watcher.js`（这是 WO-DT-1.3 的范围）
- `index.js` 中**自由对话**那段（line 460-540 已有 `🤖 处理中...` ack，不要重复加）
- `index.js` 中所有 `/ping` `/status` `/myid` `/kill` `/freeze` `/clear` `/lessons` `/unlearn` `/model` `/archive-status` `/status-show` 命令（这些都很快，不需要 ack）
- `command-router.js` 中除 `handleDispatch` 和 `route` 之外的任何函数（handleProgress / handleLogs / handleRestart / handleCancel / handleHelp 都不动——它们也很快）

不要重构：
- 不要把 ack 抽成 helper 函数
- 不要给 `/lessons` `/unlearn` `/learn 没参数` 等"快回退路径"加 ack
- 不要改 `await reply()` 为 `reply()`（那是性能优化，不在本工单范围）

---

## §4 备份纪律

改动前必须 cp 备份：
```bash
cp /opt/wonderbear/dingtalk-bot/src/command-router.js \
   /opt/wonderbear/dingtalk-bot/src/command-router.js.backup-2026-04-30-wodt11-pre

cp /opt/wonderbear/dingtalk-bot/src/index.js \
   /opt/wonderbear/dingtalk-bot/src/index.js.backup-2026-04-30-wodt11-pre
```

---

## §5 Dry-run 校验

改完之后，在 pm2 reload 之前必须跑：

```bash
cd /opt/wonderbear/dingtalk-bot
node --check src/command-router.js  # 应输出空（语法 OK）
node --check src/index.js           # 应输出空（语法 OK）
```

如果有语法错误，**立刻回滚**，不要 pm2 reload。

---

## §6 改动总行数预估

```
src/command-router.js: +9 -2 = net +7 行   (改动 1+2)
src/index.js:          +20 -3 = net +17 行  (改动 3+4+5+6)
─────────────────────────────────────
总计 ≈ 24 行 (B 范围中等量级 ✅)
```

---

## §7 完成后请写报告到

`/opt/wonderbear/coordination/done/WO-DT-1.1-report.md`

报告至少包含：
1. 改动概览（6 项各自的"改前/改后"代码片段）
2. 备份文件列表（应有 2 个 .backup-2026-04-30-wodt11-pre）
3. `node --check` 输出（应 2 个都 exit 0）
4. **不要 pm2 reload**（restart 由 Kristy 手动执行）
5. 改动总行数

---

## §9 验收

### §9.1 自动验证（verify.sh 跑）

WO-DT-1.1-verify.sh 会自动验证 8 项：
1. command-router.js 中 `handleDispatch` 函数有 4 个参数
2. command-router.js 中 `[ACK-DISPATCH]` 字串存在
3. command-router.js 中 `route` 函数有 4 个参数
4. index.js line 391 附近 `commandRouter.route(effectiveContent, sessionWebhook,...)` 4 参数
5. index.js 中 `[ACK-SYNC]` 字串存在（改动 4）
6. index.js 中 `[ACK-LEARN]` 字串存在（改动 5）
7. index.js 中 `[ACK-REFRESH]` 字串存在（改动 6）
8. 备份文件就位（2 个 wodt11-pre）

附加：node --check 双语法校验

### §9.2 .env 改动
**无**（这次工单不涉及 .env）

### §9.3 pm2 reload 验证

由 Kristy 手动执行：
```bash
ssh wonderbear-vps "pm2 reload wonderbear-dingtalk && sleep 3 && pm2 logs wonderbear-dingtalk --lines 20 --nostream"
```

预期 boot log 看到：
- `[BOOT] DingTalk bot v0.9.2 (router+watcher) starting...`
- `[KNOWLEDGE] CLAUDE.md loaded:`
- `[READY] DingTalk Stream connected`
- **不能有任何 SyntaxError / ReferenceError**

### §9.4 浏览器/钉钉实测（核心成功标准）

Kristy 在钉钉发以下 4 条命令测试，**每条都应在 1 秒内**看到 `📥 已收到` 系列的 ack：

| 测试 | 钉钉发什么 | 预期 1 秒内看到 |
|---|---|---|
| 派单 | `派 WO-DT-1.1` 或任意工单 | `📥 已收到，正在派 Factory: <id>` |
| /sync | `/sync 测试一下同步功能` | `📥 已收到，正在整理进度...` |
| /learn | `/learn 这是测试` | `📥 已收到，正在整理教训...` |
| /status-refresh | `/status-refresh` | `📥 已收到，正在扫描 done/ 目录...` |

每条命令几秒-几十秒后还应看到第二条消息（实际处理结果）。如果**没看到 📥 那条 ack**，说明对应改动没生效。

---

## §10 回滚

如果 §9.1 失败 / §9.3 boot 报错 / §9.4 没看到 ack：

```bash
ssh wonderbear-vps "
cp /opt/wonderbear/dingtalk-bot/src/command-router.js.backup-2026-04-30-wodt11-pre \
   /opt/wonderbear/dingtalk-bot/src/command-router.js && \
cp /opt/wonderbear/dingtalk-bot/src/index.js.backup-2026-04-30-wodt11-pre \
   /opt/wonderbear/dingtalk-bot/src/index.js && \
pm2 reload wonderbear-dingtalk
"
```

---

End of WO-DT-1.1 (B scope).
