# WO-DT-1.1 完成报告 — 钉钉机器人慢命令立即 ack

**From**: Factory
**To**: Claude / Kristy
**Time**: 2026-04-30 08:10
**Refs**: `coordination/workorders/WO-DT-1.1/README.md`, AGENTS.md §2.1（备份纪律）

---

## §1 概览

按工单 §2 的 6 项改动全部应用，目标是给 4 条慢命令（派 / `/sync` / `/learn` / `/status-refresh`）在进入处理前立刻发一条 `📥 已收到` 反馈，让 Kristy 不会"以为机器人死了"。

- 范围：仅修改 `command-router.js` 与 `index.js`
- 不动：`factory-dispatch.js` / `done-watcher.js` / 自由对话路径 / 其它快命令
- 风格：fire-and-forget reply（不 await），失败 console.error 但不影响主路径
- 兼容：`route` 与 `handleDispatch` 新增 3 个参数都是可选；不传也能跑（仅 ack 不发）

---

## §2 改动详情（改前 / 改后）

### §2.1 改动 1 — `command-router.js` `handleDispatch` 提前 ack

**改前**：
```javascript
function handleDispatch(content) {
  const r = factoryDispatch.resolveWorkorderId(content);
  if (!r.ok) return r.reason;
  const d = factoryDispatch.dispatch(r.id);
  if (!d.ok) return '❌ ' + d.reason;
  return d.message;
}
```

**改后**：
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

---

### §2.2 改动 2 — `command-router.js` `route` 函数透传参数

**改前**：
```javascript
function route(content) {
  ...
  if (/^派单?\s/.test(c) || c === '派' || c === '派单') {
    return { handled: true, reply: handleDispatch(c) };
  }
```

**改后**：
```javascript
function route(content, sessionWebhook, atUserId, replyFn) {
  ...
  if (/^派单?\s/.test(c) || c === '派' || c === '派单') {
    return { handled: true, reply: handleDispatch(c, sessionWebhook, atUserId, replyFn) };
  }
```

其它命令分支（进度 / 日志 / 重启 / 取消 / 帮助）按工单要求保持不变。

---

### §2.3 改动 3 — `index.js` 调用 `route` 时传参数

**改前**（line 373）：
```javascript
const routed = commandRouter.route(effectiveContent);
```

**改后**：
```javascript
const routed = commandRouter.route(effectiveContent, sessionWebhook, senderStaffId, reply);
```

> 注：实际行号是 373（工单文档里写的 391 是参考相对位置；改动锁定的是 `commandRouter.route(effectiveContent)` 这一处唯一调用）。

---

### §2.4 改动 4 — `index.js` `/sync` 提前 ack

**改前**：
```javascript
if (content.startsWith('/sync ')) {
  const text = content.slice(6).trim();
  if (!text) {
    await reply(sessionWebhook, '用法: /sync 我刚才在外面做了什么...', senderStaffId);
    return { status: EventAck.SUCCESS, message: 'OK' };
  }
  const syncPrompt = `Kristy 让你同步一条外部进度。她说:\n\n${text}\n\n请整理成 STATUS.md 标准格式...`;
  runClaude(syncPrompt, 'sonnet', async (err, output) => { ... });
```

**改后**：
```javascript
if (content.startsWith('/sync ')) {
  const text = content.slice(6).trim();
  if (!text) {
    await reply(sessionWebhook, '用法: /sync 我刚才在外面做了什么...', senderStaffId);
    return { status: EventAck.SUCCESS, message: 'OK' };
  }

  // 立即 ack
  reply(sessionWebhook, '📥 已收到，正在整理进度...', senderStaffId)
    .catch(e => console.error('[ACK-SYNC] failed:', e.message));

  const syncPrompt = `Kristy 让你同步一条外部进度。她说:\n\n${text}\n\n请整理成 STATUS.md 标准格式...`;
  runClaude(syncPrompt, 'sonnet', async (err, output) => { ... });
```

---

### §2.5 改动 5 — `index.js` `/learn` 提前 ack

**改前**：
```javascript
if (content.startsWith('/learn ')) {
  const text = content.slice(7).trim();
  if (!text) {
    await reply(sessionWebhook, '用法: /learn 教训内容', senderStaffId);
    return { status: EventAck.SUCCESS, message: 'OK' };
  }
  const learnPrompt = `Kristy 让你记录一条教训...`;
  runClaude(learnPrompt, 'sonnet', async (err, output) => { ... });
```

**改后**：
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

  const learnPrompt = `Kristy 让你记录一条教训...`;
  runClaude(learnPrompt, 'sonnet', async (err, output) => { ... });
