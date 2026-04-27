<!--
  LearningScreen — character-by-character reading mode (识字).

  iter13k flow:
    - Primary text is split into walkable units (single CJK characters
      OR whole English words). A `cursor` index walks through them via
      Left / Right arrow keys.
    - The bear_pointing sprite slides horizontally so it appears to
      "point at" the currently focused unit.
    - OK replays the page TTS (per-character TTS endpoint not in API
      contract yet — when it lands we'll switch to per-unit playback).
    - Down from the text-row jumps to the bottom action row. Up from
      the action row returns focus to the text row at its last index.
    - "Back to story" button returns to StoryBody (not Home — earlier
      copy "回首页" was misleading).

  Why a custom Left/Right interceptor:
    The focus router only walks between focusables by static neighbor
    OR geometric search. To navigate INSIDE a single focusable's text
    we'd need N children. Instead we register one focusable for the
    text-row and intercept Left/Right at capture phase while the row
    is focused, mutating `cursor` directly and stopping propagation
    so the global router never moves focus away.
-->

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import { useStoryStore } from '@/stores/story';
import { useScreenStore } from '@/stores/screen';
import { useBgmStore } from '@/stores/bgm';
import { useI18n } from 'vue-i18n';
import { bridge } from '@/services/bridge';
import { useFocusable, getCurrentFocusId, onFocusChange, setFocus } from '@/services/focus';
import { ERR } from '@/utils/errorCodes';
import { asset } from '@/utils/assets';
import { buildDemoStory } from '@/utils/demoStory';

const storyStore = useStoryStore();
const screen = useScreenStore();
const bgm = useBgmStore();
const { t } = useI18n();

// 2026-04-27 dev/gallery: seed a demo story SYNCHRONOUSLY during setup
// so the v-if="currentPage" template branch renders on first paint and
// `useFocusable(textRowEl)` finds a real DOM node when its onMounted
// hook fires. Doing this in onMounted was too late — the focusable's
// own onMounted (registered earlier in setup order) had already
// silently bailed with "ref not bound", which left autoFocus dead and
// the bear-pointer hidden (opacity: 0 until the row gets focus).
{
  const isDevBrowser = import.meta.env.DEV
    || (typeof window !== 'undefined'
        && new URLSearchParams(window.location.search).has('dev'));
  if (isDevBrowser && !storyStore.active) {
    storyStore.active = buildDemoStory({
      id: 'demo-learning',
      title: 'The Brave Little Bear',
      coverUrl: '',
    });
    storyStore.pageIndex = 0;
  }
}

const textRowEl = ref<HTMLElement | null>(null);
const charSpanEls = ref<HTMLElement[]>([]);
const langToggleEl = ref<HTMLElement | null>(null);

const focusedId = ref<string>('');
let unsubFocus: (() => void) | null = null;
let mounted = true;

const story = computed(() => storyStore.active);
const currentPage = computed(() => storyStore.currentPage);
const pageIndex = computed(() => storyStore.pageIndex);
const totalPages = computed(() => storyStore.active?.pages.length ?? 0);

/*
 * Split primary text into walkable units. Strategy:
 *   - A run of CJK characters (\u4e00-\u9fff) → each char is its own unit.
 *   - A run of ASCII letters/digits         → grouped into a "word" unit.
 *   - Whitespace and punctuation             → emitted as their own unit
 *     but skipped during navigation (kid doesn't want focus on a comma).
 * Each unit also carries a `walkable` flag.
 */
type Unit = { text: string; walkable: boolean };
function tokenize(text: string): Unit[] {
  const out: Unit[] = [];
  let i = 0;
  const isCjk = (c: string) => /[\u4e00-\u9fff\u3400-\u4dbf]/.test(c);
  const isWord = (c: string) => /[A-Za-z0-9]/.test(c);
  while (i < text.length) {
    const c = text[i] ?? '';
    if (isCjk(c)) {
      out.push({ text: c, walkable: true });
      i += 1;
    } else if (isWord(c)) {
      let j = i;
      while (j < text.length && isWord(text[j] ?? '')) j += 1;
      out.push({ text: text.slice(i, j), walkable: true });
      i = j;
    } else {
      out.push({ text: c, walkable: false });
      i += 1;
    }
  }
  return out;
}

/*
 * iter13l-7: bilingual companion is GONE — learning shows ONE language
 * at a time. A toggle pinned to the top swaps between
 *   - 'primary'  : currentPage.text (e.g., the English narrative)
 *   - 'secondary': currentPage.textLearning (e.g., the Chinese version)
 * The button label always names the OTHER side ("Click here to switch
 * to that one"). Per-character word-by-word reading uses whichever
 * string is active.
 */
type LangMode = 'primary' | 'secondary';
const langMode = ref<LangMode>('primary');

function detectLang(text: string | null | undefined): 'zh' | 'en' | 'unknown' {
  if (!text) return 'unknown';
  if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(text)) return 'zh';
  if (/[A-Za-z]/.test(text)) return 'en';
  return 'unknown';
}

