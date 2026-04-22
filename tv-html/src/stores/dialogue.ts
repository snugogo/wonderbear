/**
 * Dialogue store — 7-round conversation state machine.
 *
 * Server contract: API_CONTRACT.md §7.2 / §7.3
 *   - round is 1-based (per DialogueTurnRequest.round)
 *   - roundCount is 5 (age 3-4) or 7 (age 5-8)
 *   - dialogue/turn returns { done, nextQuestion, summary, safetyLevel, safetyReplacement }
 *   - safetyLevel='blocked' → ERR.CONTENT_SAFETY_BLOCKED
 *   - safetyLevel='warn'  → server returns safetyReplacement (bear softly redirects)
 *   - server runs ASR internally when audioBase64 supplied (Q2 protocol decision)
 *
 * Local UI phases (mirror PRD §4.3 step ② state diagram):
 *   bear-speaking    : TTS playing the bear's prompt
 *   waiting-for-child: prompt finished, waiting for voice key
 *   recording        : child holding voice key
 *   uploading        : ASR + LLM in flight
 *   bear-thinking    : server processing, waiting for next prompt
 *   finished         : done=true, ready to generate story
 *
 * From round >= 4 the OK key triggers skipRemaining=true (early end).
 */

import { defineStore } from 'pinia';
import type { DialogueQuestion, DialogueSummary } from '@/services/api';

export type DialoguePhase =
  | 'idle'
  | 'bear-speaking'
  | 'waiting-for-child'
  | 'recording'
  | 'uploading'
  | 'bear-thinking'
  | 'finished';

export interface DialogueState {
  dialogueId: string | null;
  /** 5 (age 3-4) or 7 (age 5-8). Server-defined per /dialogue/start. */
  roundCount: 5 | 7;
  /** Current round, 1-based. The next dialogue/turn will send this value. */
  round: number;
  phase: DialoguePhase;
  currentQuestion: DialogueQuestion | null;
  /** If safetyLevel='warn', server's softer rephrasing of the question. */
  safetyReplacement: string | null;
  /** Story summary returned when done=true. */
  summary: DialogueSummary | null;
  /** True from round 4+ — OK key triggers skipRemaining */
  canEarlyEnd: boolean;
  errorMessage: string | null;
}

export const useDialogueStore = defineStore('dialogue', {
  state: (): DialogueState => ({
    dialogueId: null,
    roundCount: 7,
    round: 1,
    phase: 'idle',
    currentQuestion: null,
    safetyReplacement: null,
    summary: null,
    canEarlyEnd: false,
    errorMessage: null,
  }),

  getters: {
    isLastRound(): boolean {
      return this.round >= this.roundCount;
    },
    progressLabel(): string {
      return `${this.round} / ${this.roundCount}`;
    },
  },

  actions: {
    reset(): void {
      this.dialogueId = null;
      this.roundCount = 7;
      this.round = 1;
      this.phase = 'idle';
      this.currentQuestion = null;
      this.safetyReplacement = null;
      this.summary = null;
      this.canEarlyEnd = false;
      this.errorMessage = null;
    },

    setPhase(phase: DialoguePhase): void {
      this.phase = phase;
    },

    /** Apply /dialogue/start response. */
    applyStart(payload: {
      dialogueId: string;
      roundCount: 5 | 7;
      firstQuestion: DialogueQuestion;
    }): void {
      this.dialogueId = payload.dialogueId;
      this.roundCount = payload.roundCount;
      this.round = 1;
      this.currentQuestion = payload.firstQuestion;
      this.safetyReplacement = null;
      this.canEarlyEnd = false;
      this.phase = 'bear-speaking';
    },

    /** Apply /dialogue/turn response. */
    applyTurn(payload: {
      done: boolean;
      nextQuestion: (DialogueQuestion & { round: number }) | null;
      summary: DialogueSummary | null;
      safetyLevel: 'ok' | 'warn' | 'blocked';
      safetyReplacement?: string | null;
    }): void {
      if (payload.done) {
        this.summary = payload.summary;
        this.phase = 'finished';
        return;
      }
      if (payload.nextQuestion) {
        this.round = payload.nextQuestion.round;
        // If server sent a safety-friendly replacement, use it instead of the raw question.
        const text = payload.safetyLevel === 'warn' && payload.safetyReplacement
          ? payload.safetyReplacement
          : payload.nextQuestion.text;
        this.currentQuestion = {
          text,
          textLearning: payload.nextQuestion.textLearning,
          ttsUrl: payload.nextQuestion.ttsUrl,
        };
        this.safetyReplacement = payload.safetyReplacement ?? null;
        // PRD §4.3: from round 4 onwards, OK key allows early end.
        this.canEarlyEnd = this.round >= 4;
        this.phase = 'bear-speaking';
      }
    },

    setError(message: string): void {
      this.errorMessage = message;
      this.phase = 'idle';
    },
  },
});
