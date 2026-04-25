<!--
  GalleryView — dev-only UI audit shell.
  Activated by ?gallery=1. Mounted in place of App.vue (see main.ts).

  Zero intrusion:
  - Does NOT touch screenStore bootstrap, does NOT monkey-patch api/stores
  - Screens are rendered as real components via <component :is="…"/>
  - 3 data tiers (empty/normal/heavy) are seeded by writing directly into
    pinia stores; switching tiers triggers a :key remount of the preview
    so each screen re-runs its onMounted with fresh state.
  - Preview uses the canonical 1280×720 .tv-stage letterbox.

  Safety net: if a screen's onMounted throws (e.g. expects a real server),
  we catch via an ErrorBoundary-ish onErrorCaptured and show a friendly
  placeholder — gallery keeps working.
-->

<script setup lang="ts">
import { ref, computed, shallowRef, onErrorCaptured, markRaw } from 'vue';
import { useI18n } from 'vue-i18n';
import { setLocale } from '@/i18n';
import { useChildStore } from '@/stores/child';
import { useDeviceStore } from '@/stores/device';
import { useStoryStore } from '@/stores/story';
import { useDialogueStore } from '@/stores/dialogue';
import { useScreenStore, type ScreenName } from '@/stores/screen';
import { resetForScreenChange as resetFocusForScreenChange } from '@/services/focus';
import { asset } from '@/utils/assets';

import ActivationScreen from '@/screens/ActivationScreen.vue';
import HomeScreen from '@/screens/HomeScreen.vue';
import CreateScreen from '@/screens/CreateScreen.vue';
import DialogueScreen from '@/screens/DialogueScreen.vue';
import GeneratingScreen from '@/screens/GeneratingScreen.vue';
import StoryCoverScreen from '@/screens/StoryCoverScreen.vue';
import StoryBodyScreen from '@/screens/StoryBodyScreen.vue';
import StoryEndScreen from '@/screens/StoryEndScreen.vue';
import LibraryScreen from '@/screens/LibraryScreen.vue';
import FavoritesScreen from '@/screens/FavoritesScreen.vue';
import LearningScreen from '@/screens/LearningScreen.vue';
import ProfileScreen from '@/screens/ProfileScreen.vue';
import LeaderboardScreen from '@/screens/LeaderboardScreen.vue';
import CreateInviteScreen from '@/screens/CreateInviteScreen.vue';
import OfflineScreen from '@/screens/OfflineScreen.vue';
import ErrorScreen from '@/screens/ErrorScreen.vue';

type GalleryScreen = Exclude<ScreenName, 'boot'>;
type DataTier = 'empty' | 'normal' | 'heavy';

interface ScreenEntry {
  name: GalleryScreen;
  label: string;
  comp: unknown;
  /**
   * Dialogue has three visually distinct states (3A/3B/3C). Gallery exposes
   * each via its own sidebar button; when clicked, we write this phase to a
   * module-level window flag that DialogueScreen's `readDemoPhase()` picks up
   * at mount time, letting one component back 3 sidebar items without a URL
   * reload or prop plumbing.
   */
  demoPhase?: '3A' | '3B' | '3C';
}

const SCREENS: ScreenEntry[] = [
  { name: 'activation',  label: '1. Activation',  comp: markRaw(ActivationScreen) },
  { name: 'home',        label: '2. Home',        comp: markRaw(HomeScreen) },
  { name: 'create',      label: '2b. Dream Factory', comp: markRaw(CreateScreen) },
  { name: 'dialogue',    label: '3A. Dialogue · Waiting',    comp: markRaw(DialogueScreen), demoPhase: '3A' },
  { name: 'dialogue',    label: '3B. Dialogue · Kid talks',  comp: markRaw(DialogueScreen), demoPhase: '3B' },
  { name: 'dialogue',    label: '3C. Dialogue · Bear talks', comp: markRaw(DialogueScreen), demoPhase: '3C' },
  { name: 'generating',  label: '4. Generating',  comp: markRaw(GeneratingScreen) },
  { name: 'story-cover', label: '5. Story Cover', comp: markRaw(StoryCoverScreen) },
  { name: 'story-body',  label: '6. Story Body',  comp: markRaw(StoryBodyScreen) },
  { name: 'story-end',   label: '7. Story End',   comp: markRaw(StoryEndScreen) },
  { name: 'library',     label: '8. Library',     comp: markRaw(LibraryScreen) },
  { name: 'favorites',   label: '8b. Favorites',  comp: markRaw(FavoritesScreen) },
  { name: 'learning',    label: '9. Learning',    comp: markRaw(LearningScreen) },
  { name: 'profile',     label: '10. Profile',    comp: markRaw(ProfileScreen) },
  // TV v1.0 §3.1 / §3.2 — new screens.
  { name: 'leaderboard',    label: '13. Bear Stars',     comp: markRaw(LeaderboardScreen) },
  { name: 'create-invite',  label: '14. Create Invite',  comp: markRaw(CreateInviteScreen) },
  { name: 'offline',     label: '11. Offline',    comp: markRaw(OfflineScreen) },
  { name: 'error',       label: '12. Error',      comp: markRaw(ErrorScreen) },
];