const activeText = computed<string>(() => {
  const p = currentPage.value;
  if (!p) return '';
  if (langMode.value === 'secondary' && p.textLearning) return p.textLearning;
  return p.text ?? '';
});

const units = computed<Unit[]>(() => tokenize(activeText.value));

/** Indices in `units` that are walkable (skip whitespace/punctuation). */
const walkable = computed<number[]>(() =>
  units.value.reduce<number[]>((acc, u, idx) => {
    if (u.walkable) acc.push(idx);
    return acc;
  }, [])
);

/**
 * Label for the toggle: name of the language that's NOT currently
 * active. If the secondary side doesn't exist on this page the toggle
 * is hidden entirely (handled in the template via v-if).
 */
const langToggleAvailable = computed(() =>
  Boolean(currentPage.value?.text) && Boolean(currentPage.value?.textLearning)
);
const otherLangLabel = computed<string>(() => {
  const p = currentPage.value;
  if (!p) return '';
  const otherText = langMode.value === 'primary' ? p.textLearning : p.text;
  const lang = detectLang(otherText);
  if (lang === 'zh') return '中文';
  if (lang === 'en') return 'English';
  return t('learning.switchLang');
});

/** Cursor → index INTO `walkable` (not `units`). */
const cursor = ref(0);
const cursorUnitIdx = computed(() => walkable.value[cursor.value] ?? 0);

const isRowFocused = computed(() => focusedId.value === 'learning-text-row');

/** Cursor-focused unit shown HUGE in the center stage (active lang only). */
const focusedChar = computed(() => units.value[cursorUnitIdx.value]?.text ?? '');

function replayPage(): void {
  const page = currentPage.value;
  if (!page) return;
  bridge.stopTts();
  /*
   * 2026-04-28 PHASE1: when the toggle is on the learning side play the
   * learning-language audio track. Falls back to whichever URL is
   * present — older / mock stories may carry only one language.
   */
  const url = (langMode.value === 'secondary' && page.ttsUrlLearning)
    ? page.ttsUrlLearning
    : (page.ttsUrl ?? page.ttsUrlLearning ?? null);
  if (url) bridge.playTts(url);
}

function exitReading(): void {
  bridge.stopTts();
  if (storyStore.active) {
    screen.go('story-body');
  } else {
    screen.go('home');
  }
}

/*
 * Capture-phase keydown listener. While the text-row is focused,
 * Left/Right walk the `cursor` instead of moving focus. At the edges
 * we let the event fall through so the global router can move focus
 * to the action buttons (Right at end → exit; Left at start → no-op).
 */
/*
 * iter13l-6 key handler:
 *   - Left at start of page → previous page (cursor lands on last unit).
 *   - Right at end of page → next page (cursor resets to 0). When we
 *     run past the final page, exit back to the story body so the kid
 *     never gets stuck.
 *   - Otherwise Left/Right walk the cursor inside the current page.
 *   - Action buttons Play-again / Back-to-story were removed in this
 *     iteration: OK still replays current page TTS, Back exits.
 */
function onKeyCapture(e: KeyboardEvent): void {
  if (!isRowFocused.value) return;
  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (cursor.value > 0) {
      cursor.value -= 1;
    } else {
      // At first unit: jump back one page; cursor reset happens in the
      // currentPage watcher and the new page TTS replays from onMounted-
      // style behaviour via watchEffect below.
      storyStore.prevPage();
    }
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (cursor.value < walkable.value.length - 1) {
      cursor.value += 1;
    } else {
      // Last unit on this page → advance to next picture-book page.
      // If already on the last page, bail back to story body so we
      // never dead-end the kid at "no further input does anything".
      const moved = storyStore.nextPage();
      if (!moved) exitReading();
    }
  }
}

function onToggleLang(): void {
  if (!langToggleAvailable.value) return;
  langMode.value = langMode.value === 'primary' ? 'secondary' : 'primary';
  cursor.value = 0;
  bridge.log('learning', { event: 'lang_toggled', mode: langMode.value });
  // After toggle, replay TTS for the new language. (Per-lang TTS URLs
  // exist via ttsUrl / ttsUrlLearning when the server eventually wires
  // them; for now replayPage falls back to whichever is present.)
  void nextTick(replayPage);
}

