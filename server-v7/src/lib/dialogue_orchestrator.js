// src/lib/dialogue_orchestrator.js
import { detectRepetition } from './repetition_detector.js';
import { detectLanguage } from './language_detector.js';
import { mergeElements, extractRealWorldHooks } from './elements_manager.js';
import { validateLLMResponse } from './llm_response_validator.js';

export const MAX_DIALOGUE_TURNS = 30;
export const SOFT_CLOSE_TURN = 15;
export const RECAP_MIN_ELEMENTS = 5;
export const RECAP_MIN_TURNS_BETWEEN = 6;

export async function orchestrateDialogue({ session, childInput, llmCallFn }) {
  const llmRaw = await llmCallFn({
    history: (session.history || []).slice(-10),
    elements: session.elements || [],
    childInput
  });

  const llmResponse = validateLLMResponse(llmRaw);

  const language = detectLanguage(childInput);
  const repetition = detectRepetition(
    [...(session.history || []), { role: 'child', text: childInput }],
    llmResponse.elements,
    session.lastRecapElementsCount || 0
  );

  const newHooks = extractRealWorldHooks(childInput);
  const mergedElements = mergeElements(session.elements || [], llmResponse.elements);

  let finalIntent = llmResponse.intent;
  const turnCount = (session.turnCount || 0) + 1;

  if (turnCount >= MAX_DIALOGUE_TURNS) {
    finalIntent = 'recap';
  } else if (repetition.repeating && mergedElements.length >= 3) {
    finalIntent = 'recap';
  } else if (turnCount >= SOFT_CLOSE_TURN && (session.recapCount || 0) === 0
             && mergedElements.length >= RECAP_MIN_ELEMENTS) {
    finalIntent = 'recap';
  } else if (finalIntent === 'recap' && mergedElements.length < RECAP_MIN_ELEMENTS) {
    finalIntent = 'continue';
  } else if (finalIntent === 'recap' &&
             turnCount - (session.lastRecapTurn || 0) < RECAP_MIN_TURNS_BETWEEN) {
    finalIntent = 'continue';
  }

  session.history = [
    ...(session.history || []),
    { role: 'child', text: childInput },
    { role: 'bear', text: llmResponse.reply }
  ];
  session.elements = mergedElements;
  session.realWorldHooks = [...new Set([...(session.realWorldHooks || []), ...newHooks])];
  session.turnCount = turnCount;
  session.language = language;

  return {
    reply: llmResponse.reply,
    elements: mergedElements,
    intent: finalIntent,
    metadata: {
      turn_count: turnCount,
      language,
      is_repeating: repetition.repeating,
      hook_extracted: newHooks.length > 0
    }
  };
}
