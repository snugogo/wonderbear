<!--
  LeaderboardScreen — 小熊星光 / Bear Stars
  TV v1.0 §3.1.

  Layout (1080p, GP15-safe):
    +---------------------------------------------------+
    |  ⭐  小熊星光  Bear Stars              [home key]   |
    +---------------------------------------------------+
    |  小作家榜  |  本周热听  |  编辑精选                 |
    +---------------------------------------------------+
    |  list (scroll)                                    |
    |    Top1-3 medal + nickname + ⭐ count             |
    |    self row highlighted #FFF4D6                   |
    +---------------------------------------------------+
    |  我家:#12 ⭐ 64        [查看我家成长]    only on  |
    |                                          Writers  |
    +---------------------------------------------------+

  Tabs (3):
    1. writers     — small-author board (clickable → CreateInvite)
    2. weekly_hot  — weekly play count   (clickable → story-cover)
    3. editor_picks — editorial picks    (clickable → story-cover)

  Focus model:
    - 3 tab focusables in a row.
    - List rows are focusable; first row autoFocus when entering tab.
    - Right of last tab → first row; Left of first row → current tab.
    - Self-summary CTA "查看我家成长" focusable (Writers tab only).

  Mock-first: VITE_USE_MOCK_LEADERBOARD truthy → loads /src/mock/leaderboard.json
  via static import. Future: switch to api.leaderboard*() once server lands.
-->

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch, nextTick } from 'vue';
import { useScreenStore } from '@/stores/screen';
import { useStoryStore } from '@/stores/story';
import { useChildStore } from '@/stores/child';
import { useBgmStore } from '@/stores/bgm';
import { useI18n } from 'vue-i18n';
import { asset } from '@/utils/assets';
import { bridge } from '@/services/bridge';
import { api, ApiError } from '@/services/api';
import {
  useFocusable,
  setFocus,
  getCurrentFocusId,
  onFocusChange,
  type FocusableNeighbors,
} from '@/services/focus';
import { ERR } from '@/utils/errorCodes';
import mockData from '@/mock/leaderboard.json';

interface WritersRow {
  rank: number;
  family_id: string;
  display_nickname: string;
  stars: number;
  is_self?: boolean;
}
interface StoryRow {
  rank: number;
  story_id: string;
  title: string;
  cover_url: string;
  creator_nickname: string;
  weekly_plays_count?: number;
  is_editor_pick?: boolean;
}
interface SelfSummary {
  rank: number;
  stars: number;
  stars_to_top10: number;
  in_top10: boolean;
}
interface LeaderboardPayload {
  writers_board: WritersRow[];
  weekly_plays: StoryRow[];
  editor_picks: StoryRow[];
  self_summary: SelfSummary;
}

type TabId = 'writers' | 'weekly_hot' | 'editor_picks';
const tabs: Array<{ id: TabId; i18nKey: string }> = [
  { id: 'writers',      i18nKey: 'leaderboard.tabWriters' },
  { id: 'weekly_hot',   i18nKey: 'leaderboard.tabWeeklyHot' },
  { id: 'editor_picks', i18nKey: 'leaderboard.tabEditorPicks' },
];

const screen = useScreenStore();
const storyStore = useStoryStore();
const child = useChildStore();
const bgm = useBgmStore();
const { t } = useI18n();

const data = ref<LeaderboardPayload>(mockData as LeaderboardPayload);
const loading = ref<boolean>(false);
const activeTab = ref<TabId>('writers');
const focusedId = ref<string>('');
let unsubFocus: (() => void) | null = null;
let mounted = true;

/** Whether to use mock data (env-flag aware). */
const USE_MOCK = import.meta.env.VITE_USE_MOCK_LEADERBOARD !== 'false';

/*
 * Active list (writers vs story-rows). The two row types are kept in
 * separate refs so type discrimination stays cheap downstream.
 */
const writers = computed<WritersRow[]>(() => data.value.writers_board ?? []);
const weeklyHot = computed<StoryRow[]>(() => data.value.weekly_plays ?? []);
const editorPicks = computed<StoryRow[]>(() => data.value.editor_picks ?? []);
const selfSummary = computed<SelfSummary>(() =>
  data.value.self_summary ?? { rank: 999, stars: 0, stars_to_top10: 0, in_top10: false },
);