useFocusable(textRowEl, {
  id: 'learning-text-row',
  autoFocus: true,
  neighbors: { up: 'learning-lang-toggle' },
  onEnter: replayPage,
  onBack: exitReading,
});
useFocusable(langToggleEl, {
  id: 'learning-lang-toggle',
  neighbors: { down: 'learning-text-row' },
  onEnter: onToggleLang,
  onBack: exitReading,
});

/*
 * iter13l-5: bear slides horizontally along the subtitle strip; the
 * vertical position is fixed (just above the strip). Center stage
 * handles the "look at this character" zoom in a separate visual area
 * so the subtitle text itself stays at normal size and never reflows.
 */
const bearX = ref(0);
function recomputeBearPos(): void {
  const row = textRowEl.value;
  const idx = cursorUnitIdx.value;
  const span = charSpanEls.value[idx];
  if (!row || !span) return;
  const rowRect = row.getBoundingClientRect();
  const sRect = span.getBoundingClientRect();
  const centerX = sRect.left + sRect.width / 2 - rowRect.left;
  bearX.value = centerX - 90; // 180 px bear / 2
}
watch([cursor, units], () => {
  void nextTick(recomputeBearPos);
}, { flush: 'post' });

// Reset cursor whenever the page text changes (story navigation).
watch(currentPage, () => {
  cursor.value = 0;
}, { flush: 'post' });

onMounted(() => {
  if (!storyStore.active) {
    // Production fallback (dev seed already happened synchronously above).
    bridge.log('learning', { event: 'mounted_without_active_story' });
    screen.goError(ERR.STORY_NOT_FOUND);
    return;
  }

  bgm.play('learning');
  storyStore.toggleLearningMode();

  replayPage();

  focusedId.value = getCurrentFocusId() ?? '';
  unsubFocus = onFocusChange((id) => {
    if (mounted) focusedId.value = id ?? '';
  });

  window.addEventListener('keydown', onKeyCapture, { capture: true });
  // 2026-04-27: belt-and-suspenders — useFocusable's autoFocus only
  // fires when scope/currentFocusId line up at register time. If the
  // previous screen left a stale focus id mid-transition, autoFocus
  // would silently skip and the bear-pointer (CSS opacity:0 unless
  // .is-following) would stay invisible. Force the row focus AFTER
  // mount so navigating in from StoryBody / Library reliably lights
  // up the cursor + bear-tracking.
  void nextTick(() => {
    setFocus('learning-text-row');
    recomputeBearPos();
  });
});

onBeforeUnmount(() => {
  mounted = false;
  bridge.stopTts();
  unsubFocus?.();
  window.removeEventListener('keydown', onKeyCapture, { capture: true } as AddEventListenerOptions);
  if (storyStore.learningMode) storyStore.toggleLearningMode();
});

// Helper used by the v-for to register span DOM nodes into our array
// in the correct order. Vue's :ref="fn" gives the el back; we push by
// index. Triggered each render so we always have fresh refs.
function setCharRef(el: Element | null, index: number): void {
  if (el) charSpanEls.value[index] = el as HTMLElement;
}
</script>

<template>
  <div class="learning-screen">
    <img class="bg-image" :src="asset('bg/bg_meadow.webp')" alt="" aria-hidden="true" />
    <div class="overlay" />

    <header class="topbar">
      <div class="page-counter t-md">
        {{ t('story.pageOf', { current: pageIndex + 1, total: totalPages }) }}
      </div>
      <!--
        iter13l-7 language toggle. Sits in the topbar between page
        counter and title. profile-icon stack with the OTHER language's
        name underneath. Pressing it flips `langMode`, which retokenises
        the page in the opposite-language string and resets the cursor.
        Hidden when the page lacks a learning translation.
      -->
      <button
        v-if="langToggleAvailable"
        ref="langToggleEl"
        type="button"
        class="lang-toggle wb-focus-feedback"
        :class="{ 'is-focused': focusedId === 'learning-lang-toggle' }"
        @click="onToggleLang"
      >
        <img
          class="lang-toggle-icon"
          :src="asset('ui/ui_home_profile.webp')"
          alt=""
          aria-hidden="true"
        >
        <span class="lang-toggle-label">{{ otherLangLabel }}</span>
      </button>
      <div v-if="story" class="story-title t-md">{{ story.title }}</div>
    </header>

    <!--
      iter13l-7: single-language flow. Center stage shows the cursor's
      unit HUGE; bilingual companion was removed because per-unit cross-
      lang alignment couldn't be solved cleanly without server tagging.
      The kid switches between languages via the topbar toggle.
    -->
    <main class="focus-stage">
      <span class="focus-char">{{ focusedChar }}</span>
    </main>

    <section
      v-if="currentPage"
      class="reader-strip"
    >
      <img
        class="bear-pointer"
        :class="{ 'is-following': isRowFocused }"
        :src="asset('bear/bear_pointing.webp')"
        alt=""
        aria-hidden="true"
        :style="{ transform: `translateX(${bearX}px)` }"
      >
      <div
        ref="textRowEl"
        class="reader-text"
      >
        <p class="reader-primary">
          <!-- iter13l-7: only the active language renders inline; the
               toggle in the topbar swaps which one. -->
          <span
            v-for="(u, idx) in units"
            :key="idx"
            :ref="(el) => setCharRef(el as Element | null, idx)"
            class="char"
            :class="{
              'is-walkable': u.walkable,
              'is-current': isRowFocused && idx === cursorUnitIdx,
            }"
          >{{ u.text }}</span>
        </p>
      </div>
    </section>

    <!-- iter13l-6: Play-again / Back-to-story buttons removed. OK on
         the strip replays the page, Right-at-end auto-advances to the
         next picture-book page, Left-at-start backs up. Back exits. -->
  </div>
