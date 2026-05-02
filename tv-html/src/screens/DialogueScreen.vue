<!--
  DialogueScreen — 7-round conversation (PRD §4.3, the product's heart).

  Server contract: API_CONTRACT.md §7.2 / §7.3 (git authoritative)
    - dialogue/start req:  { childId, targetLang?, learningLang? }
    - dialogue/start resp: { dialogueId, roundCount, firstQuestion:{text, textLearning?, ttsUrl?} }
    - dialogue/turn req:   { round (1-based), userInput? OR audioBase64?, skipRemaining? }
    - dialogue/turn resp:  { done, nextQuestion?:{round,text,...}, summary?, safetyLevel, safetyReplacement? }
    - safetyLevel='blocked' → server throws ERR.CONTENT_SAFETY_BLOCKED via envelope
    - safetyLevel='warn'    → server returns 200 with safetyReplacement bear redirect

  Q2 protocol decision: TV sends audioBase64 directly to /dialogue/turn (server runs ASR
  internally). Saves ~200ms × 7 rounds = 1.4s perceived wait time across a session.

  State machine (mirrors useDialogueStore.phase):
    bear-speaking    : TTS playing the bear's prompt
    waiting-for-child: prompt finished, waiting for voice key
    recording        : child holding voice key
    uploading        : ASR + LLM in flight (server-side)
    bear-thinking    : server processing, waiting for next prompt
    finished         : done=true → kick off generation, navigate

  Hardware events (bridge):
    voice-key-down → start record (only if waiting-for-child)
    voice-key-up   → stop record + upload turn
    tts-end        → bear-speaking → waiting-for-child
  Focus:
    OK key on invisible focusable → if canEarlyEnd, skipRemaining=true

  Error handling:
    30011 ASR_FAILED        → soft hint inline, stay on screen, phase → waiting-for-child
    30012 ROUND_OVERFLOW    → soft hint inline, force generate (PRD §4.3: gentle close)
    30006 SAFETY_BLOCKED    → screen.goError (rewind_dialogue)
    others                  → screen.goError(code)
-->

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import { useDialogueStore } from '@/stores/dialogue';
import { useStoryStore } from '@/stores/story';
import { useChildStore } from '@/stores/child';
import { useScreenStore } from '@/stores/screen';
import { useBgmStore } from '@/stores/bgm';
import { useI18n } from 'vue-i18n';
import { bridge } from '@/services/bridge';
import { emit as bridgeEmit } from '@/services/bridge/pushBus';
import { useFocusable, setFocus, pushBackHandler } from '@/services/focus';
import { api, ApiError } from '@/services/api';
import type { Locale } from '@/utils/errorCodes';
import { ERR } from '@/utils/errorCodes';
import { asset } from '@/utils/assets';
// WO-3.18 Phase 4 — draft persistence helpers (saveDraft / loadDraft /
// clearDraft live in stores/draft.ts; this screen owns the lifecycle of
// "save on back" + "clear on generation kickoff").
import { saveDraft, loadDraft, clearDraft } from '@/stores/draft';

const dialogue = useDialogueStore();
const storyStore = useStoryStore();
const child = useChildStore();
const screen = useScreenStore();
const bgm = useBgmStore();
const { t, locale } = useI18n();

// ----- Local UI state -----
const okCaptureEl = ref<HTMLElement | null>(null);
const softHint = ref<string>('');
let softHintTimer: number | null = null;

/*
 * WO-3.18 Phase 3 — explicit dialogue state machine for the "waiting on
 * the child to confirm the story" beat.
 *
 *   ASKING (default)        — bear is asking, child will respond. The
 *                             standard 5-7 round flow applies.
 *
 *   WAITING_CONFIRM         — server returned `should_summarize=true` (or
 *                             the legacy `done=true` summary path). Bear
 *                             has surfaced a 1-line story summary and is
 *                             waiting for one of:
 *                               · child presses 开始画故事 button → generate
 *                               · child holds mic to keep talking      → ASKING
 *                               · child presses BACK                   → Phase 4 confirm
 *                               · neither → stay here, button pulses ∞
 *                             We DO NOT auto-advance from this state.
 *
 * The state is intentionally local (not in pinia) — it's pure UI surface
 * driven by the latest /dialogue/turn response.
 */
type DialogueWaitingState = 'asking' | 'waiting_confirm';
const dialogueState = ref<DialogueWaitingState>('asking');
/** The bear's summary line surfaced when entering waiting_confirm. */
const pendingStorySummary = ref<string>('');

/*
 * WO-3.18 Phase 4 — back-key save-draft confirm dialog. Visibility ref
 * is a plain boolean rather than a focusable so the focus system stays
 * unaware of it; the modal traps clicks inside its overlay div instead.
 */
const showBackConfirm = ref<boolean>(false);
let unregisterBackHandler: (() => void) | null = null;

let unsubVoiceDown: (() => void) | null = null;
let unsubVoiceUp: (() => void) | null = null;
let unsubTtsEnd: (() => void) | null = null;

let inFlight = false;
let mounted = true;

/*
 * WO-3.16 Part A — controller for the in-flight /dialogue/turn fetch.
 * Created in submitTurn(), aborted from onVoiceKeyDown when the child
 * presses the mic during 'uploading' / 'bear-thinking'. AbortError
 * propagates back through submitTurn's catch as a silent no-op.
 */
let currentTurnAbortController: AbortController | null = null;

/*
 * WO-3.16 Part B — 200ms long-press debounce so a stray finger tap on
 * touch screens (iPhone Safari / iPad) doesn't fire a 0.1s noise
 * recording. Hardware GP15 mic key has its own debounce; for browsers
 * the JS-side guard below is the safety net.
 */
const PRESS_DOWN_DEBOUNCE_MS = 200;
let pressDownTimer: number | null = null;

/**
 * 2026-04-24: dev-only `?demoPhase=3A|3B|3C` query param — when present,
 * skips the server call and pins the screen to a specific visual state
 * so the designer can screenshot all three without wiring real ASR/TTS.
 *
 * `isDevBrowser` — any browser session with ?dev=1 is treated as demo:
 * no dialogueStart / dialogueTurn API calls (they'd 401 and punt us to
 * ErrorScreen). Defaults to state 3A when demoPhase is absent.
 */
type DemoPhase = '3A' | '3B' | '3C';
function readDemoPhase(): DemoPhase | null {
  if (typeof window === 'undefined') return null;
  // 1) Module-scoped override (set by Gallery sidebar sub-entry clicks).
  //    Checked first so gallery 3A/3B/3C switches take effect without reload.
  const w = window as unknown as { __WB_DEMO_PHASE?: string };
  if (w.__WB_DEMO_PHASE === '3A' || w.__WB_DEMO_PHASE === '3B' || w.__WB_DEMO_PHASE === '3C') {
    return w.__WB_DEMO_PHASE;
  }
  // 2) URL param (deep-link outside gallery).
  const p = new URLSearchParams(window.location.search).get('demoPhase');
  if (p === '3A' || p === '3B' || p === '3C') return p;
  return null;
}
function readIsDevBrowser(): boolean {
  if (import.meta.env.DEV) return true;
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).has('dev');
}
const demoPhase = readDemoPhase();
const isDevBrowser = readIsDevBrowser();

/*
 * Mic-alternation timer for 3B (ui_mic ↔ ui_mic_active every 800 ms).
 * iter13g-13: 3C bear now cycles bear_react_3 ↔ bear_react_2 every
 * 450 ms (ping-pong "react" animation) instead of the earlier static
 * bear_mouth_half frame.
 */
const micActive = ref(false);
const reactToggle = ref(false);
let micTimer: number | null = null;
let reactTimer: number | null = null;

/*
 * bearImage (legacy phase→sprite map) removed 2026-04-24 iter7 — the
 * 3A/3B/3C templates pick their own sprite inline per visual state.
 */

/**
 * 3A/3B/3C visual state derived from the store phase.
 *
 *   3A · waiting  : bear flying, centered, "hold mic to talk" hint
 *   3B · listening: bear in headphones, mic alternating animation
 *   3C · responding: split layout, bubble text + mouth-sync animation
 *
 * Demo override (?demoPhase=3A|3B|3C) wins if present.
 */
const uiState = computed<'3A' | '3B' | '3C'>(() => {
  if (demoPhase) return demoPhase;
  switch (dialogue.phase) {
    case 'recording': return '3B';
    case 'bear-speaking': return '3C';
    case 'uploading':
    case 'bear-thinking': return '3C'; // thinking shows bubble too
    case 'waiting-for-child':
    case 'finished':
    case 'idle':
    default: return '3A';
  }
});

/**
 * 3C bubble text — real store value when present, demo filler otherwise.
 * Also shows the demo "child reply" line in the bubble for iter7 preview.
 */