const activeRowsCount = computed<number>(() => {
  if (activeTab.value === 'writers') return writers.value.length;
  if (activeTab.value === 'weekly_hot') return weeklyHot.value.length;
  return editorPicks.value.length;
});

const showEmptyState = computed<boolean>(() => activeRowsCount.value < 3);
const showSelfBar = computed<boolean>(() => activeTab.value === 'writers');

/*
 * --- Tab focusables (3) ---
 */
const tabRefs: Array<import('vue').Ref<HTMLElement | null>> = tabs.map(() => ref<HTMLElement | null>(null));
function tabNeighbors(idx: number): FocusableNeighbors {
  const left = idx > 0 ? `lb-tab-${idx - 1}` : undefined;
  const right = idx < tabs.length - 1 ? `lb-tab-${idx + 1}` : undefined;
  // Down → first row of currently-active list (if any).
  const down = activeRowsCount.value > 0 ? 'lb-row-0' : (showEmptyState.value ? 'lb-empty-cta' : undefined);
  return { left, right, down };
}
tabs.forEach((tab, idx) => {
  useFocusable(tabRefs[idx]!, {
    id: `lb-tab-${idx}`,
    autoFocus: idx === 0,
    neighbors: tabNeighbors(idx),
    onFocus: () => { activeTab.value = tab.id; },
    onEnter: () => {
      activeTab.value = tab.id;
      if (activeRowsCount.value > 0) setFocus('lb-row-0');
    },
    onBack: () => { screen.go('home'); },
  });
});

/*
 * --- List row focusables (dynamic, max 50) ---
 *
 * We pre-allocate a single bag of refs by index — the same bag is
 * reused as we tab-switch. Row 0..N-1 are the active rows for the
 * current tab. setRowRef binds template-time DOM nodes.
 */
// 20 rows = matches our largest mock list (writers_board); raising
// the cap registers spurious useFocusable slots that warn at boot.
const ROW_CAP = 20;
const rowEls: Array<import('vue').Ref<HTMLElement | null>> = Array.from(
  { length: ROW_CAP },
  () => ref<HTMLElement | null>(null),
);
function setRowRef(el: Element | null, idx: number): void {
  const slot = rowEls[idx];
  if (slot) slot.value = el as HTMLElement | null;
}
function rowNeighbors(idx: number): FocusableNeighbors {
  const len = activeRowsCount.value;
  const up = idx === 0 ? `lb-tab-${tabs.findIndex((tt) => tt.id === activeTab.value)}` : `lb-row-${idx - 1}`;
  const down = idx < len - 1
    ? `lb-row-${idx + 1}`
    : (showSelfBar.value ? 'lb-self-cta' : undefined);
  return { up, down };
}
for (let i = 0; i < ROW_CAP; i++) {
  const idx = i;
  useFocusable(rowEls[idx]!, {
    id: `lb-row-${idx}`,
    neighbors: rowNeighbors(idx),
    onEnter: () => onRowEnter(idx),
    onBack: () => { screen.go('home'); },
  });
}

const selfCtaEl = ref<HTMLElement | null>(null);
useFocusable(selfCtaEl, {
  id: 'lb-self-cta',
  // Up neighbor falls through to geometric search → naturally lands on
  // the bottom row of the active list (rows above this CTA).
  neighbors: {},
  onEnter: () => { screen.go('profile'); },
  onBack: () => { screen.go('home'); },
});

const emptyCtaEl = ref<HTMLElement | null>(null);
useFocusable(emptyCtaEl, {
  id: 'lb-empty-cta',
  neighbors: { up: 'lb-tab-0' },
  onEnter: () => { screen.go('create'); },
  onBack: () => { screen.go('home'); },
});

/*
 * Row tap handler.
 *   writers     → CreateInviteScreen with self stars context
 *   weekly_hot  → load story detail + go story-cover
 *   editor_picks → same
 */
