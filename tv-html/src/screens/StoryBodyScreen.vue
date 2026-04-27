<!--
  StoryBodyScreen — page-by-page story playback (PRD §4.4).

  iter13j additions:
    - Subtitle strip redesigned as a centered translucent pill with
      text-length-adaptive font size (≤4 lines). No more bottom-full
      gradient darkening the image.
    - When the last page's TTS finishes we FREEZE the frame (instead of
      auto-navigating to story-end) and overlay two focusable CTAs:
      [进入识字] / [编个续集] (Learn / Sequel). Back or picking one
      leaves the screen; OK on the focused button triggers its action.

  Server contract: API_CONTRACT.md §7.6 / §7.10
    - Story.pages[].pageNum is 1-based, .text is primary, .textLearning is optional secondary
    - .ttsUrl can be null (client falls back: just shows text, auto-advance after a fixed beat)
    - storyPlayStat events: 'start' | 'page_end' | 'complete' | 'abort'

  Memory management (PRD §4.3, kickoff §一硬规则 1):
    Only the CURRENT page image is kept mounted in DOM (v-if + :key="pageIndex").
-->

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import { useStoryStore } from '@/stores/story';
import { useScreenStore } from '@/stores/screen';
import { useBgmStore } from '@/stores/bgm';
import { useI18n } from 'vue-i18n';
import { bridge } from '@/services/bridge';
import { useFocusable, setFocus } from '@/services/focus';
import { api } from '@/services/api';
import { ERR } from '@/utils/errorCodes';
import { asset } from '@/utils/assets';
// 2026-04-27: FlashcardOverlay decommissioned — the bear button on the
// player goes straight to LearningScreen now (founder's original
// design). Keeping the import map clean.

const storyStore = useStoryStore();
const screen = useScreenStore();
const bgm = useBgmStore();
const { t } = useI18n();

const prevBtnRef = ref<HTMLElement | null>(null);
const playBtnRef = ref<HTMLElement | null>(null);
const nextBtnRef = ref<HTMLElement | null>(null);
const learnCtrlBtnRef = ref<HTMLElement | null>(null);
const langToggleBtnRef = ref<HTMLElement | null>(null);
const learnBtnRef = ref<HTMLElement | null>(null);
const sequelBtnRef = ref<HTMLElement | null>(null);

/*
 * TV v1.0 §4.3: language toggle on the playback strip.
 *   langSide = 'native'   → text shown big, textLearning shown small
 *   langSide = 'learning' → textLearning shown big, text shown small
 * Mock mode (current): only the visual layout swaps; audio URL switching
 * waits for the server to deliver per-language TTS URLs.
 */
type LangSide = 'native' | 'learning';
const langSide = ref<LangSide>('native');
const langToggleAvailable = computed(() =>
  Boolean(currentPage.value?.text) && Boolean(currentPage.value?.textLearning),
);
const langToggleLabel = computed(() => {
  // Show the OTHER language's name (so the kid knows what tapping does).
  return langSide.value === 'native' ? t('flashcard.learningLabel') : t('flashcard.nativeLabel');
});
const subtitlePrimaryText = computed<string>(() => {
  const p = currentPage.value;
  if (!p) return '';
  if (langSide.value === 'learning' && p.textLearning) return p.textLearning;
  return p.text ?? '';
});
const subtitleSecondaryText = computed<string>(() => {
  const p = currentPage.value;
  if (!p) return '';
  if (langSide.value === 'learning') return p.text ?? '';
  return p.textLearning ?? '';
});

function onLangToggle(): void {
  if (!langToggleAvailable.value) return;
  langSide.value = langSide.value === 'native' ? 'learning' : 'native';
  bridge.log('story-body', { event: 'lang_toggled', side: langSide.value });
}

let mounted = true;
let unsubTtsEnd: (() => void) | null = null;
let advanceGuard = false;
let pageStartedAt = 0;
let completed = false;

/** iter13j: once the last page finishes playing we pin this to true and
 *  stop advancing. The frame stays, overlay CTAs appear. */
