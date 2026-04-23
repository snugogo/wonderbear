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
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useDialogueStore } from '@/stores/dialogue';
import { useStoryStore } from '@/stores/story';
import { useChildStore } from '@/stores/child';
import { useScreenStore } from '@/stores/screen';
import { useBgmStore } from '@/stores/bgm';
import { useI18n } from 'vue-i18n';
import { bridge } from '@/services/bridge';
import { useFocusable } from '@/services/focus';
import { api, ApiError } from '@/services/api';
import type { Locale } from '@/utils/errorCodes';
import { ERR } from '@/utils/errorCodes';
import { asset } from '@/utils/assets';

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

let unsubVoiceDown: (() => void) | null = null;
let unsubVoiceUp: (() => void) | null = null;
let unsubTtsEnd: (() => void) | null = null;

let inFlight = false;
let mounted = true;

// ----- Bear sprite mapping -----
const bearImage = computed<string>(() => {
  switch (dialogue.phase) {
    case 'bear-speaking': return asset('bear/bear_talk.webp');
    case 'waiting-for-child': return asset('bear/bear_listen_headphones.webp');
    case 'recording': return asset('bear/bear_listen_headphones.webp');
    case 'uploading':
    case 'bear-thinking': return asset('bear/bear_think.webp');
    case 'finished': return asset('bear/bear_cheer.webp');
    case 'idle':
    default: return asset('bear/bear_idle.webp');
  }
});

const phaseLabel = computed<string>(() => {
  switch (dialogue.phase) {
    case 'bear-speaking': return t('dialogue.speaking');
    case 'waiting-for-child': return t('dialogue.pressVoiceKey');
    case 'recording': return t('dialogue.listening');
    case 'uploading':
    case 'bear-thinking': return t('dialogue.thinking');
    default: return '';
  }
});

const showEarlyEndHint = computed<boolean>(() =>
  dialogue.canEarlyEnd
  && (dialogue.phase === 'waiting-for-child' || dialogue.phase === 'bear-speaking'),
);

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
  } else {
    // No TTS provided — assume bear "spoke" instantly, jump to waiting.
    dialogue.setPhase('waiting-for-child');
  }
}

async function startGenerationAndNavigate(): Promise<void> {
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

function onVoiceKeyDown(): void {
  if (!mounted) return;
  if (dialogue.phase !== 'waiting-for-child') return;
  if (inFlight) return;

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
  if (!dialogue.canEarlyEnd) return;
  if (dialogue.phase !== 'waiting-for-child' && dialogue.phase !== 'bear-speaking') return;
  if (inFlight) return;

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
    });

    dialogue.applyTurn({
      done: data.done,
      nextQuestion: data.nextQuestion,
      summary: data.summary,
      safetyLevel: data.safetyLevel,
      safetyReplacement: data.safetyReplacement,
    });

    if (data.done) {
      // Kick off generation immediately; if the bear has a final TTS line
      // (server might include one in the last turn), play it in parallel.
      window.setTimeout(() => {
        if (mounted) startGenerationAndNavigate();
      }, 600);
    } else {
      speakOrAdvance();
    }
  } catch (e) {
    if (!(e instanceof ApiError)) {
      screen.goError(ERR.INTERNAL_ERROR);
      return;
    }
    handleTurnError(e);
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

// ----- Lifecycle -----
useFocusable(okCaptureEl, {
  id: 'dialogue-ok-capture',
  autoFocus: true,
  onEnter: () => { onOkKey(); },
});

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

  startDialogue();
});

onBeforeUnmount(() => {
  mounted = false;
  if (softHintTimer != null) {
    window.clearTimeout(softHintTimer);
    softHintTimer = null;
  }
  bridge.stopTts();
  clearAllListeners();
  // Don't reset the store here — GeneratingScreen / ErrorScreen may want to read dialogueId.
});
</script>

