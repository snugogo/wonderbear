// status-helper.js
// STATUS.md 自动维护辅助函数
// 提供:读取、追加进度日志条目、刷新各子系统状态、归档过期日志、Factory 报告扫描

const fs = require('fs');
const path = require('path');

const STATUS_PATH = path.join(__dirname, '..', 'STATUS.md');
const ARCHIVE_DIR = path.join(__dirname, '..', 'STATUS-ARCHIVE');
const COORDINATION_DONE = '/opt/wonderbear/coordination/done';
const APPEND_MARKER = '<!-- AUTO_UPDATE_BELOW -->';
const LOG_RETENTION_DAYS = 7;

/**
 * 读取整个 STATUS.md 内容
 */
function readStatus() {
  try {
    if (!fs.existsSync(STATUS_PATH)) return '';
    return fs.readFileSync(STATUS_PATH, 'utf-8');
  } catch (err) {
    console.error('[STATUS] read failed:', err.message);
    return '';
  }
}

/**
 * 写入整个 STATUS.md 并自动更新顶部时间戳
 */
function writeStatus(content) {
  try {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 16);
    // 替换最后更新时间戳
    content = content.replace(
      /\*\*最后更新\*\*: [^\n]+/,
      `**最后更新**: ${now} (UTC)`
    );
    fs.writeFileSync(STATUS_PATH, content, 'utf-8');
    return { ok: true };
  } catch (err) {
    return { ok: false, message: 'write failed: ' + err.message };
  }
}

/**
 * 追加一条进度日志(按 [STATUS_UPDATE] 触发)
 * @param {Object} update { date, source, summary, impact, next? }
 */