</template>

<style scoped>
.learning-screen {
  width: 100%;
  height: 100%;
  position: relative;
  background: var(--c-bg-deep);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.bg-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  user-select: none;
  pointer-events: none;
}
.overlay {
  position: absolute;
  inset: 0;
  background: rgba(26, 15, 10, 0.25);
  pointer-events: none;
}

/*
 * iter13l-8 safe-area: TVs often crop ~5% on each edge ("overscan").
 * Topbar gets a top inset of 36 px so the toggle disc and page chip
 * never get clipped on physical hardware.
 */
.topbar {
  position: relative;
  z-index: 1;
  flex: 0 0 auto;
  height: 132px;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  padding: 36px var(--sp-7) 0;
  gap: var(--sp-3);
}
.topbar > .page-counter { justify-self: start; }
.topbar > .story-title  { justify-self: end; }
.topbar > .lang-toggle  { justify-self: center; }

/*
 * iter13l-7 language toggle button. Stack: profile icon glyph + the
 * NAME of the OTHER language ("中文" / "English"). Focus halo via
 * shared .wb-focus-feedback + per-element override.
 */
/*
 * iter13l-8: language toggle reshaped to match the round-disc visual
 * language used by HomeScreen MenuCards. The icon now sits inside a
 * circular cream disc; the label rides BELOW the disc as plain text
 * (no surrounding chip). Focus halo wraps the disc only.
 */
.lang-toggle {
  appearance: none;
  background: transparent;
  border: 0;
  color: var(--c-cream);
  cursor: pointer;
  padding: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.lang-toggle-icon {
  width: 88px;
  height: 88px;
  object-fit: contain;
  border-radius: 50%;
  background: rgba(255, 241, 200, 0.72);
  padding: 6px;
  filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.5));
  transition: transform var(--t-fast) var(--ease-out),
              box-shadow var(--t-fast) var(--ease-out),
              background var(--t-fast) var(--ease-out);
}
.lang-toggle-label {
  font-family: var(--ff-display);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--c-cream);
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
}
.lang-toggle.is-focused .lang-toggle-icon {
  transform: scale(1.08);
  background: rgba(255, 200, 87, 0.92);
  box-shadow:
    0 0 0 4px var(--c-amber),
    0 0 24px 6px var(--c-focus-soft);
}
.page-counter {
  color: var(--c-amber);
  background: rgba(0,0,0,0.45);
  padding: var(--sp-1) var(--sp-3);
  border-radius: 999px;
  letter-spacing: 0.08em;
}
.story-title {
  color: var(--c-cream);
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
}

/*
 * iter13l-5 layout:
 *   .focus-stage  — centered area, fills the empty middle of the screen,
 *                    shows the cursor unit at HUGE size.
 *   .reader-strip — bottom band with the subtitle text + a hovering bear
 *                    that slides to the cursor's x.
 */
.focus-stage {
  position: relative;
  z-index: 1;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  padding: var(--sp-4) var(--sp-6);
}
/*
 * iter13l-9: drop the display font for the giant cursor unit — Fredoka
 * + HanziPen/STHupo fallbacks were rendering CJK glyphs as ink blobs
 * (every stroke looked the same width). Use a clean sans Chinese stack
 * (PingFang Light / YaHei UI Light / Noto Sans SC Light) at weight 300
 * so the glyph anatomy reads. English words still render in the same
 * stack; sans-serif Latin fallback kicks in cleanly.
 */