const bubbleText = computed<string>(() => {
  if (demoPhase === '3C') return t('dialogue.demoReply');
  return dialogue.currentQuestion?.text ?? '';
});
const bubbleSubText = computed<string>(() =>
  dialogue.currentQuestion?.textLearning ?? '',
);

/* phaseLabel / showEarlyEndHint removed iter7 — their info is now baked into
 * the 3A/3B/3C sub-layouts directly. */

const progressDots = computed<Array<{ filled: boolean; current: boolean }>>(() => {
  const total = dialogue.roundCount;
  const cur = dialogue.round; // 1-based
  return Array.from({ length: total }, (_, i) => {
    const oneBased = i + 1;
    return { filled: oneBased < cur, current: oneBased === cur };
  });
});

// ----- Helpers -----
function setSoftHint(msg: string, durationMs: number = 2000): void {
  softHint.value = msg;
  if (softHintTimer != null) window.clearTimeout(softHintTimer);
  softHintTimer = window.setTimeout(() => {
    softHint.value = '';
    softHintTimer = null;
  }, durationMs);
}

function clearAllListeners(): void {
  unsubVoiceDown?.(); unsubVoiceDown = null;
  unsubVoiceUp?.(); unsubVoiceUp = null;
  unsubTtsEnd?.(); unsubTtsEnd = null;
}

function speakOrAdvance(): void {
  const q = dialogue.currentQuestion;
  if (q?.ttsUrl) {
    dialogue.setPhase('bear-speaking');
    bridge.playTts(q.ttsUrl);
  } else if (isDevBrowser) {
    // 2026-04-27 dev: hold the 3C "bear speaking" bubble visible long
    // enough for reviewers to read the new question, then drop back to
    // waiting-for-child so they can press OK again to advance.
    dialogue.setPhase('bear-speaking');
    window.setTimeout(() => {
      if (mounted) dialogue.setPhase('waiting-for-child');
    }, 2200);
  } else {
    // No TTS provided — assume bear "spoke" instantly, jump to waiting.
    dialogue.setPhase('waiting-for-child');
  }
}

/*
 * WO-3.18 Phase 4 — utility: does this screen currently hold "draft-worthy"
 * content? We avoid showing the save-draft prompt for empty sessions
 * (e.g. user pressed CREATE → BACK before saying anything) since saving
 * an empty draft would just clutter the recover-prompt logic later.
 */
function hasDraftableContent(): boolean {
  if (dialogueState.value === 'waiting_confirm') return true;
  if (dialogue.summary) return true;
  // Per dialogue store contract round starts at 1 even on opener — only
  // round >= 2 means at least one user turn was contributed.
  return dialogue.round >= 2;
}

/*
 * WO-3.18 Phase 4 — write the current dialogue state into localStorage so
 * the kid can resume from CreateScreen later. Called from the back-key
 * save flow below; clearDraft() takes the opposite path on "discard".
 */
function persistCurrentDraft(): void {
  saveDraft({
    dialogueId: dialogue.dialogueId,
    conversationHistory: [],
    outlineSummary:
      pendingStorySummary.value ||
      (dialogue.summary
        ? [
            dialogue.summary.mainCharacter,
            dialogue.summary.scene,
            dialogue.summary.conflict,
          ]
            .filter(Boolean)
            .join(' · ')
        : ''),
    protagonistName: '',
    turnCount: dialogue.round,
  });
}

async function startGenerationAndNavigate(): Promise<void> {
  // WO-3.18 Phase 4 — successful kickoff means the draft is no longer
  // "in progress"; wipe it so the next CREATE entry starts clean.
  clearDraft();
  // 2026-04-27 dev/gallery: skip the real /story/generate call, seed the
  // store with a mock id and let GeneratingScreen run its built-in demo
  // progress animation. Lets reviewers walk the full create→cover→body
  // chain offline.
  if (isDevBrowser) {
    storyStore.startGeneration({
      storyId: 'demo-gen-' + Date.now(),
      estimatedDurationSec: 75,
      queuePosition: 1,
    });
    screen.go('generating');
    return;
  }
  if (!dialogue.dialogueId) {
    bridge.log('dialogue', { event: 'generate_no_dialogue_id' });
    screen.goError(ERR.STORY_GEN_FAILED);
    return;
  }
  const childId = child.activeChildId;
  if (!childId) {
    screen.goError(ERR.CHILD_NOT_FOUND);
    return;
  }
  // PHASE2 2026-04-28 §1.1: this kicks off the real /story/generate
  // (LLM + 12 fal-kontext images + ElevenLabs TTS, ≈$0.92 / story).
  // Droid MUST NOT trigger this during the night shift; Kristy will
  // walk through the dialogue → ready-painter CTA manually in the
  // morning. Production contract per E2E-TV-002 report §2: payload
  // must include BOTH dialogueId AND childId (not just dialogueId).
  try {
    const { data } = await api.storyGenerate({
      dialogueId: dialogue.dialogueId,
      childId,
    });
    storyStore.startGeneration({
      storyId: data.storyId,
      estimatedDurationSec: data.estimatedDurationSec,
      queuePosition: data.queuePosition,
    });
    screen.go('generating');
  } catch (e) {
    const code = e instanceof ApiError ? e.code : ERR.STORY_GEN_FAILED;
    screen.goError(code);
  }
}

// ----- Core flow -----
async function startDialogue(): Promise<void> {
  dialogue.reset();
  const childId = child.activeChildId;
  if (!childId) {
    bridge.log('dialogue', { event: 'no_active_child' });
    screen.goError(ERR.CHILD_NOT_FOUND);
    return;
  }

  try {
    const { data } = await api.dialogueStart({
      childId,
      targetLang: locale.value as Locale,
      learningLang: child.activeSecondLang,
    });
    dialogue.applyStart({
      dialogueId: data.dialogueId,
      roundCount: data.roundCount,
      firstQuestion: data.firstQuestion,
    });
    setSoftHint(t('dialogue.starting'), 1500);
    speakOrAdvance();
  } catch (e) {
    const code = e instanceof ApiError ? e.code : ERR.INTERNAL_ERROR;
    screen.goError(code);
  }
}

/*
 * WO-3.16 Part A + B —
 *   Part A: route every voice-key-down to a phase-aware handler so the
 *           mic stays "alive" in bear-speaking / uploading /
 *           bear-thinking (interrupt) instead of being silently dropped.
 *   Part B: defer the actual recording start by 200ms so a stray short
 *           tap on a touch screen does not produce a 0.1s noise upload.
 */
function onVoiceKeyDown(): void {
  if (!mounted) return;

  switch (dialogue.phase) {
    case 'waiting-for-child':
      // WO-3.16 Part A — normal start path. Hand off to debounce.
      schedulePressDownAfterDebounce();
      break;

    case 'bear-speaking':
      // WO-3.16 Part A — long-press during TTS = "interrupt the bear".
      // Stop TTS immediately, flip phase so the debounce can record.
      bridge.stopTts();
      dialogue.setPhase('waiting-for-child');
      schedulePressDownAfterDebounce();
      break;

    case 'uploading':
    case 'bear-thinking':
      // WO-3.16 Part A — child wants to insert a thought while the
      // server is still processing the prior turn. Cancel the in-flight
      // request, drop inFlight, and fall through to the debounce path.
      currentTurnAbortController?.abort();
      currentTurnAbortController = null;
      inFlight = false;
      dialogue.setPhase('waiting-for-child');
      schedulePressDownAfterDebounce();
      break;

    case 'recording':
    case 'idle':
    case 'finished':
      // Already recording, or in a terminal/initialising state — ignore.
      return;
  }
}

/*
 * WO-3.16 Part B — schedule the real bridge.startVoiceRecord call after
 * PRESS_DOWN_DEBOUNCE_MS. If the user releases (onVoiceKeyUp) before
 * the timer fires, we treat it as a stray tap and clear the timer.
 */
function schedulePressDownAfterDebounce(): void {
  if (pressDownTimer != null) {
    window.clearTimeout(pressDownTimer);
  }
  pressDownTimer = window.setTimeout(() => {
    pressDownTimer = null;
    if (!mounted) return;
    // Race guard — phase may have shifted during the 200ms wait.
    if (dialogue.phase !== 'waiting-for-child') return;
    actuallyStartRecord();
  }, PRESS_DOWN_DEBOUNCE_MS);
}

/*
 * WO-3.16 Part B — actual call into bridge.startVoiceRecord, lifted
 * out of the old onVoiceKeyDown so the debounce path is the single
 * entry point that flips phase to 'recording'.
 */