// Sidebar key (matches the label-uniqueness since several rows share `name`).
const currentLabel = ref<string>('2. Home');
const currentScreen = ref<GalleryScreen>('home');
const currentTier = ref<DataTier>('normal');
type GalleryLocale = 'zh' | 'en' | 'pl' | 'de' | 'es' | 'ja';
const GALLERY_LOCALES: readonly GalleryLocale[] = ['en', 'zh', 'ja', 'de', 'es', 'pl'];
const currentLocale = ref<GalleryLocale>('en');
const { t: _t } = useI18n();
void _t; // ensure i18n is wired before child screens mount

const lastError = shallowRef<string | null>(null);
const remountKey = ref(0);

const child = useChildStore();
const device = useDeviceStore();
const story = useStoryStore();
const dialogue = useDialogueStore();
const screen = useScreenStore();

function nowIso(): string { return new Date().toISOString(); }

function seedTier(tier: DataTier): void {
  if (tier === 'empty') {
    child.setActiveLocal(null);
    child.allChildren = [];
    device.storiesLeft = 0;
    device.status = 'activated_unbound';
    device.parentEmail = null;
    story.clearGeneration();
    story.clearPlayback();
    dialogue.reset();
    return;
  }

  const now = nowIso();
  const luna = {
    id: 'demo-luna', parentId: 'demo-parent',
    name: 'Luna', age: 5, gender: 'female' as const,
    avatar: 'avatar_bear_classic',
    primaryLang: 'en' as const, secondLang: 'zh' as const,
    birthday: null, coins: tier === 'heavy' ? 420 : 32,
    voiceId: null, createdAt: now, updatedAt: now,
  };
  const timmy = { ...luna, id: 'demo-timmy', name: 'Timmy', age: 4, gender: 'male' as const, coins: 12 };
  const mia   = { ...luna, id: 'demo-mia',   name: 'Mia',   age: 7, gender: 'female' as const, coins: 88 };

  child.setActiveLocal(luna);
  child.allChildren = tier === 'heavy' ? [luna, timmy, mia] : [luna];

  device.status = 'bound';
  device.parentEmail = 'parent@demo.wonderbear.app';
  device.storiesLeft = tier === 'heavy' ? 2 : 18;

  const makeSummary = (i: number) => ({
    id: `demo-story-${i}`,
    title: `The Brave Little Bear #${i}`,
    coverUrl: '',
    createdAt: now,
    playCount: (i * 3) % 9,
    favorited: i % 3 === 0,
    primaryLang: 'en' as const,
    downloaded: false,
  });
  const libraryCount = tier === 'heavy' ? 12 : 3;
  // Expose as story-list fallback — screens fetch via api, but if a screen
  // reads storyStore directly for previews we still have a sample loaded.
  /*
   * iter13l-3: gallery seed now uses real-feeling story prose (no more
   * "Page N:" UI prefix) so the Learning screen's character cursor
   * starts on actual narrative letters/CJK from the first walkable
   * unit. Mix of watercolor backdrops keeps each page visually distinct.
   */
  const pageBgs = [
    asset('story/story_generic_forest.webp'),
    asset('bg/bg_meadow.webp'),
    asset('story/story_generic_ocean.webp'),
    asset('bg/bg_seaside.webp'),
    asset('story/story_generic_sky.webp'),
  ];
  const samplePages = [
    'Luna tiptoed deeper into the glowing forest, where every leaf whispered a secret.',
    'A small bear cub hummed a tune as fireflies danced around his ears.',
    'Beyond the river of stars, an ancient turtle waited with a folded map.',
    'The moonbridge creaked once, then opened a path made of soft, silver light.',
    'Brave little Mia tucked her acorn into her pocket and waved goodbye.',
    'Three tiny mice rolled a giant strawberry across the marble courtyard.',
  ];
  const sampleZh = [
    '露娜蹑手蹑脚走进发光的森林,每片叶子都在低语秘密。',
    '小熊一边哼着歌,一边看萤火虫绕着耳朵飞舞。',
    '在群星之河的尽头,一只古老的乌龟拿着折叠的地图等待着。',
    '月亮桥吱呀一声,亮起一条由柔软银光铺成的路。',
    '勇敢的米娅把橡果放进口袋,挥手道别。',
    '三只小老鼠推着一颗巨大的草莓,穿过大理石庭院。',
  ];
  const pages = Array.from({ length: 12 }, (_, i) => ({
    pageNum: i + 1,
    imageUrl: pageBgs[i % pageBgs.length],
    imageUrlHd: pageBgs[i % pageBgs.length],
    text: samplePages[i % samplePages.length] ?? samplePages[0]!,
    textLearning: i % 2 === 0 ? (sampleZh[i % sampleZh.length] ?? null) : null,
    ttsUrl: null,
    ttsUrlLearning: null,
    durationMs: 4000,
  }));
  story.active = {
    id: 'demo-story-1',
    childId: luna.id,
    title: 'The Brave Little Bear',
    titleLearning: null,
    coverUrl: '',
    pages,
    dialogue: {
      summary: { mainCharacter: 'Luna', scene: 'glowing forest', conflict: 'lost the golden key' },
      rounds: [],
    },
    metadata: { primaryLang: 'en', learningLang: 'zh', provider: 'mock' },
    status: 'completed',
    isPublic: false,
    favorited: true,
    playCount: 3,
    createdAt: now,
    completedAt: now,
  };
  story.pageIndex = 0;
  story.isPaused = false;

  // Generating screen seed (so percent bar renders when inspected)
  if (tier === 'heavy') {
    story.generatingStoryId = 'demo-gen-1';
    story.genStatus = 'generating';
    story.genStage = 'image';
    story.pagesGenerated = 8;
    story.totalPages = 12;
    story.percent = 66;
    story.estimatedDurationSec = 75;
    story.genStartedAt = Date.now() - 42_000;
  } else {
    story.generatingStoryId = 'demo-gen-1';
    story.genStatus = 'queued';
    story.genStage = 'queue';
    story.pagesGenerated = 0;
    story.percent = 8;
    story.genStartedAt = Date.now() - 3_000;
  }

  // Keep reference so TS doesn't whine about unused local
  void [timmy, mia, makeSummary, libraryCount];
}