function appendUpdate(update) {
  const { date, source, summary, impact = '', next = '' } = update;
  if (!summary) return { ok: false, message: '缺少 summary' };

  const today = date || new Date().toISOString().slice(0, 10);
  const sourceLabel = source || '钉钉 Claude';

  let content = readStatus();
  if (!content) return { ok: false, message: 'STATUS.md 不存在' };

  // 找到 "## 📅 最近 7 天进度日志" 段, 检查今天日期是否已有条目
  const dailyHeaderRegex = new RegExp(`### ${today}[^\\n]*`);
  const hasToday = dailyHeaderRegex.test(content);

  // 构造新条目
  let entry = '';
  if (!hasToday) {
    // 新一天, 加日期标题 + 第一条
    const weekday = new Date(today + 'T00:00:00Z').toLocaleDateString('zh-CN', {
      weekday: 'long', timeZone: 'UTC',
    });
    entry = `\n### ${today} ${weekday}\n- [${sourceLabel}] ${summary}`;
    if (impact) entry += `\n  - 影响: ${impact}`;
    if (next) entry += `\n  - 下一步: ${next}`;
    entry += '\n';
  } else {
    // 今天已有条目, 在该日期下追加一行
    entry = `- [${sourceLabel}] ${summary}`;
    if (impact) entry += ` (影响: ${impact})`;
    if (next) entry += ` (下一步: ${next})`;
    entry += '\n';
  }

  // 插入位置: "## 📅 最近 7 天进度日志" 标题之后第一行
  // 如果今天已有, 插入到当天日期标题之后
  if (hasToday) {
    // 在今天的 ### 标题下方第一行插入
    content = content.replace(
      new RegExp(`(### ${today}[^\\n]*\\n)`),
      `$1${entry}`
    );
  } else {
    // 在 "## 📅 最近 7 天进度日志" 之后插入新日期块
    content = content.replace(
      /(## 📅 最近 7 天进度日志\n)/,
      `$1${entry}`
    );
  }

  return writeStatus(content);
}

/**
 * 列出最近的进度日志条目(钉钉 /status 用)
 */
function listRecentUpdates(days = 7) {
  const content = readStatus();
  if (!content) return '';

  // 提取 "## 📅 最近 7 天进度日志" 段
  const match = content.match(/## 📅 最近 7 天进度日志\n([\s\S]+?)(?=\n## |\n<!-- |$)/);
  if (!match) return '(无最近进度)';
  return match[1].trim();
}

/**
 * 刷新各子系统状态(子系统状态变化时调用)
 * @param {string} subsystem 子系统名 (server-v7 / TV-HTML / 钉钉机器人 / Factory droid)
 * @param {Object} updates { 字段: 值 }
 */
function updateSubsystem(subsystem, updates) {
  let content = readStatus();
  if (!content) return { ok: false, message: 'STATUS.md 不存在' };

  // 找到 ### {subsystem} 段, 替换字段
  const sectionRegex = new RegExp(`(### ${subsystem}\\n[\\s\\S]+?)(?=\\n### |\\n## |\\n<!-- )`);
  const sectionMatch = content.match(sectionRegex);
  if (!sectionMatch) {
    return { ok: false, message: `子系统 "${subsystem}" 在 STATUS.md 里找不到` };
  }

  let section = sectionMatch[1];
  for (const [field, value] of Object.entries(updates)) {
    const fieldRegex = new RegExp(`(- ${field}: )[^\\n]+`, 'i');
    if (fieldRegex.test(section)) {
      section = section.replace(fieldRegex, `$1${value}`);
    } else {
      // 字段不存在, 追加到段末
      section += `- ${field}: ${value}\n`;
    }
  }

  content = content.replace(sectionRegex, section);
  return writeStatus(content);
}

/**
 * 扫描 coordination/done/ 找新的 Factory 报告
 * 返回最近 N 个未消化报告(基于 .processed 标记文件)
 */
function scanFactoryReports(limit = 5) {
  if (!fs.existsSync(COORDINATION_DONE)) return [];

  let files = [];
  try {
    files = fs.readdirSync(COORDINATION_DONE)
      .filter(f => f.endsWith('.md') && !fs.existsSync(path.join(COORDINATION_DONE, f + '.processed')))
      .map(f => ({
        name: f,
        path: path.join(COORDINATION_DONE, f),
        mtime: fs.statSync(path.join(COORDINATION_DONE, f)).mtime,
      }))
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, limit);
  } catch (err) {
    console.error('[STATUS] scan factory reports failed:', err.message);
    return [];
  }

  return files;
}

/**
 * 标记 Factory 报告已处理(写一个 .processed 文件)
 */
function markFactoryReportProcessed(reportPath) {
  try {
    fs.writeFileSync(reportPath + '.processed', new Date().toISOString());
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * 从 Claude 回复中提取 [STATUS_UPDATE] 块
 * 格式:
 *   [STATUS_UPDATE]
 *   完成: ...
 *   影响: ...
 *   下一步: ...
 */
function extractStatusUpdates(reply) {
  if (!reply) return { extracted: [], cleanedReply: reply };

  const regex = /\[STATUS_UPDATE\]\s*\n?([\s\S]+?)(?=\[STATUS_UPDATE\]|\[LESSON_CANDIDATE\]|$)/g;
  const extracted = [];

  let match;
  while ((match = regex.exec(reply)) !== null) {
    const block = match[1];
    const summaryMatch = block.match(/完成\s*[:：]\s*(.+)/);
    const impactMatch = block.match(/影响\s*[:：]\s*(.+)/);
    const nextMatch = block.match(/下一步\s*[:：]\s*(.+)/);

    if (summaryMatch) {
      extracted.push({
        summary: summaryMatch[1].trim(),
        impact: impactMatch ? impactMatch[1].trim() : '',
        next: nextMatch ? nextMatch[1].trim() : '',
        source: '钉钉 Claude',
      });
    }
  }

  // 清理回复中的 [STATUS_UPDATE] 标记
  const cleanedReply = reply.replace(/\[STATUS_UPDATE\][\s\S]+?(?=\[STATUS_UPDATE\]|\[LESSON_CANDIDATE\]|$)/g, '').trim();

  return { extracted, cleanedReply };
}

/**
 * 归档超过 LOG_RETENTION_DAYS 的日志条目到 STATUS-ARCHIVE/2026-MM.md
 */
function archiveOldLogs() {
  let content = readStatus();
  if (!content) return { ok: false, message: 'STATUS.md 不存在' };

  // 提取所有 ### YYYY-MM-DD 块
  const blocks = [...content.matchAll(/### (\d{4}-\d{2}-\d{2})[^\n]*\n([\s\S]+?)(?=\n### |\n## |\n<!-- )/g)];

  const cutoff = new Date(Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  cutoff.setUTCHours(0, 0, 0, 0);

  const toArchive = [];
  for (const block of blocks) {
    const date = new Date(block[1] + 'T00:00:00Z');
    if (date < cutoff) {
      toArchive.push({ raw: block[0], date: block[1] });
    }
  }

  if (toArchive.length === 0) return { ok: true, message: '无需归档' };

  // 按月份分组
  const byMonth = {};
  for (const item of toArchive) {
    const month = item.date.slice(0, 7); // YYYY-MM
    if (!byMonth[month]) byMonth[month] = [];
    byMonth[month].push(item);
  }

  // 写入归档文件
  if (!fs.existsSync(ARCHIVE_DIR)) fs.mkdirSync(ARCHIVE_DIR, { recursive: true });

  for (const [month, items] of Object.entries(byMonth)) {
    const archivePath = path.join(ARCHIVE_DIR, `${month}.md`);
    let archiveContent = '';
    if (fs.existsSync(archivePath)) {
      archiveContent = fs.readFileSync(archivePath, 'utf-8');
    } else {
      archiveContent = `# STATUS-ARCHIVE ${month}\n\n`;
    }
    for (const item of items) {
      archiveContent += '\n' + item.raw + '\n';
    }
    fs.writeFileSync(archivePath, archiveContent, 'utf-8');
  }

  // 从 STATUS.md 中移除归档的内容
  for (const item of toArchive) {
    content = content.replace(item.raw, '').replace(/\n{3,}/g, '\n\n');
  }

  fs.writeFileSync(STATUS_PATH, content, 'utf-8');
  return { ok: true, message: `归档 ${toArchive.length} 条日志到 ${Object.keys(byMonth).length} 个月份文件` };
}

module.exports = {
  readStatus,
  writeStatus,
  appendUpdate,
  listRecentUpdates,
  updateSubsystem,
  scanFactoryReports,
  markFactoryReportProcessed,
  extractStatusUpdates,
  archiveOldLogs,
  STATUS_PATH,
};