const ended = ref(false);
/**
 * iter13j-2: slideshow play state. Default true → pages auto-advance
 * via TTS end / fallback timer. When the user pauses, we stop the
 * auto-advance; Prev / Next arrow buttons let them page manually.
 */
const playing = ref(true);

const story = computed(() => storyStore.active);
const currentPage = computed(() => storyStore.currentPage);
const pageIndex = computed(() => storyStore.pageIndex);
const totalPages = computed(() => storyStore.active?.pages.length ?? 0);

/*
 * iter13j: adaptive subtitle font size. Long paragraphs shrink so we
 * never exceed 4 visible lines inside the pill. Thresholds chosen for
 * 1280-wide preview with ~1100 px max pill width.
 */
const primaryFontSize = computed(() => {
  const len = subtitlePrimaryText.value.length;
  if (len <= 30)  return '38px';
  if (len <= 60)  return '32px';
  if (len <= 100) return '26px';
  return '22px';
});
const secondaryFontSize = computed(() => {
  const len = subtitleSecondaryText.value.length;
  if (len <= 40)  return '24px';
  if (len <= 80)  return '20px';
  return '18px';
});

function nowIso(): string { return new Date().toISOString(); }

function fireStat(payload: {
  event: 'start' | 'page_end' | 'complete' | 'abort';
  pageNum?: number;
  durationMs?: number;
}): void {
  if (!story.value) return;
  api.storyPlayStat(story.value.id, {
    ...payload,
    timestamp: nowIso(),
  }).catch((err) => {
    bridge.log('story-body', { event: 'play_stat_failed', err: String(err) });
  });
}

let fallbackTimer: number | null = null;
function clearFallback(): void {
  if (fallbackTimer !== null) {
    window.clearTimeout(fallbackTimer);
    fallbackTimer = null;
  }
}

function playCurrentPage(): void {
  const page = currentPage.value;
  if (!page) return;
  pageStartedAt = Date.now();
  advanceGuard = false;
  clearFallback();

  // iter13j-2: when paused, DON'T start TTS or the fallback auto-advance.
  // Manual Next / Prev still work via their button handlers.
  if (!playing.value) return;

  if (page.ttsUrl) {
    bridge.playTts(page.ttsUrl);
  } else {
    const fallbackMs = Math.min(12000, 3500 + page.text.length * 60);
    fallbackTimer = window.setTimeout(() => {
      fallbackTimer = null;
      if (mounted && playing.value) advance();
    }, fallbackMs);
  }
}

function advance(): void {
  if (!mounted) return;
  if (advanceGuard) return;
  if (ended.value) return;
  advanceGuard = true;

  bridge.stopTts();
  clearFallback();
  const durationMs = Date.now() - pageStartedAt;
  const finishedPage = currentPage.value;
  if (finishedPage) {
    fireStat({ event: 'page_end', pageNum: finishedPage.pageNum, durationMs });
  }

  if (storyStore.isLastPage) {
    // iter13j: freeze instead of auto-navigating off. Show CTA overlay.
    completed = true;
    fireStat({ event: 'complete' });
    ended.value = true;
    return;
  }

  const moved = storyStore.nextPage();
  if (moved) {
    // Wait for the 400ms cross-fade transition (mode='out-in') to complete the
    // out animation and unmount the old page node before loading the new image.
    window.setTimeout(() => {
      if (mounted) playCurrentPage();
    }, 420);
  }
}

/*
 * iter13j-2 manual controls.
 *   goPrev / goNext: abort current TTS + fallback timer, step pageIndex,
 *     then kick off playCurrentPage() on the new page.
 *   togglePlay: flip `playing`. When flipped OFF we stop TTS and cancel
 *     the fallback timer. When flipped ON we resume from the current
 *     page (TTS replays).
 */