function applyScreen(entry: ScreenEntry): void {
  lastError.value = null;
  seedTier(currentTier.value);
  currentScreen.value = entry.name;
  currentLabel.value = entry.label;
  // Hand the dialogue phase override to DialogueScreen via a window flag.
  // (Cleared on every switch so other screens never see stale state.)
  const w = window as unknown as { __WB_DEMO_PHASE?: string | undefined };
  w.__WB_DEMO_PHASE = entry.demoPhase;
  // Keep screenStore.current in sync so any screen that reads it works.
  screen.current = entry.name;
  /*
   * iter13i-3: direct assignment above bypasses screen.go()'s
   * resetForScreenChange(), leaving the previous screen's focus id
   * alive in the registry → the newly-mounted screen's autoFocus gets
   * skipped (autoFocus only fires when currentFocusId is null). Call
   * the reset explicitly so the next screen starts from a clean slate
   * and its first focusable with autoFocus=true claims focus.
   */
  resetFocusForScreenChange();
  remountKey.value += 1;
  /*
   * iter8: sidebar buttons are real HTMLButtonElements — after a click the
   * browser leaves them with :focus, which swallows arrow keys before our
   * global keyRouter (window keydown) sees them. Blur the active element so
   * arrow / OK go straight to the previewed screen's focus store.
   */
  setTimeout(() => {
    const el = document.activeElement as HTMLElement | null;
    if (el && typeof el.blur === 'function') el.blur();
  }, 0);
}

function applyTier(tier: DataTier): void {
  currentTier.value = tier;
  const entry = SCREENS.find((s) => s.label === currentLabel.value)
    ?? SCREENS[0];
  applyScreen(entry);
}

function applyLocale(loc: GalleryLocale): void {
  currentLocale.value = loc;
  setLocale(loc);
}

function openStandalone(): void {
  const entry = SCREENS.find((s) => s.label === currentLabel.value);
  const p = new URLSearchParams(window.location.search);
  p.delete('gallery');
  p.set('dev', '1');
  p.set('autobind', '1');
  p.set('screen', currentScreen.value);
  if (entry?.demoPhase) p.set('demoPhase', entry.demoPhase);
  else p.delete('demoPhase');
  const url = `${window.location.origin}${window.location.pathname}?${p.toString()}`;
  window.open(url, '_blank');
}

const currentComp = computed(() => {
  const e = SCREENS.find((s) => s.label === currentLabel.value);
  return e ? e.comp : null;
});

onErrorCaptured((err) => {
  lastError.value = err instanceof Error ? err.message : String(err);
  return false;
});

// Initial seed
seedTier(currentTier.value);
screen.current = currentScreen.value;
</script>