function actuallyStartRecord(): void {
  if (inFlight) return;
  // WO-3.18 Phase 3 — child speaking again exits WAITING_CONFIRM. Per WO
  // §execution Phase 3 spec: "按话筒说话 → 回到 ASKING (继续聊)". The
  // bear's previous summary becomes stale; they may produce a new one
  // after another 2-4 turns.
  if (dialogueState.value === 'waiting_confirm') {
    dialogueState.value = 'asking';
    pendingStorySummary.value = '';
  }
  try {
    const ret = bridge.startVoiceRecord('dialogue');
    if (ret && typeof (ret as Promise<void>).then === 'function') {
      (ret as Promise<void>).catch((err) => {
        bridge.log('dialogue', { event: 'start_record_failed', err: String(err) });
        dialogue.setPhase('waiting-for-child');
        setSoftHint(t('dialogue.didNotHear'));
      });
    }
    dialogue.setPhase('recording');
  } catch (err) {
    bridge.log('dialogue', { event: 'start_record_threw', err: String(err) });
    setSoftHint(t('dialogue.didNotHear'));
  }
}

async function onVoiceKeyUp(): Promise<void> {
  if (!mounted) return;

  // WO-3.16 Part B — short-press detection. If the debounce timer is
  // still pending, the press was <200ms — treat as accidental tap and
  // do NOT start a recording.
  if (pressDownTimer != null) {
    window.clearTimeout(pressDownTimer);
    pressDownTimer = null;
    return;
  }

  if (dialogue.phase !== 'recording') return;
  if (inFlight) return;

  inFlight = true;
  dialogue.setPhase('uploading');

  let audioBase64: string | null = null;
  try {
    const result = bridge.stopVoiceRecord();
    audioBase64 = result instanceof Promise ? await result : result;
  } catch (err) {
    bridge.log('dialogue', { event: 'stop_record_failed', err: String(err) });
  }

  if (!audioBase64) {
    inFlight = false;
    setSoftHint(t('dialogue.didNotHear'));
    dialogue.setPhase('waiting-for-child');
    return;
  }

  await submitTurn({ audioBase64, skipRemaining: false });
  inFlight = false;
}

async function onOkKey(): Promise<void> {
  if (!mounted) return;
  if (dialogue.phase !== 'waiting-for-child' && dialogue.phase !== 'bear-speaking') return;
  if (inFlight) return;

  // 2026-04-27 dev/gallery: pressing OK simulates one full turn of the
  // child speaking. We deliberately step through the visual states so
  // reviewers SEE every screen of the ceremony:
  //   3A waiting → 3B "bear listening" with mic pulse (1.4s)
  //   → 3C "bear replying" with speech bubble (≥2.2s, via speakOrAdvance)
  //   → back to 3A waiting OR to ready-painter on the final round.
  if (isDevBrowser) {
    bridge.stopTts();
    inFlight = true;
    dialogue.setPhase('recording');
    startMicAlternation();
    window.setTimeout(() => {
      if (!mounted) return;
      stopMicAlternation();
      dialogue.setPhase('uploading');
      void submitTurn({ skipRemaining: false }).then(() => {
        inFlight = false;
      });
    }, 1400);
    return;
  }

  if (!dialogue.canEarlyEnd) return;
  bridge.stopTts();
  inFlight = true;
  dialogue.setPhase('uploading');
  await submitTurn({ skipRemaining: true });
  inFlight = false;
}

async function submitTurn(payload: {
  audioBase64?: string;
  skipRemaining: boolean;
}): Promise<void> {
  if (!dialogue.dialogueId) {
    screen.goError(ERR.STORY_GEN_FAILED);
    return;
  }
  // 2026-04-27 dev/gallery: skip /dialogue/turn — synthesize a mock
  // next-question or done payload so reviewers can experience the full
  // back-and-forth ceremony (你一句我一句 → 5 rounds → generating).
  if (isDevBrowser) {
    const demoQs = [
      'What kind of adventure do you want today?',
      'Where should our hero live — a forest, the ocean, or the clouds?',
      'Who joins them on the journey — a friend, a pet, or a magical creature?',
      'What is the biggest challenge they have to overcome?',
      'And how do you want it to end — happy, brave, or full of surprise?',
    ];
    const nextRound = dialogue.round + 1;
    const isDone = payload.skipRemaining || nextRound > dialogue.roundCount;
    if (isDone) {
      // Final round in dev: stay on 3C with a "summary" bubble +
      // painter-bear ready button focused. User must press OK on the
      // button to actually launch GeneratingScreen — gives reviewers
      // a beat to see the bear's wrap-up + the launch CTA.
      dialogue.summary = {
        mainCharacter: 'Dora',
        scene: 'glowing forest',
        conflict: 'lost the golden key',
      };
      dialogue.currentQuestion = {
        text: t('dialogue.demoReply'),
        textLearning: null,
        ttsUrl: null,
      };
      dialogue.setPhase('bear-speaking');
      void nextTick().then(() => setFocus('dialogue-ready-painter'));
      return;
    }
    dialogue.applyTurn({
      done: false,
      nextQuestion: {
        round: nextRound,
        text: demoQs[nextRound - 1] ?? demoQs[0]!,
        textLearning: null,
        ttsUrl: null,
      },
      summary: null,
      safetyLevel: 'ok',
    });
    speakOrAdvance();
    return;
  }
  // PHASE2 2026-04-28 §3.1: real /story/dialogue/:id/turn round trip.
  // Server runs ASR internally on audioBase64 (patch v3) and returns
  // the bear's next question or a `done=true` summary. Each turn costs
  // ~$0.02 (Whisper ASR + Gemini LLM); 7 turns ≈ $0.14. Acceptable for
  // a real run, but the night shift droid only validates 1 turn via
  // /tmp/p1.mp3 fallback (workorder §4.4) — never the full ceremony.
  // WO-3.16 Part A — open an AbortController so a follow-up
  // voice-key-down can cancel this fetch in flight.
  currentTurnAbortController = new AbortController();
  const turnSignal = currentTurnAbortController.signal;
  try {
    // Per patch v3: audioMimeType is REQUIRED when audioBase64 is present.
    // Browser mock bridge produces audio/webm (MediaRecorder default on Chromium).
    // Real GP15 shell will produce audio/wav (per §5.1 SCO stream → PCM WAV).
    // When the real bridge lands, expose bridge.getRecordedMimeType() and use it here.
    const audioMimeType = payload.audioBase64
      ? (bridge.isMock ? 'audio/webm' : 'audio/wav')
      : undefined;

    const { data } = await api.dialogueTurn(dialogue.dialogueId, {
      round: dialogue.round,
      audioBase64: payload.audioBase64,
      audioMimeType,
      skipRemaining: payload.skipRemaining,
      locale: locale.value as Locale,
    }, { signal: turnSignal });

    dialogue.applyTurn({
      done: data.done,
      nextQuestion: data.nextQuestion,
      summary: data.summary,
      safetyLevel: data.safetyLevel,
      safetyReplacement: data.safetyReplacement,
      mode: data.mode ?? null,
      lastTurnSummary: data.lastTurnSummary ?? null,
      arcUpdate: data.arcUpdate ?? null,
      storyOutline: data.storyOutline ?? null,
    });

    // WO-3.18 Phase 3 — switch to WAITING_CONFIRM the moment the bear
    // produces a summary the child can act on. We accept either:
    //   · the new `should_summarize=true` field (Phase 3 prompt revamp), or
    //   · the legacy `done=true` path (back-compat with v7.2 servers that
    //     don't yet emit should_summarize).
    // The legacy path also gets the debounced auto-advance (timeout
    // below) — we keep it as a fallback so older servers still finish
    // the dialogue. Once should_summarize is in production this branch
    // is the primary path.
    const should_summarize_flag = (data as { should_summarize?: boolean }).should_summarize === true;
    const story_summary_text = (data as { story_summary?: string | null }).story_summary;
    if (should_summarize_flag) {
      dialogueState.value = 'waiting_confirm';
      pendingStorySummary.value =
        typeof story_summary_text === 'string' && story_summary_text.trim()
          ? story_summary_text.trim()
          : t('dialogue.demoReply');
      // Park focus on the confirm button so OK starts generation.
      void nextTick().then(() => setFocus('dialogue-ready-painter'));
      // No further action — we explicitly DO NOT navigate or auto-finish.
      return;
    }

    if (data.done) {
      // v7.2: when the server provides a storyOutline (3-5 paragraphs)
      // we route through the new StoryPreviewScreen so the kid sees their
      // story laid out and presses Enter to start generating. If the
      // outline is missing (legacy server / null path), fall back to the
      // direct generate→generating navigation as before.
      window.setTimeout(() => {
        if (!mounted) return;
        if (data.storyOutline?.paragraphs?.length) {
          screen.go('story-preview');
        } else {
          startGenerationAndNavigate();
        }
      }, 600);
    } else {
      speakOrAdvance();
    }
  } catch (e) {
    // WO-3.16 Part A — user-initiated abort surfaces as DOMException
    // 'AbortError'. Treat it as silent: the new onVoiceKeyDown path has
    // already moved phase → waiting-for-child and reset inFlight, so we
    // just bail without showing an error.
    if (e instanceof DOMException && e.name === 'AbortError') {
      return;
    }
    if (!(e instanceof ApiError)) {
      screen.goError(ERR.INTERNAL_ERROR);
      return;
    }
    handleTurnError(e);
  } finally {
    // WO-3.16 Part A — release the controller. Guarded against the
    // case where a newer turn already overwrote it.
    if (currentTurnAbortController?.signal === turnSignal) {
      currentTurnAbortController = null;
    }
  }
}

