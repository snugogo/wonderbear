<!--
  LibraryScreen — list of generated stories for active child.
  PRD §4.5 + API_CONTRACT §7.7

  Server contract:
    GET /story/list?childId&sort=newest&limit=20 → { items: StorySummary[], nextCursor, total }
    OK on a card → fetch full Story via /story/:id → loadStory → screen.go('story-cover')

  Layout: 3 columns, scrollable. Empty state shows bear_empty_box.
-->

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useStoryStore } from '@/stores/story';
import { useScreenStore } from '@/stores/screen';
import { useChildStore } from '@/stores/child';
import { useBgmStore } from '@/stores/bgm';
import { useI18n } from 'vue-i18n';
import { bridge } from '@/services/bridge';
import { api, ApiError } from '@/services/api';
import type { StorySummary } from '@/services/api';
import type { FocusableNeighbors } from '@/services/focus';
import { ERR } from '@/utils/errorCodes';
import { asset } from '@/utils/assets';
import StoryCard from '@/components/StoryCard.vue';

const PAGE_SIZE = 20;
const COLUMNS = 3;

const storyStore = useStoryStore();
const screen = useScreenStore();
const child = useChildStore();
const bgm = useBgmStore();
const { t } = useI18n();

const items = ref<StorySummary[]>([]);
const loading = ref<boolean>(true);
const total = ref<number>(0);
let mounted = true;

const cards = computed(() =>
  items.value.map((item, idx) => {
    const neighbors: FocusableNeighbors = {
      up:    idx >= COLUMNS ? `library-card-${idx - COLUMNS}` : undefined,
      down:  idx + COLUMNS < items.value.length ? `library-card-${idx + COLUMNS}` : undefined,
      left:  idx % COLUMNS !== 0 ? `library-card-${idx - 1}` : undefined,
      right: (idx % COLUMNS !== COLUMNS - 1 && idx + 1 < items.value.length)
        ? `library-card-${idx + 1}`
        : undefined,
    };
    return { item, id: `library-card-${idx}`, autoFocus: idx === 0, neighbors };
  }),
);

async function loadList(): Promise<void> {
  loading.value = true;
  try {
    const { data } = await api.storyList({
      childId: child.activeChildId ?? undefined,
      sort: 'newest',
      limit: PAGE_SIZE,
    });
    items.value = data.items;
    total.value = data.total;
  } catch (e) {
    bridge.log('library', { event: 'list_failed', err: String(e) });
    if (e instanceof ApiError && e.code !== ERR.STORY_NOT_FOUND) {
      screen.goError(e.code);
      return;
    }
    items.value = [];
    total.value = 0;
  } finally {
    if (mounted) loading.value = false;
  }
}

async function openStory(storyId: string): Promise<void> {
  try {
    const { data } = await api.storyDetail(storyId);
    storyStore.loadStory(data.story);
    screen.go('story-cover');
  } catch (e) {
    const code = e instanceof ApiError ? e.code : ERR.STORY_NOT_READY;
    screen.goError(code);
  }
}

onMounted(() => {
  bgm.play('home');
  void loadList();
});

onBeforeUnmount(() => {
  mounted = false;
});
</script>

<template>
  <div class="library-screen">
    <!-- TV_TASKS v1.1 P0-1: bg_room watercolor backdrop. -->
    <img class="bg" :src="asset('bg/bg_room.webp')" alt="" aria-hidden="true" />

    <header class="topbar">
      <h1 class="title t-xl">{{ t('library.title') }}</h1>
      <div v-if="total > 0" class="capacity t-sm">
        {{ t('library.capacity', { used: total, max: 50 }) }}
      </div>
    </header>

    <main class="grid-wrap">
      <div v-if="loading" class="loading t-md">
        {{ t('common.loading') }}
      </div>

      <div v-else-if="items.length === 0" class="empty">
        <img class="empty-bear" :src="asset('bear/bear_empty_box.webp')" alt="">
        <p class="empty-text t-lg">{{ t('library.empty') }}</p>
      </div>

      <div v-else class="grid">
        <StoryCard
          v-for="card in cards"
          :key="card.id"
          :item="card.item"
          :id="card.id"
          :auto-focus="card.autoFocus"
          :neighbors="card.neighbors"
          @open="openStory"
        />
      </div>
    </main>
  </div>
</template>

<style scoped>
.library-screen {
  width: 100%;
  height: 100%;
  position: relative;
  background: var(--c-bg-canvas);
  display: flex;
  flex-direction: column;
  overflow: hidden;
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
.topbar, .grid-wrap { position: relative; z-index: 1; }

.topbar {
  flex: 0 0 auto;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--sp-6);
  /* WCAG AA contrast strip over watercolor bg. */
  background: linear-gradient(180deg,
    rgba(26, 15, 10, 0.65) 0%,
    rgba(26, 15, 10, 0.35) 70%,
    rgba(26, 15, 10, 0) 100%);
}
.title {
  color: var(--c-cream);
  font-weight: 700;
  margin: 0;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}
.capacity {
  color: var(--c-cream-soft);
  letter-spacing: 0.06em;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}

.grid-wrap {
  flex: 1 1 auto;
  padding: 0 var(--sp-6) var(--sp-5);
  overflow: hidden;
  display: flex;
  align-items: flex-start;
  justify-content: center;
}

.loading { color: var(--c-cream-soft); margin: auto; }

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-4);
  margin: auto;
}
.empty-bear {
  width: 200px;
  height: 200px;
  object-fit: contain;
  filter: drop-shadow(0 12px 24px rgba(0, 0, 0, 0.45));
  opacity: 0.85;
}
.empty-text {
  color: var(--c-cream-soft);
  text-align: center;
  max-width: 600px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--sp-4);
  width: 100%;
  max-height: 100%;
  overflow-y: auto;
  align-content: start;
}
</style>
