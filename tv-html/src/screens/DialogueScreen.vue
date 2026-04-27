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
import { useFocusable, setFocus } from '@/services/focus';
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

/*
 * iter13g-3: scene shortcut cards for 3A. Each card injects a pre-canned
 * first-round reply into the dialogue flow (does NOT skip rounds). In
 * dev/gallery mode we just flash a soft hint since there's no backend.
 */
interface Scene {
  id: 'forest' | 'ocean' | 'space' | 'home';
  image: string;
}
const scenes: Scene[] = [
  { id: 'forest', image: asset('story/story_generic_forest.webp') },
  { id: 'ocean',  image: asset('story/story_generic_ocean.webp') },
  // Space card uses bg_bedtime (night sky) so it reads distinct from the
  // 3A page background (story_generic_sky) — two different skies.
  { id: 'space',  image: asset('bg/bg_bedtime.webp') },
  { id: 'home',   image: asset('bg/bg_home_cozy.webp') },
];
// One ref per scene so useFocusable can register at mount (the composable
// expects a Vue Ref, not a getter function).
const sceneForestRef = ref<HTMLElement | null>(null);
const sceneOceanRef = ref<HTMLElement | null>(null);
const sceneSpaceRef = ref<HTMLElement | null>(null);
const sceneHomeRef = ref<HTMLElement | null>(null);
// iter13j-2: 3C "Ready for painting" CTA
const readyBtnRef = ref<HTMLElement | null>(null);