function handleTurnError(err: ApiError): void {
  switch (err.code) {
    case ERR.ASR_FAILED:
      // Stay on screen, soft hint, let kid try again.
      setSoftHint(t('dialogue.didNotHear'), 2500);
      dialogue.setPhase('waiting-for-child');
      break;
    case ERR.DIALOGUE_ROUND_OVERFLOW:
      // PRD §4.3: gentle close, not an error.
      setSoftHint(t('dialogue.willPaintNow'), 1500);
      window.setTimeout(() => {
        if (mounted) startGenerationAndNavigate();
      }, 1500);
      break;
    default:
      // Includes 30006 SAFETY_BLOCKED → ErrorScreen handles rewind_dialogue.
      screen.goError(err.code);
      break;
  }
}

// iter13j-2: 3C "Ready for painting" CTA
const readyBtnRef = ref<HTMLElement | null>(null);

/*
 * WO-3.6: UI mic button state. Hooks into the same bridge events as the
 * GP15 hardware key (voice-key-down / voice-key-up) so the dialogue
 * state machine has a single ingress path. The hardware listener wired
 * in onMounted (`bridge.on('voice-key-down', onVoiceKeyDown)`) handles
 * both sources; this button simply emits the events on press / release.
 */
const micPressed = ref(false);

function onMicDown(): void {
  if (!mounted) return;
  if (micPressed.value) return;
  micPressed.value = true;
  bridgeEmit('voice-key-down');
}

function onMicUp(): void {
  if (!mounted) return;
  if (!micPressed.value) return;
  micPressed.value = false;
  bridgeEmit('voice-key-up');
}

/*
 * iter13g-15: Dialogue is now 100% voice-driven. All action buttons
 * (Redo / Confirm / Magic) were removed because:
 *   - 3B auto-sends when the kid releases the mic key
 *   - 3C auto-plays AI's reply; to disagree the kid just holds mic again
 * Only the invisible okCapture focusable is kept so the hardware OK key
 * can still trigger the early-end path when `dialogue.canEarlyEnd` is true.
 */

// WO-3.6: scene-card focusables removed (theme cards deprecated). The
// dialogue is now fully voice-driven — child holds mic (GP15 key or UI
// button) to start the first turn. OK-capture below remains for the
// early-end shortcut.
useFocusable(okCaptureEl, {
  id: 'dialogue-ok-capture',
  autoFocus: true,
  onEnter: () => { onOkKey(); },
});

/*
 * iter13j-2: "Ready for painting" focusable on 3C. When the kid presses
 * OK we jump straight into story generation (same path as the 7-round
 * limit would take). This is the explicit affirmative — "I like this
 * reply, go draw it now".
 */
useFocusable(readyBtnRef, {
  id: 'dialogue-ready-painter',
  onEnter: () => { void startGenerationAndNavigate(); },
});

/*
 * WO-3.18 Phase 4 — handlers for the back-key save-draft modal. Both
 * close the modal and pop the screen; the difference is whether we
 * write to localStorage or wipe it. Per WO §execution Phase 4 Step 4.3:
 *   [保留] → saveDraft + go home
 *   [取消] → clearDraft + go home
 *
 * We route via screen.back() (not screen.go('home')) so flows that
 * entered DialogueScreen from CreateScreen / FavoritesScreen pop back
 * to the actual entry point rather than always landing at home.
 */
function onBackConfirmKeep(): void {
  persistCurrentDraft();
  showBackConfirm.value = false;
  // Defer screen.back so the modal v-if has time to unmount cleanly
  // and the focus reset doesn't try to refocus a vanished dialog.
  void nextTick().then(() => screen.back());
}

function onBackConfirmDiscard(): void {
  clearDraft();
  showBackConfirm.value = false;
  void nextTick().then(() => screen.back());
}

function startMicAlternation(): void {
  if (micTimer != null) return;
  micTimer = window.setInterval(() => {
    micActive.value = !micActive.value;
  }, 800);
}
function stopMicAlternation(): void {
  if (micTimer != null) { window.clearInterval(micTimer); micTimer = null; }
  micActive.value = false;
}
/*
 * iter13g-13 · 3C bear uses a 2-frame ping-pong:
 *   reactToggle=false → bear_react_3.webp
 *   reactToggle=true  → bear_react_2.webp
 *   flips every 450 ms so the bear looks alive while replying.
 */
function startReactLoop(): void {
  if (reactTimer != null) return;
  /* iter13g-16/17: slowed 450 → 700 → 1000 ms per frame. 1-second
   * beats line up with natural TTS rhythm and read as a calm nod. */
  reactTimer = window.setInterval(() => {
    reactToggle.value = !reactToggle.value;
  }, 1000);
}
function stopReactLoop(): void {
  if (reactTimer != null) { window.clearInterval(reactTimer); reactTimer = null; }
  reactToggle.value = false;
}
// Start / stop alternations as uiState switches.
watch(uiState, (cur, prev) => {
  if (cur === '3B') startMicAlternation(); else if (prev === '3B') stopMicAlternation();
  if (cur === '3C') startReactLoop(); else if (prev === '3C') stopReactLoop();
  // 2026-04-27: only park focus on ready-painter when it actually
  // exists (final round, summary set). Mid-ceremony 3C bubbles must NOT
  // show the painter CTA, so blindly setFocus there silently failed and
  // sometimes left focus stranded. Keep dialogue-ok-capture focused
  // during mid-rounds so the next OK keystroke advances normally.
  if (cur === '3C' && dialogue.summary) {
    nextTick().then(() => setFocus('dialogue-ready-painter'));
  }
}, { immediate: false });