function stepTo(delta: number): void {
  if (!mounted || ended.value) return;
  const total = totalPages.value;
  const next = Math.max(0, Math.min(total - 1, pageIndex.value + delta));
  if (next === pageIndex.value) return;
  bridge.stopTts();
  clearFallback();
  advanceGuard = false;
  storyStore.pageIndex = next;
  // Match the cross-fade so the new page image has time to mount.
  window.setTimeout(() => {
    if (mounted) playCurrentPage();
  }, 420);
}
function goPrev(): void { stepTo(-1); }
function goNext(): void { stepTo(+1); }
function togglePlay(): void {
  playing.value = !playing.value;
  if (playing.value) {
    // Resume: replay the current page from the top.
    playCurrentPage();
  } else {
    bridge.stopTts();
    clearFallback();
  }
}

/*
 * TV v1.0 §4.3 playback strip layout:
 *   [Lang] [Prev] [Play/Pause] [Next] [Flashcard]
 *
 * Focus defaults to the middle Play/Pause; Left lands on Prev → Lang;
 * Right lands on Next → Flashcard. The Lang chip uses ui_home_profile
 * (matching LearningScreen iter13l-7 disc), Flashcard uses bear_read.
 */
useFocusable(langToggleBtnRef, {
  id: 'body-ctrl-lang',
  neighbors: { right: 'body-ctrl-prev' },
  onEnter: onLangToggle,
  onBack: () => { screen.go('create'); },
});
useFocusable(prevBtnRef, {
  id: 'body-ctrl-prev',
  neighbors: { left: 'body-ctrl-lang', right: 'body-ctrl-play' },
  onEnter: goPrev,
  onBack: () => { screen.go('create'); },
});
useFocusable(playBtnRef, {
  id: 'body-ctrl-play',
  autoFocus: true,
  neighbors: { left: 'body-ctrl-prev', right: 'body-ctrl-next' },
  onEnter: togglePlay,
  onBack: () => { screen.go('create'); },
});
useFocusable(nextBtnRef, {
  id: 'body-ctrl-next',
  neighbors: { left: 'body-ctrl-play', right: 'body-ctrl-learn' },
  onEnter: goNext,
  onBack: () => { screen.go('create'); },
});
useFocusable(learnCtrlBtnRef, {
  // 2026-04-27: this control was previously wired to openFlashcard
  // (in-place modal). Per founder, the design has always been: the
  // bear button on the player goes straight to LearningScreen (the
  // full reading-with-bear-cursor experience). Restoring that link.
  id: 'body-ctrl-learn',
  neighbors: { left: 'body-ctrl-next' },
  onEnter: () => { screen.go('learning'); },
  onBack: () => { screen.go('create'); },
});

useFocusable(learnBtnRef, {
  id: 'body-end-learn',
  neighbors: { right: 'body-end-sequel' },
  onEnter: () => { screen.go('learning'); },
  onBack: () => { screen.go('create'); },
});
useFocusable(sequelBtnRef, {
  id: 'body-end-sequel',
  neighbors: { left: 'body-end-learn' },
  onEnter: () => {
    // Kick off a new dialogue flow. StoryStore keeps `active` so the
    // next conversation can reference the parent story on request.
    screen.go('dialogue');
  },
  onBack: () => { screen.go('create'); },
});

/*
 * iter13j: shift focus to the Learn chip when the overlay shows.
 * nextTick so any pending reactive updates settle before setFocus.
 */
watch(ended, async (now) => {
  if (!now) return;
  await nextTick();
  setFocus('body-end-learn');
});

// 2026-04-27 dev shortcut: pressing "E" anywhere on this screen jumps
// to the end-of-story overlay so the Learn / Sequel buttons can be
// reached without sitting through 12 pages of mock TTS.
const isDevBrowser = import.meta.env.DEV
  || (typeof window !== 'undefined'
      && new URLSearchParams(window.location.search).has('dev'));
let unsubDevEndShortcut: (() => void) | null = null;

