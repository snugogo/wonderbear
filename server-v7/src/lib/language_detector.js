// src/lib/language_detector.js
import { franc } from 'franc-min';

export function detectLanguage(text) {
  if (!text || text.length < 2) return 'unknown';

  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const englishChars = (text.match(/[a-zA-Z]/g) || []).length;
  const totalChars = chineseChars + englishChars;

  if (totalChars === 0) return 'unknown';

  const chineseRatio = chineseChars / totalChars;

  if (chineseRatio > 0.7) return 'zh';
  if (chineseRatio < 0.2) {
    // Short-circuit: pure-ASCII English-letter input bypasses franc
    // (franc-min misclassifies short English as swe/sco/etc)
    const nonEnglishLatin = /[\u00C0-\u024F]/.test(text);
    if (englishChars >= 2 && chineseChars === 0 && !nonEnglishLatin) {
      return "en";
    }
    let code;
    try { code = franc(text); } catch (e) { code = 'und'; }
    if (code === 'eng') return 'en';
    if (code === 'pol') return 'pl';
    if (code === 'ron') return 'ro';
    if (code === 'spa') return 'es';
    return 'other';
  }

  return 'mixed';
}