onMounted(() => {
  bgm.play('chat');

  unsubVoiceDown = bridge.on('voice-key-down', onVoiceKeyDown);
  unsubVoiceUp = bridge.on('voice-key-up', onVoiceKeyUp);
  unsubTtsEnd = bridge.on('tts-end', () => {
    if (!mounted) return;
    if (dialogue.phase === 'bear-speaking') {
      dialogue.setPhase('waiting-for-child');
    }
  });

  /*
   * WO-3.18 Phase 4 — back-key intercept.
   * pushBackHandler returns `true` to mark the key consumed; we open the
   * "故事还没画,要保留吗?" confirm dialog instead of letting the
   * default onBack pop the screen. If there is no draft-worthy content
   * (empty session, user just pressed CREATE → BACK), we return false
   * and let the default fallback take the user back to the previous
   * screen as usual.
   */
  unregisterBackHandler = pushBackHandler(() => {
    if (!mounted) return false;
    if (showBackConfirm.value) return true; // already showing — swallow
    if (!hasDraftableContent()) return false;
    showBackConfirm.value = true;
    return true;
  });

  /*
   * WO-3.18 Phase 4 — recover-draft path. Triggered when CreateScreen's
   * "+" handler detects an active draft and routes here with
   * { restoreDraft: true } in the payload. We seed the dialogue store
   * with the draft contents so the kid lands directly on the same
   * waiting_confirm UI they left earlier.
   *
   * Failure-mode: if loadDraft returns null (expired between CreateScreen
   * decision and DialogueScreen mount), we silently fall through to
   * startDialogue() — same outcome as picking "新故事".
   */
  const restoreDraft = !!screen.payload?.restoreDraft;
  if (restoreDraft) {
    const drafted = loadDraft();
    if (drafted) {
      // Seed the store enough that the WAITING_CONFIRM UI shows.
      dialogue.dialogueId = drafted.dialogueId;
      dialogue.round = Math.max(1, drafted.turnCount);
      dialogue.canEarlyEnd = true;
      dialogue.setPhase('bear-speaking');
      dialogueState.value = 'waiting_confirm';
      pendingStorySummary.value = drafted.outlineSummary || t('dialogue.demoReply');
      // Show the bear's last-known summary in the bubble — the kid
      // recognises the screen they left and sees the same CTA.
      dialogue.currentQuestion = {
        text: drafted.outlineSummary || t('dialogue.demoReply'),
        textLearning: null,
        ttsUrl: null,
      };
      void nextTick().then(() => setFocus('dialogue-ready-painter'));
      return;
    }
    // Stale draft — drop and fall through.
    clearDraft();
  }

  // Demo / dev mode — skip server calls entirely; pin to demoPhase
  // (or default to 3A). This is what keeps ?dev=1 URLs from 401→ErrorScreen.
  if (demoPhase || isDevBrowser) {
    // 2026-04-27: seed a demo first question so the speech bubble shows
    // real "你一句" copy instead of an empty box. Without this, dev/dialogue
    // visits looked like the screen was broken.
    if (!demoPhase) {
      // Reset summary BEFORE applyStart so a second visit (e.g. ESC
      // back from GeneratingScreen) starts fresh — otherwise the
      // ready-painter button would stay visible from the prior session
      // and the auto-demo loop would short-circuit on its first tick.
      dialogue.summary = null;
      dialogue.applyStart({
        dialogueId: 'demo-dialogue-' + Date.now(),
        roundCount: 5,
        firstQuestion: {
          text: t('dialogue.demoQuestion'),
          textLearning: null,
          ttsUrl: null,
        },
      });
      dialogue.canEarlyEnd = true;
    }
    const ph = demoPhase ?? '3A';
    if (ph === '3A') {
      // 2026-04-27: per founder, the dialogue ceremony itself isn't
      // worth fighting in dev — real data wires it up later. What
      // matters NOW is that reviewers can SEE the painter-bear CTA and
      // the GeneratingScreen behind it. So: drop the dev session
      // straight onto the final round (3C bubble + summary + ready
      // button focused). Pressing OK on the button kicks off
      // GeneratingScreen with its progress bar + walking bear.
      dialogue.summary = {
        mainCharacter: 'Dora',
        scene: 'glowing forest',
        conflict: 'lost the golden key',
      };
      dialogue.currentQuestion = {
        text: t('dialogue.demoReply'),
        textLearning: null,
        ttsUrl: null,
      };
      dialogue.round = dialogue.roundCount;
      dialogue.setPhase('bear-speaking');
      // Park focus on the painter-bear button so OK launches generation.
      // ready-row uses v-show so readyBtnRef is registered at mount,
      // making this setFocus reliable.
      nextTick().then(() => setFocus('dialogue-ready-painter'));
    }
    if (ph === '3B') {
      // Kid is talking → bear is LISTENING (headphones pose) + mic pulses.
      dialogue.setPhase('recording');
      startMicAlternation();
    }
    if (ph === '3C') {
      /*
       * iter13g-13/14: bear cycles bear_react_2/3 while "speaking".
       * Previously this branch set phase but left the loop unstarted
       * because the watch(uiState) fires only on CHANGE (immediate:false)
       * — in demo mode there is no state change, so the loop never ran
       * and the bear looked frozen. Kick it off manually here.
       */
      dialogue.setPhase('bear-speaking');
      startReactLoop();
      // iter13j-2: same reason as the watch(uiState) branch — demo mode
      // doesn't trigger the watcher, so manually park focus on the
      // "Ready for painting" CTA.
      nextTick().then(() => setFocus('dialogue-ready-painter'));
    }
    return;
  }

  startDialogue();
});

onBeforeUnmount(() => {
  mounted = false;
  // WO-3.18 Phase 4 — drop the back-key handler so it can't fire
  // against an unmounted screen and trip the modal phantom-state bug.
  if (unregisterBackHandler) {
    unregisterBackHandler();
    unregisterBackHandler = null;
  }
  if (softHintTimer != null) {
    window.clearTimeout(softHintTimer);
    softHintTimer = null;
  }
  // WO-3.16 Part B — drop any pending press-down debounce timer so it
  // can't fire after the screen unmounts.
  if (pressDownTimer != null) {
    window.clearTimeout(pressDownTimer);
    pressDownTimer = null;
  }
  // WO-3.16 Part A — abort any in-flight turn so the response cannot
  // try to mutate the store after the screen is gone.
  currentTurnAbortController?.abort();
  currentTurnAbortController = null;
  stopMicAlternation();
  stopReactLoop();
  bridge.stopTts();
  clearAllListeners();
  // Don't reset the store here — GeneratingScreen / ErrorScreen may want to read dialogueId.
});
</script>