async function onScenePick(s: Scene): Promise<void> {
  const title = t(`dialogue.scenes.${s.id}.title`);
  const hint = t(`dialogue.scenes.${s.id}.hint`);
  setSoftHint(t('dialogue.sceneSelected', { title }), 1800);

  if (demoPhase || isDevBrowser) return;

  // Real flow: submit the scene's canned reply as the first turn, then
  // the existing server-side flow picks up from round 2 naturally.
  if (!dialogue.dialogueId || inFlight) return;
  inFlight = true;
  dialogue.setPhase('uploading');
  try {
    const { data } = await api.dialogueTurn(dialogue.dialogueId, {
      round: dialogue.round,
      userInput: hint,
      skipRemaining: false,
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
      window.setTimeout(() => { if (mounted) startGenerationAndNavigate(); }, 600);
    } else {
      speakOrAdvance();
    }
  } catch (e) {
    if (e instanceof ApiError) handleTurnError(e);
    else screen.goError(ERR.INTERNAL_ERROR);
  } finally {
    inFlight = false;
  }
}

/*
 * iter13g-15: Dialogue is now 100% voice-driven. All action buttons
 * (Redo / Confirm / Magic) were removed because:
 *   - 3B auto-sends when the kid releases the mic key
 *   - 3C auto-plays AI's reply; to disagree the kid just holds mic again
 * Only the invisible okCapture focusable is kept so the hardware OK key
 * can still trigger the early-end path when `dialogue.canEarlyEnd` is true.
 */

/*
 * Scene card focusables — 2×2 grid: forest / ocean (top row),
 * space / home (bottom row). Auto-focus the forest card so a single OK
 * press on initial entry picks a sensible default. Geometric fallback
 * handles cross-cell edges we don't spell out.
 */
const sceneNeighborMap: Record<Scene['id'], { left?: string; right?: string; up?: string; down?: string }> = {
  forest: { right: 'dialogue-scene-ocean', down: 'dialogue-scene-space' },
  ocean:  { left: 'dialogue-scene-forest', down: 'dialogue-scene-home' },
  space:  { up: 'dialogue-scene-forest', right: 'dialogue-scene-home' },
  home:   { up: 'dialogue-scene-ocean', left: 'dialogue-scene-space' },
};
useFocusable(sceneForestRef, {
  id: 'dialogue-scene-forest',
  autoFocus: true,
  neighbors: sceneNeighborMap.forest,
  onEnter: () => { void onScenePick(scenes[0]); },
});
useFocusable(sceneOceanRef, {
  id: 'dialogue-scene-ocean',
  neighbors: sceneNeighborMap.ocean,
  onEnter: () => { void onScenePick(scenes[1]); },
});
useFocusable(sceneSpaceRef, {
  id: 'dialogue-scene-space',
  neighbors: sceneNeighborMap.space,
  onEnter: () => { void onScenePick(scenes[2]); },
});
useFocusable(sceneHomeRef, {
  id: 'dialogue-scene-home',
  neighbors: sceneNeighborMap.home,
  onEnter: () => { void onScenePick(scenes[3]); },
});

// Legacy OK-capture kept for the early-end shortcut so existing flow works.
useFocusable(okCaptureEl, {
  id: 'dialogue-ok-capture',
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
  // iter13j-2: when entering 3C, park focus on the painter-bear CTA so
  // the kid's OK press triggers "Ready for painting" out of the gate.
  if (cur === '3C') {
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

  // Demo / dev mode — skip server calls entirely; pin to demoPhase
  // (or default to 3A). This is what keeps ?dev=1 URLs from 401→ErrorScreen.
  if (demoPhase || isDevBrowser) {
    const ph = demoPhase ?? '3A';
    if (ph === '3A') {
      // Waiting for kid — single static bear_magic_wand (no wing flap).
      dialogue.setPhase('waiting-for-child');
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
  if (softHintTimer != null) {
    window.clearTimeout(softHintTimer);
    softHintTimer = null;
  }
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
      3A · Waiting for child to press mic (iter13g-3 redesign)
      Three-column layout per founder: [bear | scene cards | remote].
        - Bear: bear_magic_wand, enlarged, bottom-aligned so it "stands on
          the cushion" in the bg_chat watercolor.
        - Scenes: 2×2 grid of 4 shortcut cards (forest/ocean/space/home).
          These are remote-focusable; OK on a card primes the child's
          first reply and advances into the 7-round dialogue flow — it
          does NOT skip straight to generation, so personalization value
          is preserved.
        - Remote: enlarged, same vertical center as bear, right-hand side.
        - Hint pill at the bottom repeats the voice-first CTA so the kid
          knows the mic is still the primary path.
    -->
    <main v-if="uiState === '3A'" class="stage stage-3a">
      <div class="col-3a col-bear-3a">
        <img
          class="bear bear-3a"
          :src="asset('bear/bear_magic_wand.webp')"
          alt=""
        >
      </div>

      <div class="col-3a col-scenes-3a">
        <div class="scenes-grid">
          <button
            ref="sceneForestRef"
            type="button"
            class="scene-card"
            :style="{ backgroundImage: `url(${scenes[0].image})` }"
            @click="onScenePick(scenes[0])"
          >
            <div class="scene-title wb-text-shadow">{{ t('dialogue.scenes.forest.title') }}</div>
          </button>
          <button
            ref="sceneOceanRef"
            type="button"
            class="scene-card"
            :style="{ backgroundImage: `url(${scenes[1].image})` }"
            @click="onScenePick(scenes[1])"
          >
            <div class="scene-title wb-text-shadow">{{ t('dialogue.scenes.ocean.title') }}</div>
          </button>
          <button
            ref="sceneSpaceRef"
            type="button"
            class="scene-card"
            :style="{ backgroundImage: `url(${scenes[2].image})` }"
            @click="onScenePick(scenes[2])"
          >
            <div class="scene-title wb-text-shadow">{{ t('dialogue.scenes.space.title') }}</div>
          </button>
          <button
            ref="sceneHomeRef"
            type="button"
            class="scene-card"
            :style="{ backgroundImage: `url(${scenes[3].image})` }"
            @click="onScenePick(scenes[3])"
          >
            <div class="scene-title wb-text-shadow">{{ t('dialogue.scenes.home.title') }}</div>
          </button>
        </div>
      </div>

      <div class="col-3a col-remote-3a">
        <img class="remote-3a" :src="asset('ui/ui_remote.webp')" alt="" />
      </div>

      <!--
        iter13g-4: merged single-sentence hint pill. Was two lines
        ("Or pick a theme" caption above grid + "Hold the mic" pill at
        bottom). Caption was getting eaten by the watercolor highlights.
        Now it's one sentence on a stronger pill under the scene grid.
      -->
      <div class="hold-hint-pill wb-text-shadow">
        {{ t('dialogue.holdMicWithScenes') }}
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
      <!--
        iter13g-12: mic pulled out of the right-side hint stack and
        promoted to a center-stage, enlarged icon — the mic is the focal
        "kid is talking right now" cue in 3B.
      -->
      <img
        class="mic-center-3b mic-blink"
        :src="asset(micActive ? 'ui/ui_mic_active.webp' : 'ui/ui_mic.webp')"
        alt=""
        aria-hidden="true"
      />
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
      -->
      <div class="ready-row">
        <button
          ref="readyBtnRef"
          type="button"
          class="ready-btn wb-focus-feedback"
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

    <div ref="okCaptureEl" class="ok-capture" tabindex="-1" aria-hidden="true" />
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
 * iter13g-12 · 3B center-stage mic.
 *   Pulled out of the right-side hint stack into a centered overlay,
 *   scaled ~1.8× (140 → 260 px) so the kid sees a big breathing mic
 *   icon while holding the voice key. Breathing animation still reuses
 *   @mic-breath (scale 1 → 1.12).
 */
/*
 * Center via calc() instead of translate(-50%,-50%) because the
 * @mic-breath animation applies its own `transform: scale(...)` which
 * would override a translate-based centering. With calc() offsets, the
 * scale can run cleanly.
 */
.mic-center-3b {
  position: absolute;
  left: calc(50% - 130px);
  top: calc(50% - 130px);
  z-index: 2;
  width: 260px;
  height: 260px;
  object-fit: contain;
  filter: drop-shadow(0 12px 24px rgba(0, 0, 0, 0.45));
  transform-origin: center;
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
.col-scenes-3a {
  flex: 1 1 auto;
  justify-content: center;
  gap: 12px;
  max-width: 720px;
  transform: translateY(-30px);
}
.scenes-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-auto-rows: 170px;
  gap: 14px;
  width: 100%;
}
.scene-card {
  position: relative;
  border-radius: 18px;
  border: 2px solid rgba(255, 200, 87, 0.35);
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  cursor: pointer;
  overflow: hidden;
  opacity: 0.78;
  transition: transform var(--t-fast) var(--ease-out),
              border-color var(--t-fast) var(--ease-out),
              box-shadow var(--t-fast) var(--ease-out),
              opacity var(--t-fast) var(--ease-out);
}
.scene-card::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(0,0,0,0) 45%, rgba(0,0,0,0.55) 100%);
}
.scene-title {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 10px;
  z-index: 1;
  color: var(--c-cream);
  font-family: var(--ff-display);
  font-size: 20px;
  font-weight: 700;
  text-align: center;
  letter-spacing: 0.02em;
}
.scene-card.is-focused,
.scene-card[data-focused='true'] {
  transform: scale(1.05);
  opacity: 1;
  border-color: var(--c-amber);
  box-shadow:
    0 0 0 3px rgba(245, 158, 11, 0.6),
    0 0 24px 6px var(--c-focus-soft);
}
.col-remote-3a {
  flex: 0 0 200px;
  height: 100%;
  justify-content: center;
}
.remote-3a {
  width: 100%;
  max-width: 200px;
  max-height: 480px;
  object-fit: contain;
  filter: drop-shadow(0 12px 22px rgba(0, 0, 0, 0.45));
}
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
.mic-blink {
  animation: mic-breath 0.8s ease-in-out infinite alternate;
}
@keyframes mic-breath {
  0%   { transform: scale(1); }
  100% { transform: scale(1.12); }
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
</style>
