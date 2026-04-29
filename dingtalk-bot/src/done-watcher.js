// done-watcher.js - 后台轮询 coordination/done/, 新文件推送钉钉
// v0.9.2 (2026-04-29)

const fs = require('fs');
const path = require('path');

const DONE_DIR = '/opt/wonderbear/coordination/done';
const POLL_INTERVAL_MS = 30 * 1000;  // 30 秒
const SUMMARY_LEN = 250;
const DISPATCH_LOG = '/tmp/wonderbear-dispatched.json';

let baseline = new Set();   // 启动时的快照,这之后的新文件才算"新"
let started = false;

// 取目录下所有 .md 文件名(不含子目录)
function snapshotDoneDir() {
  try {
    if (!fs.existsSync(DONE_DIR)) return new Set();
    return new Set(
      fs.readdirSync(DONE_DIR).filter(n => n.endsWith('.md'))
    );
  } catch (e) {
    return new Set();
  }
}

// 读报告前 N 字
function readSummary(filename) {
  try {
    const fp = path.join(DONE_DIR, filename);
    const content = fs.readFileSync(fp, 'utf8');
    if (content.length <= SUMMARY_LEN) return content;
    return content.slice(0, SUMMARY_LEN) + '\n...(已截断,完整报告见 ' + fp + ')';
  } catch (e) {
    return '(读取失败: ' + e.message + ')';
  }
}

// 从 dispatched.json 找到匹配的工单 → 标记完成
function markWorkorderDone(reportFilename) {
  try {
    if (!fs.existsSync(DISPATCH_LOG)) return null;
    const arr = JSON.parse(fs.readFileSync(DISPATCH_LOG, 'utf8'));
    let matched = null;
    for (const d of arr) {
      if (d.status !== 'running') continue;
      // 匹配规则: report 文件名 = workorderId + '-report.md'
      const expected = d.workorderId + '-report.md';
      if (reportFilename === expected) {
        d.status = 'done';
        d.doneAt = new Date().toISOString();
        matched = d;
        break;
      }
    }
    if (matched) {
      fs.writeFileSync(DISPATCH_LOG, JSON.stringify(arr, null, 2));
    }
    return matched;
  } catch (e) {
    console.error('[DONE-WATCHER] markWorkorderDone failed:', e.message);
    return null;
  }
}

// 启动轮询 - replyFn 是钉钉推送函数, sessionWebhook 由调用方在收到任意消息时缓存
// 这里只做"检测到新文件 → 调 onNewReport(filename, summary, matchedWorkorder)"
function start(onNewReport) {
  if (started) {
    console.log('[DONE-WATCHER] already started, skip');
    return;
  }
  started = true;
  baseline = snapshotDoneDir();
  console.log('[DONE-WATCHER] started, baseline =', baseline.size, 'files, poll every', POLL_INTERVAL_MS / 1000, 's');

  setInterval(() => {
    try {
      const current = snapshotDoneDir();
      const newOnes = [];
      for (const f of current) {
        if (!baseline.has(f)) newOnes.push(f);
      }
      if (newOnes.length === 0) return;

      console.log('[DONE-WATCHER] detected new reports:', newOnes.join(', '));
      for (const f of newOnes) {
        baseline.add(f);
        const summary = readSummary(f);
        const matched = markWorkorderDone(f);
        try {
          onNewReport(f, summary, matched);
        } catch (e) {
          console.error('[DONE-WATCHER] onNewReport callback failed:', e.message);
        }
      }
    } catch (e) {
      console.error('[DONE-WATCHER] poll failed:', e.message);
    }
  }, POLL_INTERVAL_MS);
}

// 获取当前 baseline 大小(给 /status 查询用)
function getBaselineSize() {
  return baseline.size;
}

module.exports = {
  start,
  getBaselineSize,
  POLL_INTERVAL_MS,
};