onMounted(() => {
  if (!storyStore.active) {
    bridge.log('story-body', { event: 'mounted_without_active_story' });
    screen.goError(ERR.STORY_NOT_FOUND);
    return;
  }

  bgm.play('story_body');
  fireStat({ event: 'start' });

  unsubTtsEnd = bridge.on('tts-end', () => {
    if (!mounted) return;
    advance();
  });

  if (isDevBrowser) {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        const total = storyStore.active?.pages.length ?? 0;
        if (total > 0) storyStore.pageIndex = total - 1;
        completed = true;
        ended.value = true;
      }
    };
    window.addEventListener('keydown', handler);
    unsubDevEndShortcut = () => window.removeEventListener('keydown', handler);
  }

  playCurrentPage();
});

onBeforeUnmount(() => {
  mounted = false;
  bridge.stopTts();
  clearFallback();
  unsubTtsEnd?.();
  unsubDevEndShortcut?.();
  if (!completed) {
    fireStat({ event: 'abort' });
  }
});
</script>

<template>
  <div class="body-screen">
    <Transition name="page" mode="out-in">
      <div
        v-if="currentPage"
        :key="pageIndex"
        class="page"
      >
        <img
          class="page-image"
          :src="currentPage.imageUrl"
          :alt="currentPage.text"
        >

        <!--
          iter13j: subtitle PILL (no longer a full-width gradient strip).
          Width auto-fits content up to max-width 1100; stays centered
          at the bottom above the safe-area. Font size binds to
          primaryFontSize / secondaryFontSize computeds.
        -->
        <div class="subtitle-pill">
          <!-- TV v1.0 §4.3: primary/secondary lines swap when the user
               toggles the language chip on the playback strip. -->
          <p
            class="subtitle-primary"
            :style="{ fontSize: primaryFontSize }"
          >{{ subtitlePrimaryText }}</p>
          <p
            v-if="subtitleSecondaryText"
            class="subtitle-secondary"
            :style="{ fontSize: secondaryFontSize }"
          >
            {{ subtitleSecondaryText }}
          </p>
        </div>

        <div class="page-counter t-sm">
          {{ t('story.pageOf', { current: pageIndex + 1, total: totalPages }) }}
        </div>
      </div>
    </Transition>

    <!--
      iter13k-2 playback controls strip. Four circular chips — Prev /
      Play-Pause / Next / Learn — pinned ABOVE the subtitle pill (the
      pill anchors at bottom: 56). The control row sits at bottom: 200
      so it never overlaps the caption. Hidden once `ended` becomes true.
    -->
    <div v-show="!ended" class="ctrl-row">
      <!--
        TV v1.0 §4.3: language toggle (leftmost). Disc uses
        ui_home_profile.webp (same disc style as LearningScreen iter13l-7).
        Hidden when the page lacks a textLearning translation.
      -->
      <button
        v-if="langToggleAvailable"
        ref="langToggleBtnRef"
        type="button"
        class="ctrl-btn ctrl-btn--lang wb-focus-feedback"
        :aria-label="t('learning.switchLang')"
      >
        <img :src="asset('ui/ui_home_profile.webp')" alt="" />
        <span class="ctrl-btn-label">{{ langToggleLabel }}</span>
      </button>
      <button
        ref="prevBtnRef"
        type="button"
        class="ctrl-btn wb-focus-feedback"
        :aria-label="t('story.ctrlPrev')"
        :disabled="pageIndex === 0"
      >
        <img :src="asset('ui/ui_player_prev.webp')" alt="" />
      </button>
      <button
        ref="playBtnRef"
        type="button"
        class="ctrl-btn ctrl-btn--play wb-focus-feedback"
        :aria-label="playing ? t('story.ctrlPause') : t('story.ctrlPlay')"
      >
        <img
          :src="asset(playing ? 'ui/ui_player_pause.webp' : 'ui/ui_player_play.webp')"
          alt=""
        />
      </button>
      <button
        ref="nextBtnRef"
        type="button"
        class="ctrl-btn wb-focus-feedback"
        :aria-label="t('story.ctrlNext')"
        :disabled="pageIndex >= totalPages - 1"
      >
        <img :src="asset('ui/ui_player_next.webp')" alt="" />
      </button>
      <!--
        TV v1.0 §3.3 / §4.3: rightmost chip is the FLASHCARD trigger
        (was a direct Learning-screen jump in iter13k-2). Reuses
        bear_read.webp art per PRD §4.3 ("资产复用"). Pressing it
        pauses playback and slides up the FlashcardOverlay.
      -->
      <button
        ref="learnCtrlBtnRef"
        type="button"
        class="ctrl-btn ctrl-btn--learn wb-focus-feedback"
        :aria-label="'Flashcard'"
      >
        <img :src="asset('bear/bear_read.webp')" alt="" />
      </button>
    </div>

    <!--
      iter13j: end-of-story overlay. Two focusable CTAs float above the
      frozen last frame. Default focus lands on "Learn" (leftmost).
      We use v-show (not v-if) so the <button>s mount at first render —
      useFocusable registers on onMounted and cannot re-fire for a
      v-if-gated element. See watch(ended) below for the setFocus bump.
    -->
    <div v-show="ended" class="end-overlay">
      <button
        ref="learnBtnRef"
        type="button"
        class="end-btn wb-focus-feedback"
      >
        <span class="end-btn-glyph" aria-hidden="true">A</span>
        <span class="end-btn-label">{{ t('story.endLearn') }}</span>
      </button>
      <button
        ref="sequelBtnRef"
        type="button"
        class="end-btn wb-focus-feedback"
      >
        <span class="end-btn-glyph" aria-hidden="true">+</span>
        <span class="end-btn-label">{{ t('story.endSequel') }}</span>
      </button>
    </div>

  </div>
