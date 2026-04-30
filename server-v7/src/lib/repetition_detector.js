// src/lib/repetition_detector.js
import stringSimilarity from 'string-similarity';

/**
 * 检测最近 3 轮孩子是否在重复
 */
export function detectRepetition(history, currentElements, lastRecapElementsCount) {
  const childTurns = history
    .filter(h => h.role === 'child')
    .slice(-3)
    .map(h => h.text || '');

  if (childTurns.length < 3) return { repeating: false, reason: null };

  const sim01 = stringSimilarity.compareTwoStrings(childTurns[0], childTurns[1]);
  const sim12 = stringSimilarity.compareTwoStrings(childTurns[1], childTurns[2]);
  if (sim01 > 0.7 && sim12 > 0.7) {
    return { repeating: true, reason: 'text_similar' };
  }

  const allShort = childTurns.every(t => t.length < 5);
  if (allShort) {
    return { repeating: true, reason: 'too_short' };
  }

  const elementsAddedRecently = (currentElements || []).length - (lastRecapElementsCount || 0);
  if (elementsAddedRecently === 0 && childTurns.length >= 3) {
    return { repeating: true, reason: 'no_new_elements' };
  }

  return { repeating: false, reason: null };
}
