// lessons-helper.js
// 钉钉机器人自学习知识库辅助函数
// 提供 LESSONS.md 的读取、追加、列出、删除功能

const fs = require('fs');
const path = require('path');

const LESSONS_PATH = path.join(__dirname, '..', 'LESSONS.md');
const APPEND_MARKER = '<!-- AUTO_APPEND_BELOW -->';
const MAX_AUTO_APPEND_PER_DAY = 5;

/**
 * 读取整个 LESSONS.md 内容
 */
function readLessons() {
  try {
    if (!fs.existsSync(LESSONS_PATH)) {
      return '';
    }
    return fs.readFileSync(LESSONS_PATH, 'utf-8');
  } catch (err) {
    console.error('[LESSONS] read failed:', err.message);
    return '';
  }
}

/**
 * 检查今天是否已经达到自动追加上限
 * 通过统计当天日期的标题数实现
 */
function isOverDailyLimit() {
  const content = readLessons();
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const regex = new RegExp(`^### ${today}`, 'gm');
  const matches = content.match(regex) || [];
  return matches.length >= MAX_AUTO_APPEND_PER_DAY;
}

/**
 * 追加一条新教训
 * @param {Object} lesson { title, scenario, solution, source }
 * @returns {Object} { ok: boolean, message: string }
 */
function appendLesson(lesson) {
  const { title, scenario, solution, source = '自动' } = lesson;
  if (!title || !scenario || !solution) {
    return { ok: false, message: '缺少必填字段: title / scenario / solution' };
  }

  if (source === '自动' && isOverDailyLimit()) {
    return { ok: false, message: `今日自动追加已达上限 ${MAX_AUTO_APPEND_PER_DAY} 条` };
  }

  const today = new Date().toISOString().slice(0, 10);
  const block = `\n### ${today} ${title}\n**场景**: ${scenario}\n**解决**: ${solution}\n**来源**: ${source}\n`;

  let content = readLessons();
  if (!content) {
    return { ok: false, message: 'LESSONS.md 不存在或为空,无法追加' };
  }

  if (content.includes(APPEND_MARKER)) {
    // 在标记下方插入
    content = content.replace(APPEND_MARKER, APPEND_MARKER + block);
  } else {
    // 标记不存在,直接追加到文件末尾
    content = content.trimEnd() + '\n' + block;
  }

  try {
    fs.writeFileSync(LESSONS_PATH, content, 'utf-8');
    return { ok: true, message: `已记录: ${title}` };
  } catch (err) {
    return { ok: false, message: 'write failed: ' + err.message };
  }
}

/**
 * 列出所有教训(按日期降序)
 * @param {number} limit 最多返回多少条
 */
function listLessons(limit = 10) {
  const content = readLessons();
  if (!content) return [];

  // 拆分每条教训(以 ### 开头)
  const blocks = content.split(/^### /m).slice(1); // 第一项是头部说明,丢掉
  const lessons = blocks.map((block) => {
    const lines = block.split('\n');
    const titleLine = lines[0] || '';
    return {
      titleLine: titleLine.trim(),
      preview: lines.slice(0, 4).join('\n').trim(),
    };
  });

  // 按日期降序(标题开头是 YYYY-MM-DD)
  lessons.sort((a, b) => b.titleLine.localeCompare(a.titleLine));

  return lessons.slice(0, limit);
}

/**
 * 删除最近一条教训(/unlearn 用)
 */
function removeLastLesson() {
  let content = readLessons();
  if (!content) return { ok: false, message: 'LESSONS.md 为空' };

  // 找到 APPEND_MARKER 后的第一条 ### 块
  const markerIdx = content.indexOf(APPEND_MARKER);
  if (markerIdx === -1) {
    return { ok: false, message: '没有找到 AUTO_APPEND_BELOW 标记,无法定位' };
  }

  const afterMarker = content.slice(markerIdx + APPEND_MARKER.length);
  const firstBlockMatch = afterMarker.match(/^\n*### [^\n]+\n[\s\S]+?(?=\n### |\n*$)/);

  if (!firstBlockMatch) {
    return { ok: false, message: '没有可删除的自动追加教训' };
  }

  const removed = firstBlockMatch[0].trim();
  const removedTitle = (removed.match(/^### (.+)/m) || [])[1] || '(unknown)';

  content = content.slice(0, markerIdx + APPEND_MARKER.length) +
            afterMarker.replace(firstBlockMatch[0], '');

  try {
    fs.writeFileSync(LESSONS_PATH, content, 'utf-8');
    return { ok: true, message: `已删除: ${removedTitle}` };
  } catch (err) {
    return { ok: false, message: 'write failed: ' + err.message };
  }
}

/**
 * 从 Claude 回复中提取 [LESSON_CANDIDATE] 块
 * 返回 { extracted: 教训对象数组, cleanedReply: 清理掉标记后的回复 }
 */
function extractLessonCandidates(reply) {
  if (!reply) return { extracted: [], cleanedReply: reply };

  const regex = /\[LESSON_CANDIDATE\]\s*\n?([\s\S]+?)(?=\[LESSON_CANDIDATE\]|$)/g;
  const extracted = [];
  let cleanedReply = reply;

  let match;
  while ((match = regex.exec(reply)) !== null) {
    const block = match[1];
    const titleMatch = block.match(/标题\s*[:：]\s*(.+)/);
    const scenarioMatch = block.match(/场景\s*[:：]\s*(.+)/);
    const solutionMatch = block.match(/解决\s*[:：]\s*([\s\S]+?)(?=\n\s*$|\n[^\s]|$)/);

    if (titleMatch && scenarioMatch && solutionMatch) {
      extracted.push({
        title: titleMatch[1].trim(),
        scenario: scenarioMatch[1].trim(),
        solution: solutionMatch[1].trim(),
        source: '自动',
      });
    }
  }

  // 从回复里去掉所有 [LESSON_CANDIDATE] 块
  cleanedReply = reply.replace(/\[LESSON_CANDIDATE\][\s\S]+?(?=\[LESSON_CANDIDATE\]|$)/g, '').trim();

  return { extracted, cleanedReply };
}

module.exports = {
  readLessons,
  appendLesson,
  listLessons,
  removeLastLesson,
  extractLessonCandidates,
  isOverDailyLimit,
  LESSONS_PATH,
  MAX_AUTO_APPEND_PER_DAY,
};