<template>
  <div class="dialogue-screen">
    <!--
      iter13g-5: 3A uses story_generic_sky as the page background — bear
      with magic wand reads naturally as "floating in the sky" and frees
      us from the cushion-landing constraint on bg_chat. 3B / 3C keep
      bg_chat so their bear poses (listening, talking) still make sense
      in the cozy indoor setting.
    -->
    <!--
      iter13g-13:
        - 3A: story_generic_sky (bear magic-wand floats in sky)
        - 3B: bg_chat (cushion, kid talks here)
        - 3C: bg_home_cozy (calmer living-room palette for bear's reply)
    -->
    <img
      class="bg"
      :src="asset(
        uiState === '3A' ? 'story/story_generic_sky.webp' :
        uiState === '3C' ? 'bg/bg_home_cozy.webp' :
        'bg/bg_chat.webp'
      )"
      alt=""
      aria-hidden="true"
    >

    <header class="topbar">
      <div class="progress-dots">
        <span
          v-for="(d, i) in progressDots"
          :key="i"
          class="dot"
          :class="{ filled: d.filled, current: d.current }"
        />
      </div>
      <div class="progress-label wb-text-shadow-sm">
        {{ t('dialogue.progress', {
          current: dialogue.round,
          total: dialogue.roundCount,
        }) }}
      </div>
    </header>

    <!--
      v7.2 turn-summary ribbon — shows server's `lastTurnSummary` in a 30-char
      strip above the bear. Only visible from round 2 onwards (round 1 has
      no prior turn to summarize). Capped at 30 visible chars by the store.
    -->
    <div
      v-if="dialogue.lastTurnSummary && dialogue.round >= 2"
      class="turn-summary-ribbon wb-text-shadow-sm"
      role="status"
    >
      <span class="turn-summary-label">{{ t('dialogue.youSaid') }}</span>
      <span class="turn-summary-text">{{ dialogue.lastTurnSummary }}</span>
    </div>

    <!--
      3A · Waiting for child to press mic.
      WO-3.6: 4-grid theme cards (Forest/Ocean/Space/AtHome) removed —
      产品决策:对话是自由编故事,主题卡会让用户误解为"必须选主题".
      Layout simplified to bear (centered) + tappable mic icon + hint
      pill. WO-3.10: the right-column mic icon (was a passive remote
      icon) is now a button-wrapped clickable mic that gives PC / 平板
      a UI fallback for the GP15 hardware key.
    -->
    <main v-if="uiState === '3A'" class="stage stage-3a">
      <div class="col-3a col-bear-3a">
        <img
          class="bear bear-3a"
          :src="asset('bear/bear_magic_wand.webp')"
          alt=""
        >
      </div>

      <!--
        v7.2 §1.3: round 1 shows the full "hold mic" text so the kid learns
        the gesture. From round 2 onwards we collapse it to just the remote
        icon — by then the gesture is muscle memory and the screen real
        estate is better spent on the conversation.
      -->
      <div
        class="hold-hint-pill wb-text-shadow"
        :class="{ 'is-compact': dialogue.round >= 2 }"
      >
        <img
          v-if="dialogue.round >= 2"
          class="hold-hint-icon"
          :src="asset('ui/ui_remote.webp')"
          alt=""
          aria-hidden="true"
        />
        <span v-else>{{ t('dialogue.holdMicHint') }}</span>
      </div>

    </main>

    <!--
      3B · Child is speaking (mic held)
      iter13g-8: bear sits ON the cushion at center-bottom of bg_chat —
      swap to a bottom-anchored wrap with translateY so the paws plant
      on the cushion instead of floating above it. No action bar here
      either — releasing the mic auto-sends, there's nothing to confirm.
    -->
    <main v-else-if="uiState === '3B'" class="stage stage-3b">
      <!--
        WO-3.11: show the CURRENT bear question (not prior reply) so the
        child can glance up and re-read what they're answering if they
        forget mid-sentence. Replaces WO-3.8's lastBearReply (wrong
        semantics).
      -->
      <div
        v-if="dialogue.currentQuestion?.text"
        class="prev-reply-bubble wb-text-shadow-sm"
        role="status"
      >
        {{ dialogue.currentQuestion.text }}
      </div>
      <div class="bear-wrap bear-wrap-3b">
        <img
          class="bear"
          :src="asset('bear/bear_listen_headphones.webp')"
          alt=""
        >
      </div>
      <div class="stage-text-block stage-text-3b">
        <div class="phase-text wb-text-shadow">
          {{ t('dialogue.listening') }}
        </div>
      </div>
      <div class="hint-icons-right">
        <img class="hint-img" :src="asset('ui/ui_remote.webp')" alt="" />
      </div>
    </main>

    <!-- ============ 3C · Bear responding + TTS ============ -->
    <main v-else class="stage stage-3c">
      <div class="bear-wrap-3c">
        <!--
          iter13g-13: bear now cycles bear_react_3 ↔ bear_react_2 at
          450 ms so the bear visibly reacts while replying. (Earlier
          iter11's static bear_mouth_half was too flat; founder asked
          for a proper react animation.)
        -->
        <img
          class="bear"
          :src="asset(reactToggle ? 'bear/bear_react_2.webp' : 'bear/bear_react_3.webp')"
          alt=""
        >
      </div>
      <div class="bubble-wrap">
        <!--
          iter13g-15: bubble background image (ui_char_bubble.webp) removed
          per founder — the illustrated bubble shape clashed with the
          home_cozy watercolor. Text now lives in a clean rounded slab.
        -->
        <div class="bubble bubble-plain">
          <div class="bubble-text">{{ bubbleText || t('dialogue.demoQuestion') }}</div>
          <div v-if="bubbleSubText" class="bubble-text-secondary">
            {{ bubbleSubText }}
          </div>
        </div>
      </div>
      <!--
        iter13j-2: painter-bear CTA ("可以开画啦 / Ready for painting").
        Shown directly BELOW the bubble. Focusable + autoFocus so the
        kid's thumb naturally lands on it after hearing the reply.
        Pressing OK kicks off story generation (advanceFromBearTalks).

        2026-04-27: kept always mounted (v-show vs v-if) so useFocusable
        can register readyBtnRef on first mount. Earlier v-if="summary"
        meant the button was absent at onMounted time, useFocusable's
        ref-not-bound branch fired, and the focusable was never
        registered — so even after the 5-round ceremony placed
        dialogue.summary, pressing OK on what looked like the painter
        button did nothing (focus had never moved there). v-show keeps
        DOM/focusable alive; CSS hides it for rounds 1-4.
      -->
      <!--
        WO-3.18 Phase 3 — confirm-create button (also called
        ConfirmCreateButton in the work order spec). Visible whenever the
        bear has produced a confirmable summary, either via the new
        `should_summarize` path (dialogueState === 'waiting_confirm') or
        the legacy `done=true` summary path (dialogue.summary set).
        The .is-waiting-confirm modifier turns on the keyframe pulse so
        the kid's eye is drawn to it; the button NEVER auto-presses.
      -->
      <div
        v-show="dialogue.summary || dialogueState === 'waiting_confirm'"
        class="ready-row"
      >
        <button
          ref="readyBtnRef"
          type="button"
          class="ready-btn wb-focus-feedback confirm-button ConfirmCreateButton"
          :class="{ 'is-waiting-confirm': dialogueState === 'waiting_confirm' }"
          @click="startGenerationAndNavigate()"
        >
          <img
            class="ready-avatar"
            :src="asset('avatar/avatar_bear_painter.webp')"
            alt=""
          />
          <span class="ready-label">{{ t('dialogue.readyPainter') }}</span>
        </button>
      </div>
      <!--
        iter13j-2: remote icon moved INTO the pill (next to the HOLD
        text) per founder — separate floating icon competed with the
        painter-bear CTA below the bubble. Pill now reads as one chip.
      -->
      <div class="hold-hint-pill hold-hint-pill-3c wb-text-shadow">
        <img class="hold-hint-icon" :src="asset('ui/ui_remote.webp')" alt="" aria-hidden="true" />
        <span>{{ t('dialogue.holdMicHint') }}</span>
      </div>
    </main>

    <!--
      iter13g-8: action row shows ONLY in 3C (bear has replied, kid can
      redo / confirm / magic). 3A is pure guidance; 3B auto-sends when
      the kid releases the mic key, so manual Send is redundant there.
    -->
    <!--
      iter13g-15: action bar removed entirely. The dialogue is fully
      voice-driven now: AI replies automatically after hearing the kid;
      if the kid doesn't like the reply, they just hold the remote mic
      again and re-speak. No Redo/Confirm/Magic buttons needed on 3C.
      The mic remains the single universal input.
    -->
    <!-- (action-bar removed) -->



    <Transition name="fade">
      <div v-if="softHint" class="soft-hint wb-text-shadow-sm" role="status">
        {{ softHint }}
      </div>
    </Transition>

    <!--
      WO-3.13: stage-agnostic global mic button. Lives at the screen root,
      fixed position, only visible in 3A (waiting) and 3B (listening).
      This decouples the mic from stage <main> blocks so it never moves
      across stage transitions.
    -->
    <button
      v-if="uiState === '3A' || uiState === '3B'"
      type="button"
      class="mic-floating"
      :class="{ pressed: micPressed, listening: uiState === '3B' && micActive }"
      :aria-label="t('dialogue.micButton.aria')"
      @mousedown="onMicDown"
      @mouseup="onMicUp"
      @mouseleave="onMicUp"
      @touchstart.prevent="onMicDown"
      @touchend.prevent="onMicUp"
      @touchcancel.prevent="onMicUp"
    >
      <img
        :src="asset(uiState === '3B' && micActive ? 'ui/ui_mic_active.webp' : 'ui/ui_mic.webp')"
        alt=""
        aria-hidden="true"
      />
    </button>

    <!--
      WO-3.13: stage-agnostic global remote icon (bottom-right).
      Teaching cue for kids using GP15 hardware key. Always visible in 3A
      and 3B as a passive hint.
    -->
    <img
      v-if="uiState === '3A' || uiState === '3B'"
      class="remote-floating"
      :src="asset('ui/ui_remote.webp')"
      alt=""
      aria-hidden="true"
    />

    <div ref="okCaptureEl" class="ok-capture" tabindex="-1" aria-hidden="true" />

    <!--
      WO-3.18 Phase 4 — back-key save-draft confirm modal. Renders only
      while showBackConfirm is true. Mouse/touch users tap the buttons;
      remote users press OK on whichever button is highlighted (browser-
      level focus, no useFocusable registration since the modal is short-
      lived enough that the global key router stays inactive).
    -->
    <div v-if="showBackConfirm" class="draft-modal-overlay" role="dialog" aria-modal="true">
      <div class="draft-modal-card">
        <div class="draft-modal-title">{{ t('dialogue.draft.backConfirmTitle') }}</div>
        <div class="draft-modal-actions">
          <button
            type="button"
            class="draft-modal-btn draft-modal-btn-primary"
            autofocus
            @click="onBackConfirmKeep"
          >
            {{ t('dialogue.draft.backConfirmKeep') }}
          </button>
          <button
            type="button"
            class="draft-modal-btn"
            @click="onBackConfirmDiscard"
          >
            {{ t('dialogue.draft.backConfirmDiscard') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/*
 * 2026-04-24 iter7 — full DialogueScreen visual rewrite per work order
 * (3A waiting / 3B listening / 3C responding). TV safe-area enforced:
 * 64 px L/R, 36 px top/bottom.
 */
.dialogue-screen {
  width: 100%;
  height: 100%;
  position: relative;
  background: var(--c-bg-canvas);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 1;
  z-index: 0;
  user-select: none;
  pointer-events: none;
}

/* ─── Topbar (progress) ─── */
.topbar {
  position: relative;
  z-index: 1;
  flex: 0 0 auto;
  padding: 36px 64px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.progress-dots { display: flex; gap: 8px; }
.dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: rgba(255, 245, 230, 0.2);
  border: 1.5px solid rgba(255, 245, 230, 0.25);
  transition: all var(--t-base) var(--ease-out);
}
.dot.filled {
  background: var(--c-focus-soft);
  border-color: var(--c-focus);
}
.dot.current {
  background: var(--c-focus);
  border-color: var(--c-focus);
  transform: scale(1.35);
  box-shadow: 0 0 10px var(--c-focus-soft);
}
.progress-label {
  color: var(--c-cream);
  font-size: 16px;
  font-family: var(--ff-display);
  letter-spacing: 0.06em;
}

/*
 * v7.2 turn-summary ribbon — narrow pill anchored under the topbar showing
 * the server's `lastTurnSummary` (≤30 chars). Round 1 hides it (no prior
 * turn). Higher z-index than stage so it sits above bear sprite.
 */
.turn-summary-ribbon {
  position: relative;
  z-index: 2;
  align-self: center;
  margin-top: 8px;
  padding: 6px 18px;
  border-radius: 999px;
  background: rgba(26, 15, 10, 0.55);
  display: inline-flex;
  align-items: center;
  gap: 10px;
  max-width: 720px;
  font-family: var(--ff-display);
  color: var(--c-cream);
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.turn-summary-label {
  opacity: 0.7;
  font-size: 16px;
}
.turn-summary-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ─── Stage (shared) ─── */
.stage {
  position: relative;
  z-index: 1;
  flex: 1 1 auto;
  padding: 24px 64px 36px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 0;
}
.bear {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  filter: drop-shadow(0 12px 24px rgba(0, 0, 0, 0.45));
}

/*
 * iter13g-8 · 3B layout — bear plants on cushion.
 *   align-items: flex-end pulls bear to the bottom of the stage;
 *   a small translateY(-60px) aligns paws with the cushion's surface
 *   in bg_chat (the cushion center is ~60 px above the safe-area bottom).
 *   The "Bear is listening..." label floats above the bear in its own
 *   absolute block so the bear can take the vertical center of the stage.
 */
.stage-3b {
  gap: 14px;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
  padding-bottom: 60px;
}
.bear-wrap {
  width: 380px;
  height: 380px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.bear-wrap-3b {
  width: 420px;
  height: 420px;
  /* iter13g-9/10/11: nudge another 5% (+45 px) further left → -225 px
   * total ≈ 25% of 900 px stage width. */
  transform: translate(-225px, -40px);
}
.stage-text-3b {
  order: -1;
  margin-bottom: 4px;
}
/*
 * iter13g-3 3A layout — three columns + bottom pill.
 *   [ bear 28% ][ scenes 1fr ][ remote 18% ]
 *   Bear bottom-aligned so it "stands" on the cushion in the watercolor.
 *   Remote vertically centered at the same height as bear so the kid's
 *   eye can ping-pong between them without scrolling.
 */
/*
 * iter13g-4: stage now uses align-items: center (was flex-end) and a
 * LOT of bottom padding (210 px) to reserve room for the merged pill.
 * Scenes column gets a small translateY(-30px) so they lift clear of
 * the pill; bear grows to 380 px wide × 600 px tall and gets
 * translateY(20px) so its paws land ON the cushion in bg_chat.
 */
.stage-3a {
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 28px;
  padding: 24px 64px 210px;
}
.col-3a {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 0;
}
/*
 * iter13g-5: removed the translateY(20px) cushion-landing offset —
 * background is now story_generic_sky, bear floats naturally in the
 * sky with his magic wand. No cushion to land on.
 */
.col-bear-3a {
  /* iter13g-6/7: bear +30% then −10% → net 445 px (from 380 base). */
  flex: 0 0 445px;
  height: 100%;
  justify-content: center;
}
.bear-3a {
  width: 100%;
  height: auto;
  /* iter13g-6/7: max-height 780 × 0.9 = 702 px. */
  max-height: 702px;
  object-fit: contain;
  filter: drop-shadow(0 18px 32px rgba(0, 0, 0, 0.45));
  /*
   * 2026-04-25 iter: gentle hover-float so the magic-wand bear feels
   * alive while waiting for the kid to speak. 3.2s cycle (slow, calm)
   * with ease-in-out keeps it from feeling jittery.
   */
  animation: bear-3a-float 3.2s ease-in-out infinite;
  will-change: transform;
}
@keyframes bear-3a-float {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-18px); }
}
/* WO-3.6: .col-scenes-3a / .scenes-grid / .scene-card / .scene-title CSS
 * removed along with the 4-grid theme cards. Bear + remote columns now
 * share the 3A stage with the bottom hint pill.
 * WO-3.13: .col-remote-3a + .remote-3a removed — remote is now a global
 * stage-agnostic floating icon (.remote-floating) at the screen root. */
.stage-text-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.phase-text {
  font-family: var(--ff-display);
  color: var(--c-cream);
  font-size: 44px;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-align: center;
  max-width: 900px;
}
/*
 * iter13g-2: the 3A hint text gets a translucent dark pill behind it so
 * it stays legible on the watercolor bg. 3A is the only place we use a
 * background pill on a hint line in the dialogue flow.
 */
/*
 * iter13g-4: single merged pill carries BOTH the voice CTA and the
 * "or pick a theme" prompt as one sentence. Pinned bottom-center of
 * the stage, stronger background alpha (0.72) so the line reads over
 * any watercolor highlight.
 */
.hold-hint-pill {
  position: absolute;
  left: 50%;
  bottom: 56px;
  transform: translateX(-50%);
  z-index: 3;
  font-family: var(--ff-display);
  color: var(--c-cream);
  font-size: 28px;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-align: center;
  max-width: 980px;
  padding: 14px 36px;
  border-radius: 999px;
  background: rgba(26, 15, 10, 0.72);
  backdrop-filter: blur(3px);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35);
  display: inline-flex;
  align-items: center;
  gap: 12px;
}
/*
 * v7.2: round 2+ collapses pill to a remote-icon-only chip. Reduced
 * padding + transparent background so it reads as "subtle reminder"
 * rather than "primary CTA".
 */
.hold-hint-pill.is-compact {
  padding: 10px 14px;
  background: rgba(26, 15, 10, 0.45);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
}
.hold-hint-pill.is-compact .hold-hint-icon {
  width: 56px;
  height: 56px;
  object-fit: contain;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.4));
}
/* Right-anchored hint stack — remote + mic side-by-side inside TV safe-area. */
.hint-icons-right {
  position: absolute;
  right: 80px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 28px;
}
.hint-img {
  width: 140px;
  height: 140px;
  object-fit: contain;
  filter: drop-shadow(0 8px 16px rgba(0, 0, 0, 0.45));
}
/* iter13g-2: 3A remote icon enlarged — it's the star of the screen. */
.hint-img-lg {
  width: 260px;
  height: 260px;
}
.hint-remote-3a {
  right: 60px;
}
/* ─── 3C · responding (split layout) ─── */
.stage-3c {
  flex-direction: row;
  gap: 32px;
  padding: 24px 64px 36px;
  align-items: center;
}
.bear-wrap-3c {
  /*
   * iter13g-16: bear enlarged from 35% → 44% of stage width, max-height
   * 460 → 560 px; translateY(20%) moves the whole wrap down a fifth of
   * its height so the bear's feet step into the lower half of the stage
   * (closer to the floor in bg_home_cozy).
   */
  flex: 0 0 44%;
  width: 44%;
  height: 100%;
  max-height: 560px;
  display: flex;
  align-items: center;
  justify-content: center;
  transform: translateY(20%);
}
.bear-wrap-3c .bear {
  width: 100%;
  height: auto;
  max-height: 100%;
}
/*
 * iter13g-17: bubble column now has a capped width and centers the
 * bubble vertically so it sits visually beside the bear instead of
 * ballooning to the far right edge. A right-padding of 140 px keeps it
 * clear of the bottom-right remote icon.
 */
