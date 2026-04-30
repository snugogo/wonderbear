/**
 * Dialogue store — co-creation state machine (v7.2).
 *
 * Server contract: API_CONTRACT.md §7.2 / §7.3 / §7.3b
 *   - round is 1-based (per DialogueTurnRequest.round)
 *   - roundCount is 5 (age 3-4) or 7 (age 5-8) — hard cap, not a target
 *   - /dialogue/turn returns the v7.2 envelope:
 *       { done, nextQuestion, summary, safetyLevel, safetyReplacement,
 *         mode, lastTurnSummary, arcUpdate, storyOutline, recognizedText }
 *   - When `done=true`, `storyOutline.paragraphs` (3-5 short strings) is the
 *     content shown on StoryPreviewScreen. The child's Enter then calls
 *     /dialogue/:id/confirm to start generation.
 *   - safetyLevel='blocked' → ERR.CONTENT_SAFETY_BLOCKED (route throws)
 *   - safetyLevel='warn'    → server returns safetyReplacement (bear redirect)
 *   - server runs ASR internally when audioBase64 supplied (patch v3)
 *
 * Local UI phases (mirror PRD §4.3 step ②):
 *   bear-speaking    : TTS playing the bear's prompt
 *   waiting-for-child: prompt finished, waiting for voice key
 *   recording        : child holding voice key
 *   uploading        : ASR + LLM in flight
 *   bear-thinking    : server processing, waiting for next prompt
 *   finished         : done=true → DialogueScreen kicks navigation to story-preview
 *
 * From round >= 4 the OK key triggers skipRemaining=true (early end).
 */

import { defineStore } from 'pinia';
import type {
  DialogueQuestion,
  DialogueSummary,
  DialogueStoryOutline,
  DialogueArcStep,
} from '@/services/api';

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
  /** v7.2 — short ribbon text shown above the bear ("you said: …"). */
  lastTurnSummary: string | null;
  /** v7.2 — adaptive mode the LLM picked for this turn (informational). */
  mode: 'cheerleader' | 'storyteller' | null;
  /** v7.2 — accumulated arc state, merged from server arcUpdate per turn. */
  arc: Partial<Record<DialogueArcStep, string>>;
  /** v7.2 — set when done=true; drives StoryPreviewScreen. */
  storyOutline: DialogueStoryOutline | null;
  /**
   * WO-3.8 (反馈 1) — Last bear reply text, retained across the next round so
   * the child sees what bear just said while THEY are speaking. Cleared on
   * applyStart (round 1 has no prior bear reply) and reset(). Captured inside
   * applyTurn from `currentQuestion.text` BEFORE the new question replaces
   * it. Displayed as a dim context bubble on the 3B (recording) view.
   */
  lastBearReply: string | null;
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
    lastTurnSummary: null,
    mode: null,
    arc: {},
    storyOutline: null,
    lastBearReply: null,
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
      this.lastTurnSummary = null;
      this.mode = null;
      this.arc = {};
      this.storyOutline = null;
      this.lastBearReply = null;
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
      this.lastTurnSummary = null;
      this.mode = null;
      this.arc = {};
      this.storyOutline = null;
      // WO-3.8 (反馈 1): round 1 has no prior bear reply to retain.
      this.lastBearReply = null;
    },

    /** Apply /dialogue/turn response (v7.2). */
    applyTurn(payload: {
      done: boolean;
      nextQuestion: (DialogueQuestion & { round: number }) | null;
      summary: DialogueSummary | null;
      safetyLevel: 'ok' | 'warn' | 'blocked';
      safetyReplacement?: string | null;
      mode?: 'cheerleader' | 'storyteller' | null;
      lastTurnSummary?: string | null;
      arcUpdate?: Partial<Record<DialogueArcStep, string>> | null;
      storyOutline?: DialogueStoryOutline | null;
    }): void {
      // WO-3.8 (反馈 1): capture the bear reply that's about to be replaced so
      // the next render of the recording view can show it as context. Only
      // capture when there's a real (non-empty) prior text — first turn after
      // applyStart has the opener question, which counts as the prior reply.
      const priorBearText = this.currentQuestion?.text?.trim() || null;
      if (priorBearText) {
        this.lastBearReply = priorBearText;
      }
      // Always merge arc update (defensive: even on done=true the server may
      // have set the final beat).
      if (payload.arcUpdate && typeof payload.arcUpdate === 'object') {
        this.arc = { ...this.arc, ...payload.arcUpdate };
      }
      if (payload.mode === 'cheerleader' || payload.mode === 'storyteller') {
        this.mode = payload.mode;
      }
      if (typeof payload.lastTurnSummary === 'string' && payload.lastTurnSummary.trim()) {
        // Cap to 30 visible chars (per workorder §1.3).
        const s = payload.lastTurnSummary.trim();
        this.lastTurnSummary = s.length > 30 ? s.slice(0, 30) + '…' : s;
      }
      if (payload.done) {
        this.summary = payload.summary;
        this.storyOutline = payload.storyOutline ?? null;
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
        return;
      }
      // Server contract violation: done=false + nextQuestion=null. Drop back
      // to waiting-for-child so the kid can try again; the screen will show
      // its "didn't hear you" hint.
      console.warn('[dialogue] server returned done=false + nextQuestion=null — treating as malformed turn');
      this.phase = 'waiting-for-child';
      this.errorMessage = 'malformed_turn';
    },

    setError(message: string): void {
      this.errorMessage = message;
      this.phase = 'idle';
    },
  },
});