</template>

<style scoped>
.body-screen {
  width: 100%;
  height: 100%;
  position: relative;
  background: var(--c-bg-deep);
  overflow: hidden;
}

.page {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.page-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  user-select: none;
}

/*
 * iter13j: subtitle pill. Max width 1100, auto-centered, translucent
 * obsidian background with blur. Clamps the secondary text to a
 * maximum of 4 lines via -webkit-line-clamp so giant learning
 * paragraphs can't push the pill off-screen.
 */
.subtitle-pill {
  position: absolute;
  left: 50%;
  bottom: 56px;
  transform: translateX(-50%);
  max-width: 1100px;
  width: calc(100% - 128px);
  padding: 18px 32px;
  background: rgba(18, 14, 10, 0.62);
  border-radius: 28px;
  backdrop-filter: blur(4px);
  text-align: center;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35);
}
.subtitle-primary {
  color: var(--c-cream);
  font-weight: 700;
  margin: 0;
  line-height: 1.35;
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.65);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.subtitle-secondary {
  color: var(--c-cream);
  opacity: 0.85;
  font-style: italic;
  margin: 8px 0 0;
  line-height: 1.35;
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.65);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.page-counter {
  position: absolute;
  top: var(--sp-3);
  right: var(--sp-5);
  color: var(--c-cream);
  background: rgba(0, 0, 0, 0.45);
  padding: var(--sp-1) var(--sp-3);
  border-radius: 999px;
  letter-spacing: 0.08em;
}

.page-enter-active, .page-leave-active {
  transition: opacity var(--t-slow) var(--ease-out);
}
.page-enter-from, .page-leave-to {
  opacity: 0;
}

/*
 * iter13j: end-of-story overlay. Two big focusable chips on a
 * translucent dimming scrim so the kid can pick [识字] or [续集].
 */