.bubble-wrap {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  min-width: 0;
  max-width: 640px;
  margin-right: auto;
  padding-right: 140px;
}
.bubble {
  padding: 28px 36px;
  background-color: rgba(255, 245, 230, 0.94);
  background-size: 100% 100%;
  background-repeat: no-repeat;
  background-position: center;
  border-radius: 24px;
  box-shadow: var(--shadow-card);
  min-height: 160px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 10px;
}
/*
 * iter13g-15 plain bubble — no illustrated background image. Clean
 * rounded slab over the home_cozy watercolor; padding slightly tighter
 * than the old bubble bg so the text block doesn't feel cavernous.
 */
/*
 * iter13g-17: taller bubble. Min-height 160 → 260 px so the block reads
 * as a proper speech panel rather than a caption strip. Extra vertical
 * padding balances the height.
 */
.bubble-plain {
  background-image: none !important;
  background-color: rgba(255, 245, 230, 0.92);
  padding: 40px 36px;
  min-height: 260px;
  width: 100%;
  border: 1px solid rgba(245, 158, 11, 0.22);
}

/*
 * iter13j-2 · 3C pill. Floating remote icon merged INTO the pill (see
 * template) so the strip reads as one chip. Pill anchors bottom-center
 * under the painter-bear CTA row.
 */
.hold-hint-pill-3c {
  font-size: 22px;
  padding: 10px 20px;
  bottom: 30px;
  display: inline-flex;
  align-items: center;
  gap: 12px;
}
.hold-hint-icon {
  width: 34px;
  height: 34px;
  object-fit: contain;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.35));
}

/*
 * iter13j-2 · 3C "Ready for painting" CTA below the bubble.
 *   - avatar_bear_painter round sprite on the left
 *   - "可以开画啦 / Ready for painting" label on the right
 *   - full-row button, focusable. Default focus lands here when
 *     entering 3C (see watch(uiState) in script).
 */
