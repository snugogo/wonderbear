<template>
  <div class="page wb-page">
    <van-nav-bar :title="t('stories.title')" left-arrow @click-left="router.back()" />

    <!-- 过滤 / 排序 -->
    <div class="filter-bar">
      <div class="sort-bar">
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
      <div
        class="fav-toggle"
        :class="{ active: onlyFavorited }"
        @click="onToggleOnlyFavorited"
      >
        <van-icon :name="onlyFavorited ? 'like' : 'like-o'" size="16" />
        <span>{{ t('stories.onlyFavorited') }}</span>
      </div>
    </div>

    <!-- 首屏加载 -->
    <div v-if="firstLoading" class="loading">
      <van-loading color="var(--wb-primary)" />
    </div>

    <EmptyState
      v-else-if="stories.length === 0"
      asset="h5.emptyStories"
      fallback-asset="bear.read"
      :title="t('stories.empty')"
      :desc="t('stories.emptyDesc')"
    />

    <!-- 列表:van-list 下拉加载更多 -->
    <van-list
      v-else
      v-model:loading="loadingMore"
      :finished="finished"
      :finished-text="t('stories.noMore')"
      :loading-text="t('stories.loadingMore')"
      :immediate-check="false"
      @load="loadMore"
      class="list"
    >
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
          <span v-else class="cover-fallback" aria-hidden="true" />
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
    </van-list>
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

const PAGE_SIZE = 20;

const sort = ref<'newest' | 'most_played' | 'favorited'>('newest');
const onlyFavorited = ref(false);
const stories = ref<StorySummary[]>([]);
const cursor = ref<string | null>(null);
const firstLoading = ref(true); // 首屏占位,用于显示初始 spinner / EmptyState
const loadingMore = ref(false); // van-list 的 loading,用 v-model 驱动
const finished = ref(false);
const coverBroken = reactive<Record<string, boolean>>({});

/** 拉一页(首屏 or 下拉加载更多) */
async function fetchPage(isFirst: boolean) {
  try {
    const { items, nextCursor } = await storyApi.list({
      sort: sort.value,
      onlyFavorited: onlyFavorited.value || undefined,
      cursor: isFirst ? undefined : cursor.value ?? undefined,
      limit: PAGE_SIZE,
    });
    if (isFirst) {
      stories.value = items;
    } else {
      stories.value.push(...items);
    }
    cursor.value = nextCursor;
    if (nextCursor == null) finished.value = true;
  } catch (e) {
    showToast(fmtErr(e));
    // 失败时终止分页避免无限重试
    finished.value = true;
  }
}

async function firstLoad() {
  firstLoading.value = true;
  finished.value = false;
  cursor.value = null;
  await fetchPage(true);
  firstLoading.value = false;
}

/** van-list @load:组件会把 loadingMore 置 true,我们拉完置 false,van-list 再判断 finished */
async function loadMore() {
  if (finished.value) return;
  await fetchPage(false);
  loadingMore.value = false;
}

function resetAndReload() {
  stories.value = [];
  cursor.value = null;
  finished.value = false;
  loadingMore.value = false;
  firstLoad();
}

function onSortChange(s: typeof sort.value) {
  if (sort.value === s) return;
  sort.value = s;
  resetAndReload();
}

function onToggleOnlyFavorited() {
  onlyFavorited.value = !onlyFavorited.value;
  resetAndReload();
}

onMounted(firstLoad);
</script>

<style scoped>
.page { background: var(--wb-bg); min-height: 100vh; padding: 0 0 24px; }
:deep(.van-nav-bar) { background: var(--wb-bg); }
:deep(.van-nav-bar__title) { color: var(--wb-text); font-weight: 600; }
.loading { display: flex; justify-content: center; padding: 80px 0; }

.filter-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
}
.sort-bar {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  flex: 1;
  min-width: 0;
}
.sort-chip {
  padding: 6px 14px;
  background: var(--wb-card);
  border: 1px solid var(--wb-border);
  border-radius: 999px;
  font-size: 14px;
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
.fav-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background: var(--wb-card);
  border: 1px solid var(--wb-border);
  border-radius: 999px;
  font-size: 14px;
  color: var(--wb-text-sub);
  white-space: nowrap;
  cursor: pointer;
  flex-shrink: 0;
}
.fav-toggle.active {
  background: var(--wb-danger);
  border-color: var(--wb-danger);
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
.cover-fallback {
  display: block;
  width: 100%;
  height: 100%;
  background:
    linear-gradient(135deg, var(--wb-primary-light), var(--wb-primary) 140%);
}
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
