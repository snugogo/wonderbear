// ============================================================================
// services/asr.js — OpenAI Whisper with mock fallback
//
// Public API:
//   - transcribe({ audioBuffer, mimeType, locale }) → { text, locale }
//   - isMockMode()
// ============================================================================

import env from '../config/env.js';

export function isMockMode() {
  if (process.env.USE_MOCK_AI === 'true' || process.env.USE_MOCK_AI === '1') return true;
  if (!env.OPENAI_API_KEY) return true;
  return false;
}

/**
 * @param {object} args
 * @param {Buffer} args.audioBuffer
 * @param {string} args.mimeType         e.g. 'audio/mpeg' / 'audio/wav' / 'audio/ogg'
 * @param {'zh'|'en'|'pl'|'ro'} args.locale
 * @returns {Promise<{ text:string, locale:string }>}
 */
export async function transcribe(args) {
  if (isMockMode()) return mockTranscribe(args);
  return liveTranscribe(args);
}

function mockTranscribe({ audioBuffer, locale = 'en' }) {
  // Deterministic mock: length of buffer drives phrase variant.
  const bank = {
    zh: ['是一只小猫', '有一只小狗', '我想听公主', '有一个勇敢的小熊', '去海边吧'],
    en: ['a little kitten', 'a brave puppy', 'a princess please', 'a tiny bear', 'to the seaside'],
    pl: ['mały kotek', 'odważny szczeniak', 'księżniczka proszę', 'mały miś', 'nad morze'],
    ro: ['o pisicuță mică', 'un cățeluș curajos', 'o prințesă te rog', 'un ursuleț mic', 'la mare'],
  };
  const options = bank[locale] || bank.en;
  const len = Buffer.isBuffer(audioBuffer) ? audioBuffer.length : (audioBuffer?.length || 0);
  if (len < 4) throw new Error('ASR: empty audio buffer');
  return { text: options[len % options.length], locale };
}

async function liveTranscribe({ audioBuffer, mimeType = 'audio/mpeg', locale = 'en' }) {
  const blob = new Blob([audioBuffer], { type: mimeType });
  const form = new FormData();
  form.append('file', blob, `audio.${extFor(mimeType)}`);
  form.append('model', 'whisper-1');
  form.append('language', locale);

  const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: form,
  });
  if (!resp.ok) throw new Error(`Whisper HTTP ${resp.status}`);
  const data = await resp.json();
  const text = (data?.text || '').trim();
  if (!text) throw new Error('Whisper returned empty transcription');
  return { text, locale };
}

function extFor(mimeType) {
  if (/wav/i.test(mimeType)) return 'wav';
  if (/ogg/i.test(mimeType)) return 'ogg';
  return 'mp3';
}