.ready-row {
  margin: 24px auto 0;
  display: flex;
  justify-content: center;
}
.ready-btn {
  display: inline-flex;
  align-items: center;
  gap: 18px;
  padding: 14px 28px 14px 18px;
  background: rgba(26, 15, 10, 0.65);
  border: 2px solid rgba(255, 241, 200, 0.4);
  border-radius: 999px;
  color: var(--c-cream);
  font-family: var(--ff-display);
  cursor: pointer;
  transition: transform var(--t-fast) var(--ease-out),
              border-color var(--t-fast) var(--ease-out),
              box-shadow var(--t-fast) var(--ease-out);
}
.ready-avatar {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  object-fit: cover;
  background: rgba(255, 241, 200, 0.7);
  border: 2px solid var(--c-amber);
  filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.4));
}
.ready-label {
  font-size: 24px;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.ready-btn.is-focused,
.ready-btn[data-focused='true'] {
  transform: scale(1.08);
  border-color: var(--c-amber);
  box-shadow:
    inset 0 0 0 3px var(--c-amber),
    0 0 0 5px rgba(255, 245, 230, 0.3),
    0 0 28px 6px var(--c-focus-soft);
}

/*
 * WO-3.18 Phase 3 — pulse / breath animation for the
 * "Start painting your story" confirm button while the dialogue is in
 * WAITING_CONFIRM state. The keyframe is per WO §execution Phase 3 spec:
 *   - 1.8s loop, ease in-out implicit
 *   - subtle scale(1.05) at 50%
 *   - amber radial glow expanding 0 → 20px and fading
 * The animation runs forever; per WO product rules the screen NEVER
 * times out on its own — only an explicit child action can advance it.
 */
@keyframes pulse {
  0%, 100% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(255, 200, 0, 0.7);
  }
  50% {
    transform: scale(1.05);
    box-shadow: 0 0 0 20px rgba(255, 200, 0, 0);
  }
}
.confirm-button.is-waiting-confirm {
  animation: pulse 1.8s infinite;
}
/* Focused + pulsing — focus ring takes precedence so the pulse doesn't
 * fight the amber border highlight. */
.confirm-button.is-waiting-confirm.is-focused,
.confirm-button.is-waiting-confirm[data-focused='true'] {
  animation: pulse 1.8s infinite;
  border-color: var(--c-amber);
}

/* Give the 3C stage room at the bottom for the pill + painter-bear CTA. */
.stage-3c {
  padding-bottom: 120px;
}
.bubble-text {
  font-family: var(--ff-display);
  color: #2b1a0f;
  font-size: 26px;
  font-weight: 600;
  line-height: 1.45;
}
.bubble-text-secondary {
  color: #6b4a35;
  font-size: 20px;
  font-style: italic;
  line-height: 1.4;
}
/*
 * iter13g action bar — fixed strip across the bottom of every dialogue
 * state. Buttons here are remote-focusable; focus shows as amber ring +
 * scale (no text color swap, per founder rule). Disabled state dims to
 * 35% alpha + cursor:not-allowed; focus still moves through them so
 * the kid sees what's available.
 */
.action-bar {
  position: absolute;
  left: 50%;
  bottom: 36px;
  transform: translateX(-50%);
  z-index: 4;
  display: flex;
  gap: 16px;
  justify-content: center;
}
.action-btn {
  font-family: var(--ff-display);
  color: var(--c-cream);
  font-size: 22px;
  font-weight: 700;
  background: rgba(26, 15, 10, 0.55);
  border: 2px solid rgba(255, 200, 87, 0.5);
  border-radius: 999px;
  padding: 12px 32px;
  cursor: pointer;
  transition: transform var(--t-fast) var(--ease-out),
              border-color var(--t-fast) var(--ease-out),
              box-shadow var(--t-fast) var(--ease-out),
              opacity var(--t-fast) var(--ease-out);
}
.action-btn.primary {
  background: rgba(245, 158, 11, 0.32);
  border-color: var(--c-amber);
}
.action-btn.is-disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.action-btn.is-focused,
.action-btn[data-focused='true'] {
  transform: scale(1.08);
  border-color: var(--c-amber);
  box-shadow:
    0 0 0 3px rgba(245, 158, 11, 0.55),
    0 0 22px 6px var(--c-focus-soft);
}
.mic-locked-badge {
  position: absolute;
  bottom: 130px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 4;
  background: rgba(26, 15, 10, 0.72);
  color: var(--c-cream);
  font-family: var(--ff-display);
  font-size: 18px;
  padding: 8px 18px;
  border-radius: 999px;
}

/*
 * WO-3.8 (反馈 1) · prev-reply-bubble — dim context strip showing the bear's
 * previous reply while the child is speaking on 3B. Anchored top-center
 * just under the topbar / turn-summary ribbon, capped at 2 lines via
 * line-clamp so a long bear reply doesn't push the bear off-screen.
 */
.prev-reply-bubble {
  position: absolute;
  top: 20%;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2;
  max-width: 80%;
  padding: 14px 32px;
  border-radius: 24px;
  background: rgba(26, 15, 10, 0.6);
  color: var(--c-cream);
  font-family: var(--ff-display);
  font-size: 32px;
  font-weight: 500;
  line-height: 1.4;
  letter-spacing: 0.02em;
  text-align: center;
  opacity: 0.95;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  pointer-events: none;
}

/* ─── Soft hint (shared) ─── */
.soft-hint {
  position: absolute;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 3;
  color: var(--c-cream);
  font-family: var(--ff-display);
  font-size: 20px;
  font-weight: 600;
  background: rgba(26, 15, 10, 0.55);
  padding: 8px 20px;
  border-radius: 999px;
}
.fade-enter-active, .fade-leave-active {
  transition: opacity var(--t-base) var(--ease-out);
}
.fade-enter-from, .fade-leave-to { opacity: 0; }

.ok-capture {
  position: absolute;
  top: 0; left: 0;
  width: 1px; height: 1px;
  opacity: 0;
  pointer-events: none;
}

/*
 * WO-3.18 Phase 4 — draft-save confirm modal. Sits at z-index 200 so it
 * always covers the floating mic / remote-icon globals (z-index 99/100)
 * and the painter-bear ready CTA. We use a flat dark overlay rather
 * than a watercolor backdrop because the modal is intentionally
 * "interruption" UI — visual continuity with the dialogue ceremony is
 * the wrong message here.
 */
.draft-modal-overlay {
  position: absolute;
  inset: 0;
  z-index: 200;
  background: rgba(20, 12, 6, 0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4px);
}
.draft-modal-card {
  width: min(640px, 80%);
  background: rgba(255, 245, 230, 0.97);
  border: 2px solid var(--c-amber, #d97706);
  border-radius: 28px;
  padding: 36px 40px 32px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.55);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 28px;
}
.draft-modal-title {
  font-family: var(--ff-display);
  color: #2b1a0f;
  font-size: 28px;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-align: center;
  line-height: 1.3;
}
.draft-modal-actions {
  display: flex;
  gap: 18px;
  flex-wrap: wrap;
  justify-content: center;
}
.draft-modal-btn {
  font-family: var(--ff-display);
  color: #2b1a0f;
  font-size: 22px;
  font-weight: 700;
  background: rgba(255, 241, 200, 0.6);
  border: 2px solid rgba(245, 158, 11, 0.55);
  border-radius: 999px;
  padding: 12px 28px;
  cursor: pointer;
  transition: transform var(--t-fast) var(--ease-out),
              border-color var(--t-fast) var(--ease-out),
              box-shadow var(--t-fast) var(--ease-out);
}
.draft-modal-btn-primary {
  background: var(--c-amber, #f59e0b);
  color: #2b1a0f;
  border-color: var(--c-amber, #d97706);
}
.draft-modal-btn:hover,
.draft-modal-btn:focus {
  outline: none;
  transform: scale(1.05);
  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.4);
}

/*
 * WO-3.13: stage-agnostic floating mic button. Fixed at screen-bottom
 * 65% vertically, horizontally centered. Shared by stage 3A (waiting,
 * static) and 3B (listening, alternates icon).
 */
.mic-floating {
  position: fixed;
  left: 50%;
  top: 80%;
  transform: translate(-50%, -50%);
  z-index: 100;
  width: 220px;
  height: 220px;
  border: 0;
  background: transparent;
  padding: 0;
  margin: 0;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
  -webkit-tap-highlight-color: transparent;
}
.mic-floating img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  filter: drop-shadow(0 12px 24px rgba(0, 0, 0, 0.45));
  transition: transform 80ms;
}
.mic-floating.pressed img {
  transform: scale(0.92);
}
.mic-floating:focus { outline: none; }
.mic-floating:focus-visible {
  outline: 2px solid var(--c-amber, #d97706);
  outline-offset: 4px;
  border-radius: 12px;
}

/*
 * WO-3.13: stage-agnostic floating remote icon. Fixed at bottom-right,
 * passive teaching cue for GP15 hardware key users.
 */
.remote-floating {
  position: fixed;
  right: 32px;
  bottom: 32px;
  z-index: 99;
  width: 160px;
  height: auto;
  pointer-events: none;
  filter: drop-shadow(0 6px 12px rgba(0, 0, 0, 0.3));
}
</style>