function onRowEnter(idx: number): void {
  if (activeTab.value === 'writers') {
    const w = writers.value[idx];
    bridge.log('leaderboard', { event: 'writers_row_pressed', rank: w?.rank });
    screen.go('create-invite', {
      stars: selfSummary.value.stars,
      stars_to_top10: selfSummary.value.stars_to_top10,
      in_top10: selfSummary.value.in_top10,
    });
    return;
  }
  const list = activeTab.value === 'weekly_hot' ? weeklyHot.value : editorPicks.value;
  const row = list[idx];
  if (!row) return;
  bridge.log('leaderboard', { event: 'story_row_pressed', tab: activeTab.value, story_id: row.story_id });
  void openStory(row.story_id);
}

/*
 * 2026-04-28 PHASE1: real story rows in editor_picks carry server
 * story IDs (cm…) that we can resolve via storyDetail. Mock writers /
 * weekly_plays rows still use synthetic IDs (story_xxxx) and short-
 * circuit to avoid 90002 ROUTE_NOT_FOUND noise.
 */
function isLikelyRealStoryId(id: string): boolean {
  // Prisma cuid: 25 chars, lowercase alphanum, leading 'c'.
  return /^c[a-z0-9]{20,30}$/i.test(id);
}

async function openStory(storyId: string): Promise<void> {
  if (!isLikelyRealStoryId(storyId)) {
    bridge.log('leaderboard', { event: 'mock_open_story', story_id: storyId });
    // Mock IDs (story_001 etc.) — graceful no-op, PRD allows this.
    return;
  }
  /*
   * Real story id → defer the storyDetail fetch to StoryCoverScreen
   * (PHASE1 wired it to honor screen.payload.storyId). This keeps the
   * editor_picks click path light and lets the cover screen own its
   * own loading + error states.
   */
  try {
    storyStore.clearPlayback();
    screen.go('story-cover', { storyId });
  } catch (e) {
    const code = e instanceof ApiError ? e.code : ERR.STORY_NOT_READY;
    screen.goError(code);
  }
}

/*
 * Reset row focus when switching tabs — but only if the user is
 * already navigating inside the row list. When the user is just
 * stepping left/right between tabs (focus still on a tab button),
 * we must NOT yank the focus down into the rows or it feels like
 * "the cursor jumped randomly" (Kristy 2026-04-27 feedback).
 *
 * Hierarchy contract:
 *   - left/right between tabs = stay in the tab row
 *   - down from a tab          = enter the row list (handled by
 *                                rowNeighbors / static down target)
 *   - clicking a tab via mouse / OK from a row tab swap   → row 0
 */
watch(activeTab, async () => {
  await nextTick();
  const cur = getCurrentFocusId();
  const focusInRows = typeof cur === 'string' && cur.startsWith('lb-row-');
  if (focusInRows && activeRowsCount.value > 0) {
    setFocus('lb-row-0');
  }
});

/*
 * 2026-04-28 PHASE1: editor_picks is the only Bear Stars tab driven
 * by real server data this phase. We fetch the active child's full
 * shelf via /api/story/list and randomly sample 5–8 rows to splice
 * into `data.editor_picks`, preserving the StoryRow shape the rest
 * of the screen already consumes. Writers / weekly_plays / self_summary
 * stay on the mock JSON per workorder §2.2 ("保持前端 mock json 不动").
 *
 * On any failure (no token / 401 in dev / network) we silently retain
 * the mock rows so the screen never goes blank.
 */
const EDITOR_PICK_MIN = 5;
const EDITOR_PICK_MAX = 8;

