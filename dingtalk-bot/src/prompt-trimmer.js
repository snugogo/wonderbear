// prompt-trimmer.js - 控制 prompt 长度,避免 claude CLI 超时
// v0.9.2 (2026-04-29)

const MAX_USER_MSG = 800;        // 单条用户消息上限
const MAX_HISTORY_CHARS = 600;   // 历史总字符上限
const MAX_TOTAL_PROMPT = 1500;   // 整个 prompt 上限(超就硬截断)
const KEEP_HISTORY_TURNS = 1;    // 历史只保留最近 N 轮

// 检查用户消息是否过长 → 返回 null 表示拒收
function checkUserMessage(content) {
  if (!content) return { ok: true };
  if (content.length > MAX_USER_MSG) {
    return {
      ok: false,
      reason: '消息太长 (' + content.length + ' > ' + MAX_USER_MSG + ' 字符)。\n' +
              '钉钉机器人只处理短指令,复杂请求请 SSH 或本地 Claude。\n\n' +
              '快速命令: 派/进度/日志/重启/取消/帮助'
    };
  }
  return { ok: true };
}

// 裁剪历史 - 只保留最近 KEEP_HISTORY_TURNS 轮,且总长不超 MAX_HISTORY_CHARS
function trimMemory(memory) {
  if (!Array.isArray(memory) || memory.length === 0) return [];
  // 取最近 N 轮
  let trimmed = memory.slice(-KEEP_HISTORY_TURNS);
  // 计算总字符
  let total = 0;
  for (const turn of trimmed) {
    total += (turn.user || '').length + (turn.assistant || '').length;
  }
  // 超长则继续从最旧的丢
  while (total > MAX_HISTORY_CHARS && trimmed.length > 0) {
    const dropped = trimmed.shift();
    total -= (dropped.user || '').length + (dropped.assistant || '').length;
  }
  return trimmed;
}

// 兜底:整个 prompt 超 MAX_TOTAL_PROMPT 就硬截断尾部
function clampPrompt(prompt) {
  if (prompt.length <= MAX_TOTAL_PROMPT) return prompt;
  return prompt.slice(0, MAX_TOTAL_PROMPT) + '\n\n[Prompt 已截断,超出 ' + MAX_TOTAL_PROMPT + ' 字符]';
}

module.exports = {
  checkUserMessage,
  trimMemory,
  clampPrompt,
  MAX_USER_MSG,
  MAX_HISTORY_CHARS,
  MAX_TOTAL_PROMPT,
  KEEP_HISTORY_TURNS,
};
