// factory-dispatch.js - 派 Factory droid 工单
// v0.9.2 (2026-04-29)

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

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
  try {
    if (!fs.existsSync(DISPATCH_LOG)) return [];
    return JSON.parse(fs.readFileSync(DISPATCH_LOG, 'utf8'));
  } catch (e) {
    return [];
  }
}

// 存已派单记录
function saveDispatched(arr) {
  try {
    fs.writeFileSync(DISPATCH_LOG, JSON.stringify(arr, null, 2));
  } catch (e) {
    console.error('[FACTORY] saveDispatched failed:', e.message);
  }
}

// 列出所有可派工单
function listWorkorders() {
  try {
    if (!fs.existsSync(COORDINATION_DIR)) return [];
    return fs.readdirSync(COORDINATION_DIR)
      .filter(name => {
        const p = path.join(COORDINATION_DIR, name);
        return fs.statSync(p).isDirectory() &&
               fs.existsSync(path.join(p, 'README.md'));
      })
      .sort();
  } catch (e) {
    return [];
  }
}

// 解析用户输入 → 找到工单 ID
// 输入: "派 修LLM" 或 "派 2026-04-29-server-dialogue-llm-fix" 或 "派单 xxx"
function resolveWorkorderId(userInput) {
  const orders = listWorkorders();
  if (orders.length === 0) return { ok: false, reason: '没有任何工单 (' + COORDINATION_DIR + ' 为空)' };

  // 去除"派"或"派单"前缀
  let q = userInput.replace(/^派单?\s*/, '').trim();
  if (!q) return { ok: false, reason: '请指定工单。可用工单:\n' + orders.map(o => '• ' + o).join('\n') };

  // 1. 完全匹配
  if (orders.includes(q)) return { ok: true, id: q };

  // 2. 包含匹配(忽略大小写)
  const ql = q.toLowerCase();
  const matches = orders.filter(o => o.toLowerCase().includes(ql));
  if (matches.length === 1) return { ok: true, id: matches[0] };
  if (matches.length > 1) {
    return { ok: false, reason: '匹配到 ' + matches.length + ' 个工单,请精确指定:\n' + matches.map(o => '• ' + o).join('\n') };
  }
  return { ok: false, reason: '没找到匹配工单 "' + q + '"。可用:\n' + orders.map(o => '• ' + o).join('\n') };
}

// 派一个工单
function dispatch(workorderId) {
  const wkDir = path.join(COORDINATION_DIR, workorderId);
  const readme = path.join(wkDir, 'README.md');
  if (!fs.existsSync(readme)) {
    return { ok: false, reason: 'README.md 不存在: ' + readme };
  }

  // 已完成检查
  const reportName = workorderId + '-report.md';
  if (fs.existsSync(path.join(DONE_DIR, reportName))) {
    return { ok: false, reason: '工单已完成: ' + reportName + '\n如需重派请先归档老报告。' };
  }

  // 检查是否已在跑
  const running = loadDispatched().filter(d => d.workorderId === workorderId && d.status === 'running');
  if (running.length > 0) {
    const r = running[0];
    return { ok: false, reason: '该工单已在跑: PID=' + r.pid + ' 启动于 ' + r.startedAt };
  }

  // 派单命令
  const logFile = '/tmp/droid-' + workorderId + '.log';

  // WO-V4-FIX: 在 nohup 前注入 DeepSeek Anthropic 兼容层环境变量（memory #25）
  // 如果 DEEPSEEK_ANTHROPIC_KEY 未设，envPrefix 为空 → 退回原行为，向后兼容
  const dsKey = process.env.DEEPSEEK_ANTHROPIC_KEY || '';
  const dsBase = process.env.DEEPSEEK_ANTHROPIC_BASE_URL || 'https://api.deepseek.com/anthropic';
  const envPrefix = dsKey ? 'ANTHROPIC_BASE_URL=' + dsBase + ' ANTHROPIC_API_KEY=' + dsKey + ' ' : '';

  const cmd = 'cd /opt/wonderbear && ' + envPrefix + 'nohup ' + DROID_CLI +
              ' exec --model deepseek-v4-pro --auto high "请按 coordination/workorders/' + workorderId + '/README.md 完成任务。' +
              '完成后写报告到 coordination/done/' + reportName + '" > ' + logFile + ' 2>&1 & echo $!';

  try {
    // 用 sh -c 跑后台命令并拿 PID
    // WO-3.20: 加 timeout 防止 execSync 因 droid CLI 启动慢 / 子 shell 不退出
    // 而 hang 住整个 bot 事件循环(踩过坑:钉钉 webhook 5s 超时,bot 整个被
    // 阻塞导致后续派单全卡)。timeout 触发会抛 ETIMEDOUT,被外层 catch 捕获,
    // 不会冒到 process 顶层。stdio: ['ignore', 'pipe', 'pipe'] 避免继承
    // bot 进程的 stdin,免得子 shell 等待输入。
    const result = require('child_process').execSync(cmd, {
      encoding: 'utf8',
      shell: '/bin/bash',
      timeout: 5000,
      killSignal: 'SIGKILL',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const pid = parseInt(result.trim(), 10);
    if (!pid || isNaN(pid)) {
      return { ok: false, reason: '派单失败: 无法获取 PID, output=' + result };
    }

    // 记录
    const dispatched = loadDispatched();
    dispatched.push({
      workorderId,
      pid,
      logFile,
      startedAt: new Date().toISOString(),
      status: 'running',
    });
    saveDispatched(dispatched);

    return {
      ok: true,
      pid,
      logFile,
      reportPath: path.join(DONE_DIR, reportName),
      message: '✅ 已派 Factory\n工单: ' + workorderId + '\nPID: ' + pid + '\n日志: ' + logFile +
               '\n预计 30-90 分钟\n完成后会自动推送报告摘要',
    };
  } catch (e) {
    return { ok: false, reason: '派单异常: ' + e.message };
  }
}

// 取消一个派出去的进程
function cancel(pidOrId) {
  const dispatched = loadDispatched();
  let target = null;
  if (/^\d+$/.test(String(pidOrId))) {
    const pid = parseInt(pidOrId, 10);
    target = dispatched.find(d => d.pid === pid && d.status === 'running');
  } else {
    target = dispatched.find(d => d.workorderId.includes(pidOrId) && d.status === 'running');
  }
  if (!target) return { ok: false, reason: '没找到运行中的进程: ' + pidOrId };

  try {
    process.kill(target.pid, 'SIGTERM');
    target.status = 'cancelled';
    target.cancelledAt = new Date().toISOString();
    saveDispatched(dispatched);
    return { ok: true, message: '🛑 已取消 PID=' + target.pid + ' (工单: ' + target.workorderId + ')' };
  } catch (e) {
    target.status = 'dead';
    saveDispatched(dispatched);
    return { ok: false, reason: 'kill 失败 (进程可能已死): ' + e.message };
  }
}

// 查所有运行中
function listRunning() {
  const dispatched = loadDispatched();
  const running = [];
  for (const d of dispatched) {
    if (d.status !== 'running') continue;
    // 检查 PID 是否还活着
    try {
      process.kill(d.pid, 0);
      running.push(d);
    } catch (e) {
      // 进程已死
      d.status = 'dead-detected';
      d.detectedAt = new Date().toISOString();
    }
  }
  saveDispatched(dispatched);
  return running;
}

module.exports = {
  resolveWorkorderId,
  dispatch,
  cancel,
  listRunning,
  listWorkorders,
  loadDispatched,
  checkAlreadyDone,
};