<template>
  <div class="gallery">
    <header class="toolbar">
      <div class="tb-left">
        <strong class="tb-title">WonderBear TV · UI Gallery</strong>
        <span class="tb-meta">{{ currentScreen }}</span>
      </div>

      <div class="tb-group">
        <span class="tb-label">Locale:</span>
        <button
          v-for="loc in GALLERY_LOCALES" :key="loc"
          :class="['tb-btn', { active: currentLocale === loc }]"
          @click="applyLocale(loc)"
        >{{ loc.toUpperCase() }}</button>
      </div>

      <div class="tb-group">
        <span class="tb-label">Data:</span>
        <button
          v-for="tier in (['empty','normal','heavy'] as const)" :key="tier"
          :class="['tb-btn', { active: currentTier === tier }]"
          @click="applyTier(tier)"
        >{{ tier }}</button>
      </div>

      <div class="tb-right">
        <button class="tb-btn primary" @click="openStandalone">独立全屏 ↗</button>
      </div>
    </header>

    <aside class="sidebar">
      <button
        v-for="s in SCREENS" :key="s.label"
        :class="['side-btn', { active: currentLabel === s.label }]"
        @click="applyScreen(s)"
      >{{ s.label }}</button>
    </aside>

    <main class="preview">
      <div class="stage-wrap">
        <div class="tv-stage gallery-stage">
          <component
            v-if="currentComp"
            :is="currentComp"
            :key="currentScreen + '-' + currentTier + '-' + remountKey"
          />
        </div>
        <div v-if="lastError" class="err-overlay">
          <div class="err-box">
            <div class="err-title">Screen threw during mount</div>
            <div class="err-msg">{{ lastError }}</div>
            <div class="err-hint">This is usually a missing API/asset in dev — the screen is still usable for layout review.</div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.gallery {
  width: 100vw;
  height: 100vh;
  display: grid;
  grid-template-columns: 280px 1fr;
  grid-template-rows: 60px 1fr;
  grid-template-areas:
    "tb tb"
    "sb pv";
  background: #0f0a08;
  color: #fff5e6;
  font-family: 'Fredoka', -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

.toolbar {
  grid-area: tb;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 16px;
  background: #1a0f0a;
  border-bottom: 1px solid rgba(255, 200, 87, 0.25);
  font-size: 13px;
}
.tb-left { display: flex; align-items: baseline; gap: 10px; }
.tb-title { color: #ffc857; letter-spacing: 0.04em; }
.tb-meta { color: rgba(255, 245, 230, 0.55); font-family: monospace; }
.tb-group { display: flex; align-items: center; gap: 4px; margin-left: 16px; }
.tb-label { color: rgba(255, 245, 230, 0.55); margin-right: 4px; }
.tb-right { margin-left: auto; }

.tb-btn {
  padding: 5px 10px;
  background: rgba(255, 245, 230, 0.08);
  color: #fff5e6;
  border: 1px solid rgba(255, 245, 230, 0.2);
  border-radius: 4px;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.tb-btn:hover { background: rgba(255, 200, 87, 0.18); }
.tb-btn.active { background: #ffc857; color: #1a0f0a; border-color: #ffc857; font-weight: 700; }
.tb-btn.primary { background: #ff7e5f; color: #fff; border-color: #ff7e5f; }
.tb-btn.primary:hover { background: #ff9577; }

.sidebar {
  grid-area: sb;
  background: #15100c;
  border-right: 1px solid rgba(255, 200, 87, 0.15);
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.side-btn {
  display: block;
  width: 100%;
  text-align: left;
  padding: 10px 14px;
  background: transparent;
  color: rgba(255, 245, 230, 0.85);
  border: 1px solid transparent;
  border-left: 3px solid transparent;
  border-radius: 4px;
  font-size: 14px;
  font-family: inherit;
  cursor: pointer;
  letter-spacing: 0.02em;
}
.side-btn:hover { background: rgba(255, 200, 87, 0.1); color: #fff5e6; }
.side-btn.active {
  background: rgba(255, 200, 87, 0.18);
  color: #ffc857;
  border-left-color: #ffc857;
  font-weight: 600;
}

.preview {
  grid-area: pv;
  overflow: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0a0604;
  padding: 24px;
}
.stage-wrap { position: relative; flex: 0 0 auto; }

/* Force the canonical 1280×720 letterbox regardless of CSS var values. */
.gallery-stage {
  position: relative;
  width: 1280px;
  height: 720px;
  overflow: hidden;
  background: #2b1a0f;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.6);
  border-radius: 4px;
}

.err-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 24px;
  pointer-events: none;
}
.err-box {
  background: rgba(26, 15, 10, 0.95);
  border: 1px solid #ff7e5f;
  border-radius: 6px;
  padding: 12px 16px;
  max-width: 640px;
  font-size: 13px;
  pointer-events: auto;
}
.err-title { color: #ff7e5f; font-weight: 700; margin-bottom: 4px; }
.err-msg { color: #fff5e6; font-family: monospace; word-break: break-word; margin-bottom: 6px; }
.err-hint { color: rgba(255, 245, 230, 0.6); font-size: 11px; }
</style>