<template>
  <div class="dialogue-screen">
    <img class="bg" :src="asset('bg/bg_chat.webp')" alt="" aria-hidden="true">

    <header class="topbar">
      <div class="progress-dots" :aria-label="t('dialogue.progress', {
        current: dialogue.round,
        total: dialogue.roundCount,
      })">
        <span
          v-for="(d, i) in progressDots"
          :key="i"
          class="dot"
          :class="{ filled: d.filled, current: d.current }"
        />
      </div>
      <div class="t-sm progress-label">
        {{ t('dialogue.progress', {
          current: dialogue.round,
          total: dialogue.roundCount,
        }) }}
      </div>
    </header>

    <main class="stage">
      <div class="bear-wrap">
        <img
          class="bear"
          :class="{ 'bear-pulse': dialogue.phase === 'recording' }"
          :src="bearImage"
          :alt="phaseLabel"
        >
      </div>

      <div
        v-if="dialogue.currentQuestion"
        class="bubble"
        :style="{ backgroundImage: `url(${asset('ui/ui_char_bubble.webp')})` }"
      >
        <div class="bubble-text t-lg">{{ dialogue.currentQuestion.text }}</div>
        <div
          v-if="dialogue.currentQuestion.textLearning"
          class="bubble-text-secondary t-md"
        >
          {{ dialogue.currentQuestion.textLearning }}
        </div>
      </div>
    </main>

    <footer class="bottombar">
      <Transition name="fade">
        <div v-if="softHint" class="soft-hint t-md" role="status">
          {{ softHint }}
        </div>
      </Transition>

      <div class="phase-indicator">
        <img
          v-if="dialogue.phase === 'recording' || dialogue.phase === 'waiting-for-child'"
          class="mic-icon"
          :class="{ 'mic-active': dialogue.phase === 'recording' }"
          :src="asset('ui/ui_mic.webp')"
          alt=""
          aria-hidden="true"
        >
        <span class="t-md phase-text">{{ phaseLabel }}</span>
      </div>

      <Transition name="fade">
        <div v-if="showEarlyEndHint" class="early-end t-sm">
          <img
            class="ok-glyph"
            :src="asset('ui/ui_finger_point.webp')"
            alt=""
            aria-hidden="true"
          >
          <span>{{ t('dialogue.earlyEndHint') }}</span>
        </div>
      </Transition>
    </footer>

    <div ref="okCaptureEl" class="ok-capture" tabindex="-1" aria-hidden="true" />
  </div>
</template>

<style scoped>
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

.topbar {
  position: relative;
  z-index: 1;
  flex: 0 0 auto;
  padding: var(--sp-3) var(--sp-5) 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-1);
}

.progress-dots {
  display: flex;
  gap: var(--sp-2);
}
.dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: rgba(255, 245, 230, 0.18);
  border: 1.5px solid rgba(255, 245, 230, 0.25);
  transition: all var(--t-base) var(--ease-out);
}
.dot.filled {
  background: var(--c-amber-soft);
  border-color: var(--c-amber);
}
.dot.current {
  background: var(--c-amber);
  border-color: var(--c-amber);
  transform: scale(1.4);
  box-shadow: 0 0 12px var(--c-amber-soft);
}
.progress-label {
  color: var(--c-cream-soft);
  letter-spacing: 0.08em;
}

.stage {
  position: relative;
  z-index: 1;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--sp-4);
  padding: 0 var(--sp-7);
}

.bear-wrap {
  /* TV_TASKS v1.1 P0-3: 240 -> 380 so the dialogue partner fills the stage. */
  width: 380px;
  height: 380px;
  display: flex;
  align-items: center;
  justify-content: center;
  filter: drop-shadow(0 12px 24px rgba(0, 0, 0, 0.45));
}
.bear {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  transition: transform var(--t-base) var(--ease-out);
}
.bear-pulse {
  animation: bear-pulse 1.1s var(--ease-out) infinite;
}
@keyframes bear-pulse {
  0%, 100% { transform: scale(1); }
  50%      { transform: scale(1.05); }
}

.bubble {
  max-width: 880px;
  min-height: 120px;
  padding: var(--sp-4) var(--sp-5);
  background-color: rgba(255, 245, 230, 0.92);
  background-size: 100% 100%;
  background-repeat: no-repeat;
  background-position: center;
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-card);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--sp-2);
}
.bubble-text {
  color: #2b1a0f;
  text-align: center;
  font-weight: 600;
  line-height: 1.4;
}
.bubble-text-secondary {
  color: #6b4a35;
  text-align: center;
  font-style: italic;
  line-height: 1.4;
}

.bottombar {
  position: relative;
  z-index: 1;
  flex: 0 0 auto;
  height: 140px;
  padding: 0 var(--sp-6) var(--sp-4);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: var(--sp-2);
}

.soft-hint {
  color: var(--c-coral);
  background: rgba(255, 126, 95, 0.12);
  border: 1px solid rgba(255, 126, 95, 0.35);
  padding: var(--sp-2) var(--sp-4);
  border-radius: var(--r-md);
  font-weight: 600;
}

.phase-indicator {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  color: var(--c-cream);
}
.mic-icon {
  width: 40px;
  height: 40px;
  object-fit: contain;
  opacity: 0.75;
  transition: opacity var(--t-fast) var(--ease-out);
}
.mic-active {
  opacity: 1;
  animation: mic-pulse 0.8s var(--ease-out) infinite;
}
@keyframes mic-pulse {
  0%, 100% { transform: scale(1); }
  50%      { transform: scale(1.18); }
}
.phase-text {
  color: var(--c-cream);
  font-weight: 600;
}

.early-end {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  color: var(--c-amber);
  margin-top: var(--sp-1);
}
.ok-glyph {
  width: 28px;
  height: 28px;
  object-fit: contain;
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
</style>