.focus-char {
  font-family:
    'Fredoka',
    'PingFang SC', 'Microsoft YaHei UI', 'Microsoft YaHei',
    'Source Han Sans CN', 'Noto Sans SC',
    -apple-system, 'Segoe UI', sans-serif;
  font-weight: 300;
  color: var(--c-amber);
  font-size: 240px;
  line-height: 1;
  letter-spacing: 0.02em;
  text-shadow: 0 6px 18px rgba(0, 0, 0, 0.55);
  animation: focus-pulse 1.6s ease-in-out infinite alternate;
}
@keyframes focus-pulse {
  from { transform: scale(0.96); }
  to   { transform: scale(1.04); }
}

/*
 * iter13l-6: subtitle strip docks at the very bottom (action footer is
 * gone). It hugs ~28 px above the page edge so the bilingual lines
 * read like the closed-caption band on a TV.
 */
/*
 * iter13l-8 safe-area: bottom strip pulled UP from the screen edge so
 * the subtitle band doesn't kiss the TV bezel. 28 → 56 px clears the
 * standard overscan band.
 */
.reader-strip {
  position: relative;
  z-index: 1;
  flex: 0 0 auto;
  margin: 0 var(--sp-7) 56px;
  padding-top: 150px; /* room for 180 px bear floating above the strip */
}
.bear-pointer {
  position: absolute;
  left: 0;
  top: 0;
  width: 180px;
  height: 180px;
  object-fit: contain;
  filter: drop-shadow(0 8px 18px rgba(0, 0, 0, 0.5));
  transition: transform 220ms var(--ease-out), opacity 220ms var(--ease-out);
  /* 2026-04-27: bear is the cursor, not a focus indicator. Always
   * visible while the reader strip is rendered. Slight dim when row
   * isn't focused so it reads as "ready" vs "active". The earlier
   * opacity:0 default was masking the bear whenever focus failed to
   * register on first paint (e.g. nav from StoryBody). */
  opacity: 0.55;
  pointer-events: none;
  z-index: 3;
}
.bear-pointer.is-following {
  opacity: 1;
}

.reader-text {
  position: relative;
  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: rgba(26, 15, 10, 0.6);
  border-radius: 22px;
  padding: 18px 28px;
  backdrop-filter: blur(3px);
  transition: outline var(--t-fast) var(--ease-out);
}
.reader-text[data-focused='true'] {
  outline: 3px solid var(--c-amber);
  outline-offset: 4px;
  box-shadow: 0 0 32px 6px var(--c-focus-soft);
}

.reader-primary {
  color: var(--c-cream);
  font-family:
    'Fredoka',
    'PingFang SC', 'Microsoft YaHei UI', 'Microsoft YaHei',
    'Source Han Sans CN', 'Noto Sans SC',
    -apple-system, 'Segoe UI', sans-serif;
  font-size: 32px;
  font-weight: 500;
  margin: 0;
  line-height: 1.4;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.65);
  letter-spacing: 0.04em;
  word-break: break-word;
}
.char {
  position: relative;
  display: inline-block;
  padding: 0 1px;
  border-radius: 6px;
  transition: color var(--t-fast) var(--ease-out),
              text-shadow var(--t-fast) var(--ease-out);
}
/*
 * iter13l-5: focused char in the strip stays NORMAL size (the giant
 * version lives in the center stage). It just colors amber + glows
 * so the kid can locate the cursor in the sentence.
 */
.char.is-walkable.is-current {
  color: var(--c-amber);
  text-shadow:
    0 0 10px rgba(245, 158, 11, 0.85),
    0 2px 6px rgba(0, 0, 0, 0.6);
}

.actions {
  position: relative;
  z-index: 1;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-4);
  padding: var(--sp-4) var(--sp-6);
}
.action-btn {
  appearance: none;
  background: rgba(255, 245, 230, 0.08);
  border: 2px solid rgba(255, 200, 87, 0.25);
  color: var(--c-cream);
  padding: var(--sp-3) var(--sp-5);
  border-radius: var(--r-lg);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  font-family: inherit;
  min-width: 200px;
  justify-content: center;
  transition: all var(--t-fast) var(--ease-out);
}
.action-btn.primary {
  background: rgba(255, 200, 87, 0.18);
  border-color: var(--c-amber-soft);
}
.action-btn.is-focused {
  background: var(--c-amber);
  border-color: var(--c-amber);
  color: #1a0f0a;
  box-shadow: var(--shadow-focus);
}
.btn-icon { width: 28px; height: 28px; object-fit: contain; }
</style>