.end-overlay {
  position: absolute;
  inset: 0;
  background: radial-gradient(
    ellipse at center,
    rgba(0, 0, 0, 0.45) 0%,
    rgba(0, 0, 0, 0.72) 100%
  );
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 48px;
  z-index: 5;
  animation: end-fade-in 260ms var(--ease-out);
}
@keyframes end-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.end-btn {
  width: 280px;
  height: 180px;
  border-radius: 28px;
  border: 3px solid rgba(255, 241, 200, 0.35);
  background: rgba(26, 15, 10, 0.75);
  color: var(--c-cream);
  font-family: var(--ff-display);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  transition: transform var(--t-fast) var(--ease-out),
              border-color var(--t-fast) var(--ease-out),
              box-shadow var(--t-fast) var(--ease-out);
}
.end-btn-glyph {
  font-size: 48px;
  color: var(--c-amber);
  font-weight: 800;
  line-height: 1;
}
.end-btn-label {
  font-size: 26px;
  font-weight: 700;
  letter-spacing: 0.03em;
}
.end-btn.is-focused,
.end-btn[data-focused='true'] {
  transform: scale(1.08);
  border-color: var(--c-amber);
  box-shadow:
    inset 0 0 0 3px var(--c-amber),
    0 0 0 6px rgba(255, 245, 230, 0.3),
    0 0 32px 8px var(--c-focus-soft);
}

/*
 * iter13k-2 playback controls. Four chips: Prev / Play-Pause / Next /
 * Learn. Centered horizontally and pinned ABOVE the subtitle pill so
 * the two strips don't fight for the same screen real estate.
 *   subtitle pill  → bottom: 56  (always)
 *   control row    → bottom: 200 (sits ABOVE the pill)
 * Play-Pause is the amber-tinted middle chip (primary action). The
 * Learn chip uses bear_read avatar to set it apart from transport keys.
 */
.ctrl-row {
  position: absolute;
  left: 50%;
  bottom: 200px;
  transform: translateX(-50%);
  z-index: 4;
  display: flex;
  align-items: center;
  gap: 18px;
}
.ctrl-btn {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  border: 2px solid rgba(255, 241, 200, 0.4);
  background: rgba(26, 15, 10, 0.62);
  backdrop-filter: blur(3px);
  padding: 0;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: transform var(--t-fast) var(--ease-out),
              border-color var(--t-fast) var(--ease-out),
              box-shadow var(--t-fast) var(--ease-out);
}
.ctrl-btn img {
  width: 44px;
  height: 44px;
  object-fit: contain;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.4));
}
.ctrl-btn[disabled] {
  opacity: 0.4;
  cursor: not-allowed;
}
.ctrl-btn--play {
  width: 96px;
  height: 96px;
  background: rgba(245, 158, 11, 0.22);
  border-color: rgba(245, 158, 11, 0.6);
}
.ctrl-btn--play img {
  width: 56px;
  height: 56px;
}
/*
 * iter13k-2 Learn chip — sized to match Prev/Next (72×72) but the bear
 * avatar is allowed to bleed slightly outside via overflow:visible so
 * it reads as a "character" not a transport icon.
 */
.ctrl-btn--learn {
  background: rgba(255, 241, 200, 0.18);
  border-color: rgba(255, 241, 200, 0.55);
  overflow: visible;
}
.ctrl-btn--learn img {
  width: 84px;
  height: 84px;
}

/*
 * TV v1.0 §4.3 lang toggle chip. Shares ctrl-btn shell but the icon is
 * a circular profile glyph and a tiny text label hangs underneath
 * (matches the round-disc + label style on LearningScreen iter13l-7).
 */
.ctrl-btn--lang {
  width: 80px;
  height: 80px;
  background: rgba(255, 241, 200, 0.72);
  border-color: rgba(245, 158, 11, 0.55);
  flex-direction: column;
  gap: 0;
  padding: 4px 0 0;
  overflow: visible;
}
.ctrl-btn--lang img {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.4));
}
.ctrl-btn-label {
  font-family: var(--ff-display);
  font-size: 14px;
  font-weight: 700;
  color: #3D2817;
  letter-spacing: 0.04em;
  line-height: 1.1;
  margin-top: 2px;
}
.ctrl-btn.is-focused,
.ctrl-btn[data-focused='true'] {
  transform: scale(1.12);
  border-color: var(--c-amber);
  box-shadow:
    inset 0 0 0 3px var(--c-amber),
    0 0 0 5px rgba(255, 245, 230, 0.3),
    0 0 26px 6px var(--c-focus-soft);
}
</style>
