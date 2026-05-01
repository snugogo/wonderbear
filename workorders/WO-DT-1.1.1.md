# WO-DT-1.1.1: 修复 ack/done 矛盾（done 状态前置检查）

**目标**：派单时如果工单已完成（done/ 下有 report），**不发"正在派"ack**，直接返回"已完成"错误。修复 WO-DT-1.1 留下的"两条矛盾消息"问题。

**改动范围**：
1. `dingtalk-bot/src/factory-dispatch.js`：抽出 `checkAlreadyDone()` 公共函数
2. `dingtalk-bot/src/command-router.js`：handleDispatch 里 ack 之前调一下

**改动总量**：约 13 行（纯增量，不破坏现有逻辑）

**风险等级**：极低（只是把已有的 done 检查"前移"，逻辑等价）

**前置条件**：
- WO-DT-1.1 已上线（v0.9.2 + ack 改造）
- dingtalk-bot working tree 干净
- 备份锚点 `*.backup-2026-04-30-wodt11-pre` 存在

---

## §1 背景

### 当前 bug（WO-DT-1.1 留下的）

派单流程：
```
钉钉发 "派 WO-DT-1.1"
  ↓
handleDispatch(content, sessionWebhook, atUserId, replyFn)
  ├── resolveWorkorderId(content) → 通过（工单存在）
  ├── 立即 ack: "📥 已收到，正在派 Factory: WO-DT-1.1"   ← 已发！
  ├── factoryDispatch.dispatch(r.id)
  │   └── 检查 coordination/done/WO-DT-1.1-report.md → 已存在
  │   └── 返回 { ok: false, reason: '工单已完成...' }
  └── return '❌ 工单已完成: WO-DT-1.1-report.md\n如需重派请先归档老报告。'
```

**结果**：用户在钉钉看到两条**互相矛盾**的消息：
- `📥 已收到，正在派 Factory: WO-DT-1.1`
- `❌ 工单已完成: WO-DT-1.1-report.md`

### 修复思路

把 done 状态检查**前移**到 ack 之前。如果工单已完成，**直接返回错误，不发 ack**。

---

## §2 改动列表

### §2.1 改动 1 — `factory-dispatch.js` 抽出 checkAlreadyDone 函数

**文件**：`/opt/wonderbear/dingtalk-bot/src/factory-dispatch.js`

**位置**：在文件顶部 const 声明区之后、`loadDispatched()` 之前（约 line 12-14）插入新函数。

**当前**（line 12-14 附近）：
```javascript
const COORDINATION_DIR = '/opt/wonderbear/coordination/workorders';
const DONE_DIR = '/opt/wonderbear/coordination/done';
const DISPATCH_LOG = '/tmp/wonderbear-dispatched.json';
const DROID_CLI = '/root/.local/bin/droid';

// 读已派单记录
function loadDispatched() {
```

**改成**：在 `function loadDispatched()` 之前插入新函数：
```javascript
const COORDINATION_DIR = '/opt/wonderbear/coordination/workorders';
const DONE_DIR = '/opt/wonderbear/coordination/done';
const DISPATCH_LOG = '/tmp/wonderbear-dispatched.json';
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

**为什么这样改**：
- 把 dispatch() line 60-65 那段 done 检查**抽出来**，命名为 `checkAlreadyDone`
- 让 router 在 ack 之前能直接调用
- 这是**纯重构**，不改 dispatch() 自己的逻辑

---

### §2.2 改动 2 — `factory-dispatch.js` module.exports 加 checkAlreadyDone

**文件**：`/opt/wonderbear/dingtalk-bot/src/factory-dispatch.js`

**位置**：文件末尾 `module.exports = { ... }`（约 line 138-145）

**当前**：
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

**改成**：
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

**为什么这样改**：暴露新函数给 router 用。

---

### §2.3 改动 3 — `command-router.js` handleDispatch 提前 done 检查

**文件**：`/opt/wonderbear/dingtalk-bot/src/command-router.js`

**位置**：`handleDispatch` 函数（line 22-35，WO-DT-1.1 改过的版本）

**当前**：
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

**改成**：
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

**为什么这样改**：
- 在 ack 之前先 `checkAlreadyDone`
- 已完成 → 直接 return 错误消息（钉钉只收到 ❌，不收到 📥）
- 未完成 → 走原来的 ack + dispatch 流程
- 错误消息文案保持和 dispatch() 内部一致（"❌ 工单已完成: ... 如需重派请先归档老报告。"）

---

## §3 红线

不要碰：
- `factory-dispatch.js` 的 `dispatch()` 函数 line 60-65 那段已有的 done 检查（**保留**——作为双保险，万一 router 漏调 checkAlreadyDone 还能拦住）
- `factory-dispatch.js` 的其它任何函数（resolveWorkorderId / cancel / listRunning 等）
- `command-router.js` 的其它任何函数（handleProgress / handleLogs / handleRestart / handleCancel / handleHelp / route）
- `index.js` 任何代码（这次工单完全不动 index.js）
- 所有 `*.backup-2026-04-30-wodt11-pre` 备份文件

不要重构：
- 不要把 dispatch() 里那段 done 检查删了——那是双保险，留着
- 不要改 ack 文案
- 不要改 done 检查的判断标准（仍然用 `coordination/done/<workorderId>-report.md` 是否存在）

---

## §4 备份纪律

改动前必须 cp 备份（基于 WO-DT-1.1 改后的版本）：
```bash
cp /opt/wonderbear/dingtalk-bot/src/factory-dispatch.js \
   /opt/wonderbear/dingtalk-bot/src/factory-dispatch.js.backup-2026-04-30-wodt111-pre