function pickRandom<T>(arr: T[], min: number, max: number): T[] {
  if (arr.length === 0) return [];
  const target = Math.min(arr.length, Math.max(min, Math.min(max, arr.length)));
  const pool = arr.slice();
  // Fisher–Yates partial shuffle, take first `target`.
  for (let i = 0; i < target; i++) {
    const j = i + Math.floor(Math.random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, target);
}

async function refreshEditorPicksFromServer(): Promise<void> {
  try {
    const { data: list } = await api.storyList({
      childId: child.activeChildId ?? undefined,
      sort: 'newest',
      limit: 50,
    });
    if (!mounted) return;
    const sampled = pickRandom(list.items, EDITOR_PICK_MIN, EDITOR_PICK_MAX);
    if (sampled.length === 0) return; // keep mock if shelf is empty
    const realRows: StoryRow[] = sampled.map((s, idx) => ({
      rank: idx + 1,
      story_id: s.id,
      title: s.title,
      cover_url: s.coverUrl,
      // Editor picks don't expose creator nicknames yet — match the
      // existing mock label ("WonderBear Studio") so the row visual
      // language stays consistent across the list.
      creator_nickname: 'WonderBear Studio',
      is_editor_pick: true,
    }));
    // Mutate inside an immutable replacement so reactivity + the
    // existing podium-top3 computed pick up the new shelf.
    data.value = { ...data.value, editor_picks: realRows };
    bridge.log('leaderboard', {
      event: 'editor_picks_refreshed',
      count: realRows.length,
      total: list.total,
    });
  } catch (e) {
    bridge.log('leaderboard', { event: 'editor_picks_refresh_failed', err: String(e) });
    // Silent: mock rows already populated, and Bear Stars must never
    // bounce to ErrorScreen for a non-essential overlay refresh.
  }
}

onMounted(() => {
  bgm.play('home');
  bridge.log('leaderboard', { event: 'mounted', mock: USE_MOCK });
  if (!USE_MOCK) {
    // Future: replace with api.leaderboard*() once endpoints exist.
    loading.value = true;
    Promise.resolve().finally(() => {
      if (mounted) loading.value = false;
    });
  }
  focusedId.value = getCurrentFocusId() ?? '';
  unsubFocus = onFocusChange((id) => {
    if (mounted) focusedId.value = id ?? '';
  });
  // Best-effort overlay: real shelf → editor_picks. Always attempt
  // (works in both dev and production) — failure is silent.
  void refreshEditorPicksFromServer();
});

onBeforeUnmount(() => {
  mounted = false;
  unsubFocus?.();
});

/*
 * iter13l-7: avatar mapping.
 * 17 bear/animal avatars in `assets/avatar/`. We hash the family_id
 * onto that pool so each row gets a stable but visually-varied avatar
 * across reloads. Fallback to avatar_bear_classic for the 'self' row.
 */
const AVATAR_POOL: readonly string[] = [
  'avatar_bear_classic', 'avatar_bear_pink', 'avatar_bear_blue',
  'avatar_bear_mint', 'avatar_bear_crown', 'avatar_bear_star',
  'avatar_bear_scarf', 'avatar_bear_glasses', 'avatar_bear_doctor',
  'avatar_bear_chef', 'avatar_bear_pilot', 'avatar_bear_painter',
  'avatar_cat', 'avatar_dog', 'avatar_rabbit', 'avatar_fox', 'avatar_owl',
];
function avatarFor(familyId: string, isSelf?: boolean): string {
  if (isSelf) return asset('avatar/avatar_bear_crown.webp');
  let h = 0;
  for (let i = 0; i < familyId.length; i++) {
    h = (h * 31 + familyId.charCodeAt(i)) | 0;
  }
  const key = AVATAR_POOL[Math.abs(h) % AVATAR_POOL.length] ?? AVATAR_POOL[0];
  return asset(`avatar/${key}.webp`);
}

/*
 * Podium showcase data — top 3 of the active list. Used by the
 * deco_podium hero strip above the list. Falls back to placeholders
 * when fewer than 3 rows exist (still during onboarding).
 */
const podiumTop3 = computed(() => {
  if (activeTab.value === 'writers') {
    return writers.value.slice(0, 3).map((r) => ({
      avatar: avatarFor(r.family_id, r.is_self),
      label: r.display_nickname,
      sub: `${r.stars}`,
    }));
  }
  const list = activeTab.value === 'weekly_hot' ? weeklyHot.value : editorPicks.value;
  return list.slice(0, 3).map((r) => ({
    avatar: r.cover_url,
    label: r.title,
    sub: r.creator_nickname,
  }));
});

</script>

<template>
  <!--
    iter13l-7: cream gradient bg (no image). deco_ribbon banners the
    title, deco_podium fronts the top-3 hero strip, deco_stars adds
    sparkle accents. All visuals reuse existing UI-pool webp art —
    no SVG / emoji decorations.
  -->
  <div class="leaderboard-screen">
    <!-- Title strip with ribbon backdrop. -->
    <header class="topbar">
      <img class="title-ribbon" :src="asset('deco/deco_ribbon.webp')" alt="" aria-hidden="true" />
      <img class="title-stars-l" :src="asset('deco/deco_stars.webp')" alt="" aria-hidden="true" />
      <img class="title-stars-r" :src="asset('deco/deco_stars.webp')" alt="" aria-hidden="true" />
      <h1 class="title-en-only">{{ t('leaderboard.titleEn') }}</h1>
    </header>

    <!-- Tab switcher. -->
    <nav class="tabs">
      <button
        v-for="(tab, i) in tabs"
        :key="tab.id"
        :ref="(el) => { if (tabRefs[i]) tabRefs[i]!.value = el as HTMLElement | null }"
        type="button"
        class="tab"
        :class="{
          'is-active': activeTab === tab.id,
          'is-focused': focusedId === `lb-tab-${i}`,
        }"
        @mouseenter="setFocus(`lb-tab-${i}`)"
        @click="activeTab = tab.id"
      >
        {{ t(tab.i18nKey) }}
      </button>
    </nav>

    <!--
      iter13l-8 horizontal split:
        LEFT  → podium hero (deco_podium with top 3 avatars perched
                on the 1/2/3 steps).
        RIGHT → ranked list of all rows (4..N — top 3 already in
                podium so the list starts from #4 in the writers tab).
      The whole region is wrapped in <main class="body-grid">.
    -->
    <main class="body-grid">
      <!-- LEFT: podium hero. -->
      <section v-if="!showEmptyState && !loading" class="podium-side">
        <h2 class="podium-heading">{{ t('leaderboard.topThree') }}</h2>
        <div class="podium-stage">
          <img class="podium-img" :src="asset('deco/deco_podium.webp')" alt="" aria-hidden="true" />
          <div class="podium-figures">
            <div
              v-for="(p, i) in podiumTop3"
              :key="i"
              class="podium-figure"
              :class="`podium-figure--${i + 1}`"
            >
              <img class="podium-avatar" :src="p.avatar" :alt="p.label" />
              <div class="podium-label">{{ p.label }}</div>
            </div>
          </div>
        </div>
      </section>

      <!-- RIGHT: ranked list. Falls through to empty state. -->
      <section class="list-side">
      <div v-if="loading" class="loading t-md">{{ t('common.loading') }}</div>

      <!-- Empty state (any tab with < 3 rows). -->
      <div v-else-if="showEmptyState" class="empty">
        <img class="empty-bear" :src="asset('bear/bear_empty_box.webp')" alt="" />
        <p class="empty-title t-lg">{{ t('leaderboard.emptyTitle') }}</p>
        <button
          ref="emptyCtaEl"
          type="button"
          class="empty-cta wb-focus-feedback"
          :class="{ 'is-focused': focusedId === 'lb-empty-cta' }"
          @click="screen.go('create')"
        >
          {{ t('leaderboard.emptyCta') }}
        </button>
      </div>

      <!--
        Writers (小作家榜): rank | medal? | nickname | ⭐ stars
      -->
      <ol v-else-if="activeTab === 'writers'" class="rows">
        <li
          v-for="(row, idx) in writers"
          :key="row.family_id"
          :ref="(el) => setRowRef(el as Element | null, idx)"
          class="row writers-row"
          :class="{
            'is-top3': row.rank <= 3,
            'is-self': row.is_self === true,
            'is-focused': focusedId === `lb-row-${idx}`,
          }"
          tabindex="-1"
          @mouseenter="setFocus(`lb-row-${idx}`)"
          @click="onRowEnter(idx)"
        >
          <span class="rank" :class="{ 'rank-top': row.rank <= 3 }">#{{ row.rank }}</span>
          <img class="row-avatar" :src="avatarFor(row.family_id, row.is_self)" alt="" />
          <span class="nickname">{{ row.display_nickname }}</span>
          <span class="stars">{{ row.stars }} <span class="stars-suffix">stars</span></span>
        </li>
      </ol>

      <!--
        Weekly Hot (本周热听) and Editor Picks (编辑精选): cover thumb +
        title + creator + (plays | pick badge).
      -->
      <ol v-else class="rows">
        <li
          v-for="(row, idx) in (activeTab === 'weekly_hot' ? weeklyHot : editorPicks)"
          :key="row.story_id"
          :ref="(el) => setRowRef(el as Element | null, idx)"
          class="row story-row"
          :class="{
            'is-top3': row.rank <= 3,
            'is-focused': focusedId === `lb-row-${idx}`,
          }"
          tabindex="-1"
          @mouseenter="setFocus(`lb-row-${idx}`)"
          @click="onRowEnter(idx)"
        >
          <span class="rank" :class="{ 'rank-top': row.rank <= 3 }">#{{ row.rank }}</span>
          <img class="cover" :src="row.cover_url" alt="" />
          <div class="story-meta">
            <div class="story-title">{{ row.title }}</div>
            <div class="story-sub">{{ t('leaderboard.creatorPrefix', { nickname: row.creator_nickname }) }}</div>
          </div>
          <span v-if="activeTab === 'weekly_hot'" class="weekly-plays">
            {{ t('leaderboard.weeklyPlaysSuffix', { count: row.weekly_plays_count }) }}
          </span>
          <span v-else class="pick-badge">{{ t('leaderboard.editorPickBadge') }}</span>
        </li>
      </ol>
      </section>
    </main>

    <!-- Self bar — Writers tab only. -->
    <footer v-if="showSelfBar && !showEmptyState" class="self-bar">
      <p class="self-text t-md">
        <template v-if="selfSummary.in_top10">{{ t('leaderboard.selfInTop10') }}</template>
        <template v-else-if="selfSummary.rank > 999">
          {{ t('leaderboard.selfRankBigOver', { stars: selfSummary.stars }) }}
        </template>
        <template v-else>
          {{ t('leaderboard.selfRank', { rank: selfSummary.rank, stars: selfSummary.stars }) }}
        </template>
      </p>
      <button
        ref="selfCtaEl"
        type="button"
        class="self-cta wb-focus-feedback"
        :class="{ 'is-focused': focusedId === 'lb-self-cta' }"
        @click="screen.go('profile')"
      >
        {{ t('leaderboard.viewMyGrowth') }}
      </button>
    </footer>
  </div>
