# WO-DT-1.1.1 完成报告 — 修复 ack/done 矛盾（done 状态前置检查）

**From**: Factory Droid
**To**: Claude / Kristy
**Time**: 2026-04-30 08:46 UTC
**Refs**: WO-DT-1.1.1 README, AGENTS.md §2.1 备份纪律, 教训 13

---

## 1. 任务概览

把已存在于 `dispatch()` 内部的 done 检查抽出为公共函数 `checkAlreadyDone()`，并在 `command-router.handleDispatch` 的 ack 之前调用。已完成工单不再发 "📥 已收到" 又紧跟 "❌ 工单已完成" 的矛盾消息。

`dispatch()` 内部那段双保险 done 检查**保留未动**（按 §3 红线）。

---

## 2. 改动概览（3 项）

### §2.1 改动 1 — `factory-dispatch.js` 抽出 `checkAlreadyDone()`

**位置**：`/opt/wonderbear/dingtalk-bot/src/factory-dispatch.js` line 12 之后（`loadDispatched()` 之前）

**改后新增**：
```javascript
const DROID_CLI = '/root/.local/bin/droid';

// 检查工单是否已完成（done/ 下有 report.md）
// 返回 { done: true, reportName: '...' } 或 { done: false }
function checkAlreadyDone(workorderId) {
  const reportName = workorderId + '-report.md';
  const reportPath = path.join(DONE_DIR, reportName);
  if (fs.existsSync(reportPath)) {
    return { done: true, reportName };
  }
  return { done: false };
}

// 读已派单记录
function loadDispatched() {
```

### §2.2 改动 2 — `factory-dispatch.js` `module.exports` 新增 `checkAlreadyDone`

**改前**：
```javascript
module.exports = {
  resolveWorkorderId,
  dispatch,
  cancel,
  listRunning,
  listWorkorders,
  loadDispatched,
};
```

**改后**：
```javascript
module.exports = {
  resolveWorkorderId,
  dispatch,
  cancel,
  listRunning,
  listWorkorders,
  loadDispatched,
  checkAlreadyDone,
};
```

### §2.3 改动 3 — `command-router.js` `handleDispatch` 提前 done 检查

**位置**：`/opt/wonderbear/dingtalk-bot/src/command-router.js` `handleDispatch` 函数

**改前**：
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

**改后**：
```javascript
function handleDispatch(content, sessionWebhook, atUserId, replyFn) {
  const r = factoryDispatch.resolveWorkorderId(content);
  if (!r.ok) return r.reason;

  // done 状态前置检查 — 已完成的工单不发 ack，直接拒绝
  // (修复 WO-DT-1.1 的 ack/done 矛盾)
  const doneCheck = factoryDispatch.checkAlreadyDone(r.id);
  if (doneCheck.done) {
    return '❌ 工单已完成: ' + doneCheck.reportName + '\n如需重派请先归档老报告。';
  }

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

行号校验（grep 输出）：
- `factoryDispatch.checkAlreadyDone` 调用在 **line 28**
- `'📥 已收到'` ack 在 **line 35**
- 28 < 35 ✅ done 检查确实位于 ack 之前

---

## 3. 备份文件列表

```
/opt/wonderbear/dingtalk-bot/src/factory-dispatch.js.backup-2026-04-30-wodt111-pre   (5911 bytes)
/opt/wonderbear/dingtalk-bot/src/command-router.js.backup-2026-04-30-wodt111-pre    (6395 bytes)
```

后缀 `wodt111-pre` 与 WO-DT-1.1 的 `wodt11-pre` 区分，未覆盖前一份备份。

---

## 4. node --check 输出

```
$ node --check /opt/wonderbear/dingtalk-bot/src/factory-dispatch.js
(空输出, exit 0)

$ node --check /opt/wonderbear/dingtalk-bot/src/command-router.js
(空输出, exit 0)
```

两份都通过语法校验。

---

## 5. pm2 reload 状态

**未执行**（按 README §7 红线："不要 pm2 reload — restart 由 Kristy 手动执行"）。

Kristy 手动执行命令（README §9.3）：
```bash
ssh wonderbear-vps "pm2 reload wonderbear-dingtalk && sleep 3 && pm2 logs wonderbear-dingtalk --lines 20 --nostream"
```

---

## 6. 改动总行数

`diff` 实测：
- `factory-dispatch.js`：+12 lines（11 行新增 `checkAlreadyDone` 函数与注释 + 1 行 export）
- `command-router.js`：+7 lines（注释 2 行 + done check 4 行 + 1 空行）
- **合计 ≈ 19 行**（≤ 30 上限 ✅，与 README §6 预估一致）

未删除任何代码（纯增量），未触碰 `dispatch()` 内的双保险 done 检查、其它任何函数、`index.js`，以及 `wodt11-pre` 备份文件。

---

## 7. 自动验收清单（README §9.1 verify.sh 6 项手动核对）

| # | 项 | 结果 |
|---|---|---|
| 1 | `function checkAlreadyDone(workorderId)` 存在 | ✅ line 15 |
| 2 | `module.exports` 暴露 `checkAlreadyDone` | ✅ line 193 |
| 3 | `factoryDispatch.checkAlreadyDone` 在 router 中存在 | ✅ line 28 |
| 4 | done 检查行号 < ack 行号 | ✅ 28 < 35 |
| 5 | 2 个 `wodt111-pre` 备份就位 | ✅ |
| 6 | 双 node --check 通过 | ✅ |

---

## 8. 待 Kristy 执行

1. `pm2 reload wonderbear-dingtalk` — 让新逻辑生效
2. 钉钉测试 A：`派 WO-DT-1.1` → 预期**只**收到一条 `❌ 工单已完成: WO-DT-1.1-report.md`
3. 钉钉测试 B：`派 <未完成工单>` → 预期 `📥 已收到` + `✅ 已派 Factory PID=...`
4. 任一失败 → 用 README §10 回滚命令

End of WO-DT-1.1.1 report.
