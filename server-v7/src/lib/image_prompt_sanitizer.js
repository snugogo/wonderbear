// src/lib/image_prompt_sanitizer.js
// W1' 骨架版 — W2.5 工单替换为完整 200 行 IP 映射

const IP_MAP = [
  { from: /\belsa\b/gi, to: 'snowy princess' },
  { from: /\bfrozen\b/gi, to: 'icy world' },
  { from: /\bmickey\b/gi, to: 'cheerful mouse' },
  { from: /\bpikachu\b/gi, to: 'yellow electric creature' },
  { from: /灰姑娘/g, to: '玻璃鞋公主' }
];

const HARD_BLOCK = [/\bnsfw\b/i, /\bnude\b/i, /\bgore\b/i];

export function sanitizeImagePrompt(prompt) {
  if (!prompt || typeof prompt !== 'string') {
    return { sanitized_prompt: '', changes: [], hard_block_caught: false };
  }

  for (const blockRe of HARD_BLOCK) {
    if (blockRe.test(prompt)) {
      return {
        sanitized_prompt: '',
        changes: [],
        hard_block_caught: true
      };
    }
  }

  let sanitized = prompt;
  const changes = [];
  for (const { from, to } of IP_MAP) {
    if (from.test(sanitized)) {
      const matches = sanitized.match(from) || [];
      for (const m of matches) {
        changes.push({ round: 'ip', from: m.toLowerCase(), to });
      }
      sanitized = sanitized.replace(from, to);
    }
  }

  return {
    sanitized_prompt: sanitized,
    changes,
    hard_block_caught: false
  };
}
