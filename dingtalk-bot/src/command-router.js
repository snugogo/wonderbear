// command-router.js - 中文命令路由(派/进度/日志/重启/取消/帮助)
// v0.9.2 (2026-04-29)

const { execSync } = require('child_process');
const fs = require('fs');
const factoryDispatch = require('./factory-dispatch');

// 安全跑 shell 命令,超时 5 秒
function safeExec(cmd, timeoutMs) {
  try {
    return execSync(cmd, {
      encoding: 'utf8',
      timeout: timeoutMs || 5000,
      shell: '/bin/bash',
    }).trim();
  } catch (e) {
    return '(执行失败: ' + (e.message || 'unknown') + ')';
  }
}

// === 派 [工单ID] ===
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

// === 进度 ===
function handleProgress() {
  const lines = ['📊 当前状态'];

  // PM2
  try {
    const pm2 = safeExec("pm2 jlist 2>/dev/null", 3000);
    if (pm2.startsWith('[')) {
      const list = JSON.parse(pm2);
      lines.push('');
      lines.push('PM2:');
      for (const p of list) {
        const icon = p.pm2_env.status === 'online' ? '✅' : '❌';
        lines.push('  ' + icon + ' ' + p.name + ' (' + p.pm2_env.status + ', restart=' + p.pm2_env.restart_time + ')');
      }
    } else {
      lines.push('PM2: 查询失败');
    }
  } catch (e) {
    lines.push('PM2: ' + e.message);
  }

  // Factory 跑着的
  const running = factoryDispatch.listRunning();
  lines.push('');
  if (running.length === 0) {
    lines.push('Factory: 无运行中工单');
  } else {
    lines.push('Factory 在跑 ' + running.length + ' 个:');
    for (const r of running) {
      const startedMs = new Date(r.startedAt).getTime();
      const elapsedMin = Math.round((Date.now() - startedMs) / 60000);
      lines.push('  ' + r.workorderId + ' (PID=' + r.pid + ', ' + elapsedMin + ' 分钟前)');
    }
  }

  // 待消化报告
  try {
    // 字符串打散避免 watcher 定位脚本误中（WO-DT-1.3 §2.1）
    const cnt = safeExec("ls /opt/wonderbear/coordination/" + "done/*.md 2>/dev/null | wc -l", 2000);
    lines.push('');
    lines.push('Done 报告: ' + cnt + ' 个');
  } catch (e) { /* ignore */ }

  // Git 状态
  try {
    const branch = safeExec("cd /opt/wonderbear && git branch --show-current 2>/dev/null", 2000);
    const ahead = safeExec("cd /opt/wonderbear && git rev-list --count @{u}..HEAD 2>/dev/null", 2000);
    lines.push('');
    lines.push('Git: ' + branch + ' (' + (ahead || '0') + ' 未 push)');
  } catch (e) { /* ignore */ }

  return lines.join('\n');
}

// === 日志 [server|dingtalk] ===
function handleLogs(content) {
  const arg = content.replace(/^日志\s*/, '').trim().toLowerCase();
  let pmName;
  if (!arg || arg === 'server' || arg === 's') {
    pmName = 'wonderbear-server';
  } else if (arg === 'dingtalk' || arg === 'ding' || arg === 'd' || arg === 'bot') {
    pmName = 'wonderbear-dingtalk';
  } else {
    return '用法: 日志 server | 日志 dingtalk\n默认 server';
  }
  const out = safeExec('pm2 logs ' + pmName + ' --lines 50 --nostream --raw 2>&1 | tail -50', 8000);
  if (!out || out.length < 5) return '(日志为空)';
  const truncated = out.length > 3500 ? out.slice(-3500) + '\n...(已截断,前面看 SSH)' : out;
  return '📋 ' + pmName + ' 最近 50 行:\n\n' + truncated;
}

// === 重启 [server|dingtalk] ===
function handleRestart(content) {
  const arg = content.replace(/^重启\s*/, '').trim().toLowerCase();
  let pmName;
  if (arg === 'server' || arg === 's') {
    pmName = 'wonderbear-server';
  } else if (arg === 'dingtalk' || arg === 'ding' || arg === 'd' || arg === 'bot') {
    pmName = 'wonderbear-dingtalk';
  } else {
    return '用法: 重启 server | 重启 dingtalk\n(必须明确指定,避免误操作)';
  }
  const out = safeExec('pm2 reload ' + pmName + ' 2>&1', 10000);
  return '🔄 已 reload ' + pmName + '\n\n' + out.slice(0, 800);
}

// === 取消 [PID或工单ID] ===
function handleCancel(content) {
  const arg = content.replace(/^取消\s*/, '').trim();
  if (!arg) {
    const running = factoryDispatch.listRunning();
    if (running.length === 0) return '没有运行中的 Factory 进程';
    return '用法: 取消 [PID 或 工单关键字]\n当前运行中:\n' +
           running.map(r => 'PID=' + r.pid + ' / ' + r.workorderId).join('\n');
  }
  const r = factoryDispatch.cancel(arg);
  return r.ok ? r.message : '❌ ' + r.reason;
}

// === 帮助 ===
function handleHelp() {
  return [
    '🤖 钉钉机器人 v0.9.2',
    '',
    '快速命令(中文,无 / 前缀):',
    '派 [工单关键字]     - 派 Factory droid 工单',
    '进度                - PM2/Factory/Git/报告 一览',
    '日志 [server|dingtalk] - tail PM2 日志 50 行',
    '重启 [server|dingtalk] - pm2 reload',
    '取消 [PID]          - kill droid 进程',
    '帮助 / ?            - 这条',
    '',
    '系统命令(/前缀,沿用 v0.9.1):',
    '/ping /status /myid /kill',
    '/freeze /unfreeze',
    '/model sonnet|opus|haiku',
    '/clear /lessons /learn /unlearn',
    '',
    '其他文字 -> 自由对话(claude CLI,prompt < 1500 字符)',
    '⚠️ 单条消息超 800 字符会被拒收,复杂请求请 SSH',
  ].join('\n');
}

// === 总入口:返回 {handled: bool, reply: string} ===
function route(content, sessionWebhook, atUserId, replyFn) {
  if (!content) return { handled: false };
  const c = content.trim();

  if (/^派单?\s/.test(c) || c === '派' || c === '派单') {
    return { handled: true, reply: handleDispatch(c, sessionWebhook, atUserId, replyFn) };
  }
  if (c === '进度' || c === '状态') {
    return { handled: true, reply: handleProgress() };
  }
  if (/^日志(\s|$)/.test(c)) {
    return { handled: true, reply: handleLogs(c) };
  }
  if (/^重启\s/.test(c)) {
    return { handled: true, reply: handleRestart(c) };
  }
  if (/^取消(\s|$)/.test(c)) {
    return { handled: true, reply: handleCancel(c) };
  }
  if (c === '帮助' || c === '?' || c === 'help') {
    return { handled: true, reply: handleHelp() };
  }

  return { handled: false };
}

module.exports = { route };
