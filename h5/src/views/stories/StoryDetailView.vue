<template>
  <div class="page wb-page">
    <van-nav-bar :title="t('stories.detailTitle')" left-arrow @click-left="router.back()">
      <template #right v-if="story">
        <van-icon
          :name="story.favorited ? 'like' : 'like-o'"
          :color="story.favorited ? 'var(--wb-danger)' : 'var(--wb-text)'"
          size="22"
          @click="onToggleFav"
          style="margin-right: 12px"
        />
        <van-icon name="delete-o" color="var(--wb-text)" size="22" @click="onDelete" />
      </template>
    </van-nav-bar>

    <div v-if="loading" class="loading">
      <van-loading color="var(--wb-primary)" />
    </div>

    <div v-else-if="story" class="content">
      <!-- 封面 -->
      <div class="cover" :class="{ broken: coverBroken }">
        <img
          v-if="!coverBroken"
          :src="story.coverUrl"
          :alt="story.title"
          @error="coverBroken = true"
        />
        <span v-else class="cover-fallback" aria-hidden="true" />
        <div class="cover-mask">
          <h2 class="title">{{ story.title }}</h2>
          <p v-if="story.titleLearning" class="title-sub">{{ story.titleLearning }}</p>
        </div>
      </div>

      <!-- 故事梗概(三要素:主角 · 场景 · 冲突) -->
      <div v-if="summaryLine" class="summary">
        <div class="summary-label">{{ t('stories.summary') }}</div>
        <div class="summary-text">{{ summaryLine }}</div>
      </div>

      <!-- 12 页 swipe -->
      <div class="pages">
        <van-swipe
          :autoplay="0"
          indicator-color="var(--wb-primary)"
          :show-indicators="true"
          :loop="false"
        >
          <van-swipe-item v-for="p in story.pages" :key="p.pageNum">
            <div class="page-card">
              <div class="page-num">{{ t('stories.page', { n: p.pageNum }) }}</div>
              <div class="page-img" :class="{ broken: pageBroken[p.pageNum] }">
                <img
                  v-if="!pageBroken[p.pageNum]"
                  :src="p.imageUrl"
                  :alt="`Page ${p.pageNum}`"
                  @error="pageBroken[p.pageNum] = true"
                />
                <span v-else class="page-img-fallback" aria-hidden="true" />
              </div>
              <p class="page-text">{{ p.text }}</p>
              <p v-if="p.textLearning" class="page-text-learning">{{ p.textLearning }}</p>
            </div>
          </van-swipe-item>
        </van-swipe>
      </div>

      <!-- PDF 导出按钮 -->
      <van-button
        type="primary"
        block
        round
        @click="router.push({ name: 'StoryPdf', params: { id: story.id } })"
        class="pdf-btn"
      >
        <van-icon name="down" /> {{ t('stories.exportPdf') }}
      </van-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { showDialog, showSuccessToast, showToast } from 'vant';
import { storyApi } from '@/api/story';
import { useApiError } from '@/composables/useApiError';
import type { Story } from '@/types';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const { format: fmtErr } = useApiError();

const story = ref<Story | null>(null);
const loading = ref(true);
const coverBroken = ref(false);
const pageBroken = reactive<Record<number, boolean>>({});

/**
 * 对话摘要 → 一行展示("主角 · 场景 · 冲突")
 * mock / 服务端任一字段缺失都兜底跳过,`null` 时整行不渲染。
 */
const summaryLine = computed<string | null>(() => {
  const s = story.value?.dialogue?.summary;
  if (!s) return null;
  const parts = [s.mainCharacter, s.scene, s.conflict].filter((x) => !!x?.trim());
  return parts.length > 0 ? parts.join(' · ') : null;
});

async function load() {
  const id = route.params.id as string;
  loading.value = true;
  try {
    const { story: s } = await storyApi.get(id);
    story.value = s;
  } catch (e) {
    showToast(fmtErr(e));
    backToList();
  } finally {
    loading.value = false;
  }
}

/**
 * 返回列表页(避免"/stories → /stories/:id → replace(/stories)"造成
 * history 里连续两条 /stories,用户点返回像卡住的现象)。
 */
function backToList() {
  const hasBack = !!(router.options.history.state as { back?: unknown } | null)?.back;
  if (hasBack) router.back();
  else router.replace({ name: 'Stories' });
}

async function onToggleFav() {
  if (!story.value) return;
  const next = !story.value.favorited;
  try {
    await storyApi.favorite(story.value.id, next);
    story.value.favorited = next;
  } catch (e) {
    showToast(fmtErr(e));
  }
}

async function onDelete() {
  if (!story.value) return;
  try {
    await showDialog({
      title: t('stories.deleteTitle'),
      message: t('stories.deleteDesc'),
      confirmButtonText: t('children.delete'),
      cancelButtonText: t('common.cancel'),
      showCancelButton: true,
      confirmButtonColor: 'var(--wb-danger)',
    });
  } catch {
    return;
  }
  try {
    await storyApi.remove(story.value.id);
    showSuccessToast(t('stories.deleteSuccess'));
    backToList();
  } catch (e) {
    showToast(fmtErr(e));
  }
}

onMounted(load);
</script>

<style scoped>
.page { background: var(--wb-bg); min-height: 100vh; padding: 0 0 24px; }
:deep(.van-nav-bar) { background: var(--wb-bg); }
:deep(.van-nav-bar__title) { color: var(--wb-text); font-weight: 600; }
.loading { display: flex; justify-content: center; padding: 80px 0; }
.content { padding: 0 16px; }

/* 封面 */
.cover {
  position: relative;
  width: 100%;
  height: 200px;
  border-radius: 16px;
  overflow: hidden;
  background: var(--wb-primary-light);
  margin-bottom: 16px;
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
.cover-mask {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 16px;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.7));
  color: #fff;
}
.title {
  margin: 0 0 4px;
  font-size: 20px;
  font-weight: 700;
}
.title-sub {
  margin: 0;
  font-size: 13px;
  opacity: 0.85;
  font-style: italic;
}

/* 翻页 */
.pages {
  margin-bottom: 24px;
}
:deep(.van-swipe) {
  border-radius: 16px;
  overflow: hidden;
  background: var(--wb-card);
}
.page-card {
  padding: 16px;
  min-height: 320px;
  display: flex;
  flex-direction: column;
}
.page-num {
  text-align: center;
  font-size: 12px;
  color: var(--wb-text-sub);
  margin-bottom: 8px;
  font-weight: 600;
}
.page-img {
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 10px;
  overflow: hidden;
  background: var(--wb-primary-light);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
}
.page-img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.page-img-fallback {
  display: block;
  width: 100%;
  height: 100%;
  background:
    linear-gradient(135deg, var(--wb-primary-light), var(--wb-primary) 140%);
}
.page-text {
  margin: 0 0 6px;
  font-size: 15px;
  line-height: 1.6;
  color: var(--wb-text);
}
.page-text-learning {
  margin: 0;
  font-size: 13px;
  color: var(--wb-text-sub);
  font-style: italic;
  line-height: 1.5;
}

.pdf-btn {
  height: 48px;
  font-size: 15px;
  font-weight: 600;
}

/* 故事梗概 */
.summary {
  background: var(--wb-card);
  border-radius: 12px;
  padding: 12px 14px;
  margin-bottom: 16px;
}
.summary-label {
  font-size: 12px;
  color: var(--wb-text-sub);
  margin-bottom: 4px;
  font-weight: 600;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}
.summary-text {
  font-size: 14px;
  color: var(--wb-text);
  line-height: 1.5;
}
</style>