</template>

<style scoped>
/*
 * GP15 constraints: only transform + opacity for animation; rgba flat
 * fills only (no backdrop-filter / blur / box-shadow on hot path); ≤ 3
 * concurrent animations. Focus feedback uses transform: scale + a flat
 * outline color change.
 */
.leaderboard-screen {
  width: 100%;
  height: 100%;
  position: relative;
  /*
   * iter13l-7: cream gradient (no bg image). Pulls from the same warm
   * palette as bg_home_cozy so the screen still feels nested inside
   * the WonderBear world.
   */
  background:
    radial-gradient(circle at 50% 0%, #FFF6DC 0%, transparent 50%),
    linear-gradient(180deg, #FBE9C4 0%, #F5D49A 60%, #EFC78A 100%);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.topbar, .tabs, .body-grid, .self-bar {
  position: relative;
  z-index: 1;
}

/* ---- Top title strip ----
 *
 * iter13l-8: ribbon nudged DOWN inside a taller (108 px) title bar so
 * it sits in the visual center, not flush with the screen edge.
 */
.topbar {
  flex: 0 0 auto;
  height: 96px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  /* Ensures the ribbon is clipped to the title bar — protects the
     body grid from any oversized deco overflow. */
  overflow: hidden;
  padding: 0 var(--sp-7);
}
.title-ribbon {
  position: absolute;
  top: 50%;
  left: 50%;
  /*
   * deco_ribbon.webp is a square asset whose ribbon graphic sits in
   * the middle horizontal band. We size it generously and let
   * overflow:hidden on .topbar clip the empty top/bottom edges.
   */
  width: 520px;
  height: 200px;
  transform: translate(-50%, -50%);
  object-fit: contain;
  pointer-events: none;
  user-select: none;
  filter: drop-shadow(0 4px 8px rgba(180, 100, 30, 0.25));
}
.title-stars-l, .title-stars-r {
  position: absolute;
  top: 50%;
  width: 56px;
  height: 56px;
  object-fit: contain;
  transform: translateY(-50%);
  opacity: 0.7;
  pointer-events: none;
}
.title-stars-l { left: 80px; }
.title-stars-r { right: 80px; transform: translateY(-50%) scaleX(-1); }
.title-en-only {
  position: relative;
  margin: 0;
  font-family: var(--ff-display);
  font-size: 30px;
  font-weight: 800;
  letter-spacing: 0.04em;
  color: #4A2A11;
  text-shadow: 0 1px 0 rgba(255, 250, 235, 0.7);
}

/* ---- Tabs ---- */
.tabs {
  flex: 0 0 auto;
  height: 56px;
  display: flex;
  padding: 0 var(--sp-7);
  background: rgba(255, 248, 231, 0.7);
  border-bottom: 2px solid rgba(240, 185, 92, 0.35);
}
.tab {
  appearance: none;
  background: transparent;
  border: 0;
  flex: 1 1 0;
  font-family: var(--ff-display);
  font-size: 22px;
  font-weight: 500;
  letter-spacing: 0.02em;
  color: #7A5A3A;
  cursor: pointer;
  position: relative;
  transition: transform 200ms ease-out, color 200ms ease-out;
}
.tab.is-active {
  color: #3D2817;
  font-weight: 700;
}
.tab.is-active::after {
  content: '';
  position: absolute;
  left: 28%;
  right: 28%;
  bottom: 6px;
  height: 4px;
  background: #F0B95C;
  border-radius: 2px;
}
.tab.is-focused {
  transform: scale(1.04);
  color: #3D2817;
}

/* ---- Body grid: LEFT podium / RIGHT list ---- */
.body-grid {
  flex: 1 1 auto;
  display: grid;
  grid-template-columns: 380px 1fr;
  gap: var(--sp-5);
  padding: 12px var(--sp-7) 12px;
  min-height: 0;
  overflow: hidden;
}

/* ---- LEFT: podium-side ---- */
.podium-side {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 8px 0 12px;
  background: rgba(255, 250, 232, 0.45);
  border-radius: 18px;
  min-height: 0;
}
.podium-heading {
  margin: 0;
  font-family: var(--ff-display);
  font-size: 18px;
  font-weight: 700;
  color: #6F4A20;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.podium-stage {
  position: relative;
  width: 100%;
  flex: 1 1 auto;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  min-height: 0;
}
.podium-img {
  position: absolute;
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
  /*
   * Larger podium so the three steps read clearly and the figure
   * cells (above) align with each step's visible center.
   */
  height: 260px;
  width: 260px;
  object-fit: contain;
  pointer-events: none;
  user-select: none;
}
.podium-figures {
  position: relative;
  /* Width tied to the visible podium step span. The deco_podium asset
     is square (1024×1024) but the actual three steps occupy roughly
     the middle 80% horizontally, so 220 px keeps each figure centered
     above its own step. */
  width: 220px;
  height: 100%;
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  align-items: end;
  z-index: 1;
  box-sizing: border-box;
}
.podium-figure {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  font-family: var(--ff-display);
  color: #3D2817;
  /* Each grid cell is ~110 px wide; tying figure width to 100% with
     min-width:0 lets the label honor text-overflow:ellipsis without
     spilling past the cell into neighbors. */
  width: 100%;
  min-width: 0;
  overflow: hidden;
}
/*
 * Figure stack order 2 / 1 / 3 puts #1 in the visual middle. Each
 * padding-bottom raises the avatar above its own podium step.
 */
.podium-figure--1 { order: 2; padding-bottom: 200px; }
.podium-figure--2 { order: 1; padding-bottom: 150px; }
.podium-figure--3 { order: 3; padding-bottom: 116px; }
.podium-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  object-fit: cover;
  border: 3px solid #FFF6DC;
  background: #FFF6DC;
  filter: drop-shadow(0 3px 6px rgba(120, 80, 30, 0.3));
}
.podium-figure--1 .podium-avatar {
  width: 70px;
  height: 70px;
  border-color: #F0B95C;
}
.podium-label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  /* Cap to roughly one grid cell (220 / 3 ≈ 73 px). Slightly wider
     than the cell so 8-letter family names ("Forest Family") still
     fit visually with ellipsis only on the longest. */
  width: 80px;
  max-width: 100%;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: 0.01em;
}

