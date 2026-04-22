<template>
  <div class="page wb-page">
    <van-nav-bar :title="t('stories.title')" left-arrow @click-left="router.back()" />

    <!-- 排序 -->
    <div v-if="!loading && stories.length > 0" class="sort-bar">
      <div
        v-for="opt in SORT_OPTIONS"
        :key="opt.value"
        class="sort-chip"
        :class="{ active: sort === opt.value }"
        @click="onSortChange(opt.value)"
      >
        {{ t(opt.label) }}
      </div>
    </div>

    <div v-if="loading" class="loading">
      <van-loading color="var(--wb-primary)" />
    </div>

    <EmptyState
      v-else-if="stories.length === 0"
      asset="h5.emptyStories"
      :title="t('stories.empty')"
      :desc="t('stories.emptyDesc')"
      fallback-emoji="📖"
    />

    <div v-else class="list">
      <div
        v-for="s in stories"
        :key="s.id"
        class="card"
        @click="router.push({ name: 'StoryDetail', params: { id: s.id } })"
      >
        <div class="cover" :class="{ broken: coverBroken[s.id] }">
          <img
            v-if="!coverBroken[s.id]"
            :src="s.coverUrl"
            :alt="s.title"
            @error="coverBroken[s.id] = true"
          />
          <span v-else class="cover-fallback">📖</span>
        </div>
        <div class="info">
          <div class="title">{{ s.title }}</div>
          <div class="sub">
            <span>{{ relativeTime(s.createdAt) }}</span>
            <span class="dot">·</span>
            <span>{{ t('stories.plays', { n: s.playCount }) }}</span>
          </div>
        </div>
        <van-icon
          v-if="s.favorited"
          name="like"
          color="var(--wb-danger)"
          size="20"
          class="fav-icon"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { showToast } from 'vant';
import { storyApi } from '@/api/story';
import { useApiError } from '@/composables/useApiError';
import { relativeTime } from '@/utils/time';
import type { StorySummary } from '@/types';
import EmptyState from '@/components/EmptyState.vue';

const { t } = useI18n();
const router = useRouter();
const { format: fmtErr } = useApiError();

const SORT_OPTIONS = [
  { value: 'newest' as const, label: 'stories.sortNewest' },
  { value: 'most_played' as const, label: 'stories.sortMostPlayed' },
  { value: 'favorited' as const, label: 'stories.sortFavorited' },
];

const sort = ref<'newest' | 'most_played' | 'favorited'>('newest');
const stories = ref<StorySummary[]>([]);
const loading = ref(true);
const coverBroken = reactive<Record<string, boolean>>({});

async function load() {
  loading.value = true;
  try {
    const { items } = await storyApi.list({ sort: sort.value, limit: 20 });
    stories.value = items;
  } catch (e) {
    showToast(fmtErr(e));
  } finally {
    loading.value = false;
  }
}

function onSortChange(s: typeof sort.value) {
  if (sort.value === s) return;
  sort.value = s;
  load();
}

onMounted(load);
</script>

<style scoped>
.page { background: var(--wb-bg); min-height: 100vh; padding: 0 0 24px; }
:deep(.van-nav-bar) { background: var(--wb-bg); }
:deep(.van-nav-bar__title) { color: var(--wb-text); font-weight: 600; }
.loading { display: flex; justify-content: center; padding: 80px 0; }

.sort-bar {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  overflow-x: auto;
}
.sort-chip {
  padding: 6px 14px;
  background: var(--wb-card);
  border: 1px solid var(--wb-border);
  border-radius: 999px;
  font-size: 13px;
  color: var(--wb-text-sub);
  white-space: nowrap;
  cursor: pointer;
}
.sort-chip.active {
  background: var(--wb-primary);
  border-color: var(--wb-primary);
  color: #fff;
  font-weight: 600;
}

.list {
  padding: 0 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.card {
  display: flex;
  gap: 12px;
  background: var(--wb-card);
  border-radius: 14px;
  padding: 12px;
  cursor: pointer;
  transition: transform 0.12s;
  position: relative;
}
.card:active {
  transform: scale(0.98);
}
.cover {
  width: 80px;
  height: 60px;
  flex-shrink: 0;
  border-radius: 8px;
  overflow: hidden;
  background: var(--wb-primary-light);
  display: flex;
  align-items: center;
  justify-content: center;
}
.cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.cover-fallback { font-size: 32px; }
.info {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
}
.title {
  font-size: 15px;
  font-weight: 600;
  color: var(--wb-text);
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sub {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--wb-text-sub);
}
.dot { color: var(--wb-text-sub); }
.fav-icon {
  align-self: center;
  margin-left: 4px;
}
</style>