```

---

### §2.6 改动 6 — `index.js` `/status-refresh` 增加更早的 ack

**改前**：
```javascript
if (content === '/status-refresh') {
  const reports = statusHelper.scanFactoryReports(10);
  ...
}
```

**改后**：
```javascript
if (content === '/status-refresh') {
  // 立即 ack（scanFactoryReports 偶尔慢）
  reply(sessionWebhook, '📥 已收到，正在扫描 done/ 目录...', senderStaffId)
    .catch(e => console.error('[ACK-REFRESH] failed:', e.message));

  const reports = statusHelper.scanFactoryReports(10);
  ...
}
```

> 原有 `🔍 发现 N 个未消化的 Factory 报告...` reply 保持不变（在扫描完成后发，作为第二条进度反馈）。

---

## §3 备份文件

按 AGENTS.md §2.1 备份纪律已 cp 备份：

```
-rw-r--r-- 1 root root  5994 Apr 30 08:07 /opt/wonderbear/dingtalk-bot/src/command-router.js.backup-2026-04-30-wodt11-pre
-rw-r--r-- 1 root root 30328 Apr 30 08:07 /opt/wonderbear/dingtalk-bot/src/index.js.backup-2026-04-30-wodt11-pre
```

✅ 2 个备份文件就位。

---

## §4 `node --check` 输出

```
$ node --check /opt/wonderbear/dingtalk-bot/src/command-router.js
(空输出, exit 0)

$ node --check /opt/wonderbear/dingtalk-bot/src/index.js
(空输出, exit 0)
```

✅ 两个文件语法均通过。

---

## §5 改动总行数

```
command-router.js: +9  -2  (net +7)   — handleDispatch 加 3 参数 + ack 块；route 加 3 参数 + 调用 handleDispatch 透传
index.js:          +14 -1  (net +13)  — route 调用改 4 参数；/sync /status-refresh /learn 各加一段 ack（5+4+5）
─────────────────────────────────────
合计:              +23 -3  (net +20)
```

工单预估 ~24 行，实际 ~23 行新增 / 净 +20 行。在 B 范围中等量级 ✅。

---

## §6 验收清单（对照 §9.1 verify.sh 8 项）

| # | 验证项 | 实测 |
|---|---|---|
| 1 | command-router.js `handleDispatch(content, sessionWebhook, atUserId, replyFn)` 4 参 | ✅ |
| 2 | command-router.js `[ACK-DISPATCH]` 字串存在 | ✅ |
| 3 | command-router.js `route(content, sessionWebhook, atUserId, replyFn)` 4 参 | ✅ |
| 4 | index.js `commandRouter.route(effectiveContent, sessionWebhook, senderStaffId, reply)` 4 参 | ✅ |
| 5 | index.js `[ACK-SYNC]` 字串存在 | ✅ |
| 6 | index.js `[ACK-LEARN]` 字串存在 | ✅ |
| 7 | index.js `[ACK-REFRESH]` 字串存在 | ✅ |
| 8 | 备份文件 `*.backup-2026-04-30-wodt11-pre` 就位（2 个） | ✅ |
| extra | `node --check` 双语法校验 | ✅ exit 0 / exit 0 |

---

## §7 未做的事（按工单红线）

- ❌ **未跑 `pm2 reload wonderbear-dingtalk`** — 工单 §7 明确要求"不要 pm2 reload，restart 由 Kristy 手动执行"
- ❌ 未触碰 `factory-dispatch.js` / `done-watcher.js` / 自由对话块 / 其它快命令
- ❌ 未抽 ack 为 helper 函数 / 未把 `await reply()` 改成 `reply()` / 未给快回退路径加 ack
- ❌ 未改 `.env`（本工单无 .env 改动）

---

## §8 期望 next action

1. Kristy 在 VPS 执行：
   ```bash
   pm2 reload wonderbear-dingtalk && sleep 3 && pm2 logs wonderbear-dingtalk --lines 20 --nostream
   ```
   预期 boot log 看到 `[BOOT] DingTalk bot v0.9.2 (router+watcher) starting...` / `[KNOWLEDGE] CLAUDE.md loaded` / `[READY] DingTalk Stream connected`，无 SyntaxError / ReferenceError。

2. Kristy 在钉钉测 4 条命令（§9.4）：
   - `派 WO-DT-1.1` → 1 秒内看到 `📥 已收到，正在派 Factory: <id>`
   - `/sync 测试一下同步功能` → 1 秒内看到 `📥 已收到，正在整理进度...`
   - `/learn 这是测试` → 1 秒内看到 `📥 已收到，正在整理教训...`
   - `/status-refresh` → 1 秒内看到 `📥 已收到，正在扫描 done/ 目录...`

3. 任一项不通过 → 按 §10 回滚指令 cp 回备份并 reload。

---

End of WO-DT-1.1 report.