/* ---- RIGHT: list-side ---- */
.list-side {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 0 4px 12px 0;
  scrollbar-width: none;
  -ms-overflow-style: none;
  min-height: 0;
}
.list-side::-webkit-scrollbar { display: none; }
.rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/*
 * Generic row — flex row with gaps.
 *   .writers-row → 56 px tall (avatar + name + stars)
 *   .story-row   → 76 px tall (cover thumb + meta)
 *
 * Tighter than the previous full-width design because the list now
 * shares its half of the screen with the podium-side.
 */
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 18px;
  background: rgba(255, 250, 232, 0.85);
  border-radius: 14px;
  cursor: pointer;
  transition: transform 120ms ease-out, background 200ms ease-out;
}
.writers-row { height: 56px; }
.story-row   { height: 76px; }
.row.is-self      { background: #FFE9B2; }
.row.is-focused   { transform: scale(1.02); background: #FFE0A6; }

.rank {
  font-family: var(--ff-display);
  font-size: 18px;
  font-weight: 600;
  color: #6F4A20;
  min-width: 40px;
}
.rank.rank-top { color: #C77B00; font-weight: 800; }

.row-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid #FFF6DC;
  background: #FFF6DC;
}

.nickname {
  flex: 1 1 auto;
  font-family: var(--ff-display);
  font-size: 18px;
  font-weight: 600;
  color: #3D2817;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.stars {
  font-family: var(--ff-display);
  font-size: 18px;
  font-weight: 700;
  color: #C77B00;
}
.stars-suffix {
  font-size: 13px;
  font-weight: 500;
  color: #6F4A20;
  letter-spacing: 0.04em;
}

/* ---- Story-row (weekly_hot / editor_picks) ---- */
.cover {
  width: 52px;
  height: 52px;
  border-radius: 10px;
  object-fit: cover;
}
.story-meta {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.story-title {
  font-family: var(--ff-display);
  font-size: 18px;
  font-weight: 600;
  color: #3D2817;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.story-sub {
  font-family: var(--ff-display);
  font-size: 14px;
  font-weight: 500;
  color: #7A5A3A;
}
.weekly-plays {
  font-family: var(--ff-display);
  font-size: 14px;
  font-weight: 700;
  color: #C77B00;
}
/*
 * Editor pick badge — 建议人工补图: ui_badge_editor_pick.
 * Until then we render an inline gradient pill that says "精选" / "Pick".
 */
.pick-badge {
  font-family: var(--ff-display);
  font-size: 18px;
  font-weight: 800;
  color: #3D2817;
  padding: 6px 14px;
  border-radius: 999px;
  background: linear-gradient(135deg, #F0B95C 0%, #E89A2C 100%);
  letter-spacing: 0.06em;
}

/* ---- Empty state ---- */
.loading { color: #4A2A11; margin: auto; opacity: 0.85; }
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  margin: auto;
  padding: 32px 0;
}
.empty-bear {
  width: 200px;
  height: 200px;
  object-fit: contain;
  opacity: 0.95;
}
.empty-title {
  color: #4A2A11;
  font-weight: 700;
  text-align: center;
}
.empty-cta {
  appearance: none;
  background: #F0B95C;
  color: #3D2817;
  border: 0;
  padding: 14px 32px;
  border-radius: 16px;
  font-family: var(--ff-display);
  font-size: 24px;
  font-weight: 800;
  cursor: pointer;
  transition: transform 120ms ease-out;
}
.empty-cta.is-focused {
  transform: scale(1.06);
  background: #FFC85F;
}

/* ---- Self bar (Writers tab only) ---- */
.self-bar {
  flex: 0 0 76px;
  background: rgba(255, 248, 231, 0.92);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--sp-7);
  border-top: 2px solid rgba(240, 185, 92, 0.35);
}
.self-text {
  margin: 0;
  color: #3D2817;
  font-family: var(--ff-display);
  font-weight: 600;
  font-size: 18px;
}
.self-cta {
  appearance: none;
  background: rgba(240, 185, 92, 0.25);
  border: 2px solid #F0B95C;
  color: #3D2817;
  padding: 12px 28px;
  border-radius: 14px;
  font-family: var(--ff-display);
  font-size: 22px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 120ms ease-out, background 120ms ease-out;
}
.self-cta.is-focused {
  transform: scale(1.06);
  background: #F0B95C;
}
</style>
