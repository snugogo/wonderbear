// src/lib/llm_response_validator.js

const VALID_INTENTS = ['continue', 'recap', 'safety'];

export function validateLLMResponse(rawResponse) {
  let parsed;
  try {
    if (typeof rawResponse === 'string') {
      const cleaned = rawResponse.replace(/^```json\s*|\s*```$/g, '').trim();
      parsed = JSON.parse(cleaned);
    } else if (rawResponse && typeof rawResponse === 'object') {
      parsed = rawResponse;
    } else {
      throw new Error('rawResponse is neither string nor object');
    }
  } catch (e) {
    return {
      reply: '诶?小熊有点没听清,你再说一次好吗?',
      elements: [],
      intent: 'continue',
      _fallback: 'json_parse_error'
    };
  }

  return {
    reply: typeof parsed.reply === 'string' && parsed.reply.length > 0
      ? parsed.reply
      : '诶~ 然后呢?',

    elements: Array.isArray(parsed.elements)
      ? parsed.elements.filter(e => typeof e === 'string')
      : [],

    intent: VALID_INTENTS.includes(parsed.intent)
      ? parsed.intent
      : 'continue'
  };
}