cp /opt/wonderbear/dingtalk-bot/src/command-router.js \
   /opt/wonderbear/dingtalk-bot/src/command-router.js.backup-2026-04-30-wodt111-pre
```

注意：备份后缀是 `wodt111-pre`（区别于 WO-DT-1.1 的 `wodt11-pre`），不要覆盖 WO-DT-1.1 的备份。

---

## §5 Dry-run 校验

```bash
cd /opt/wonderbear/dingtalk-bot
node --check src/factory-dispatch.js  # 应输出空
node --check src/command-router.js    # 应输出空
```

任何语法错误 → 立刻回滚，不要 pm2 reload。

---

## §6 改动总行数预估

```
src/factory-dispatch.js: +12 -0 = net +12 行  (新增 checkAlreadyDone + export)
src/command-router.js:   +6  -0 = net +6  行  (handleDispatch 加 done 前置检查)
─────────────────────────────────────
总计 ≈ 18 行 (≤ 30 上限 ✅)
```

---

## §7 完成后请写报告到

`/opt/wonderbear/coordination/done/WO-DT-1.1.1-report.md`

报告包含：
1. 改动概览（3 项各自的改前/改后代码片段）
2. 备份文件列表（应有 2 个 .backup-2026-04-30-wodt111-pre）
3. node --check 输出（应 2 个都 exit 0）
4. **不要 pm2 reload**（restart 由 Kristy 手动执行）
5. 改动总行数

---

## §9 验收

### §9.1 自动验证（verify.sh 跑）

verify.sh 验证 6 项：
1. factory-dispatch.js 中 `function checkAlreadyDone(workorderId)` 存在
2. factory-dispatch.js 中 `module.exports` 暴露 `checkAlreadyDone`
3. command-router.js 中 `factoryDispatch.checkAlreadyDone` 调用存在
4. command-router.js 中 done 检查在 ack 调用之前（行号比较）
5. 备份文件就位（2 个 wodt111-pre）
6. node --check 双语法校验

### §9.2 .env 改动
**无**

### §9.3 pm2 reload 验证

由 Kristy 手动执行：
```bash
ssh wonderbear-vps "pm2 reload wonderbear-dingtalk && sleep 3 && pm2 logs wonderbear-dingtalk --lines 20 --nostream"
```

预期 boot log 看到：
- `[BOOT] DingTalk bot v0.9.2 ...`
- `[READY] DingTalk Stream connected`
- 不能有 SyntaxError / ReferenceError

### §9.4 钉钉实测（核心成功标准）

**测试 A：派一个已完成的工单**

钉钉发：`派 WO-DT-1.1`

**预期**：钉钉**只**收到 1 条消息：
```
❌ 工单已完成: WO-DT-1.1-report.md
如需重派请先归档老报告。
```

**关键**：**不应该看到 `📥 已收到，正在派 Factory: WO-DT-1.1`** 这条 ack。

**测试 B：派一个未完成的工单**（验证不破坏正常派单）

钉钉发：`派 WO-DT-1.1.1`（**前提**：本工单运行时 done/ 下还没有 WO-DT-1.1.1-report.md）

**预期**：
- 1 秒内看到 `📥 已收到，正在派 Factory: WO-DT-1.1.1`
- 几秒后看到 `✅ 已派 Factory PID=...`

如果测试 A 还能看到 ack → 失败，回滚
如果测试 B 看不到 ack → 失败，回滚

---

## §10 回滚

如果 §9.3 boot 报错 / §9.4 任一项失败：

```bash
ssh wonderbear-vps "
cp /opt/wonderbear/dingtalk-bot/src/factory-dispatch.js.backup-2026-04-30-wodt111-pre \
   /opt/wonderbear/dingtalk-bot/src/factory-dispatch.js && \
cp /opt/wonderbear/dingtalk-bot/src/command-router.js.backup-2026-04-30-wodt111-pre \
   /opt/wonderbear/dingtalk-bot/src/command-router.js && \
pm2 reload wonderbear-dingtalk
"
```

---

End of WO-DT-1.1.1.
