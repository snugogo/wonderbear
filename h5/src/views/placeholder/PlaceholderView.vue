<template>
  <div class="placeholder wb-page">
    <van-nav-bar
      :title="title"
      left-arrow
      @click-left="onBack"
    />

    <EmptyState
      :asset="emptyAsset"
      :title="t('placeholder.comingSoon')"
      :desc="t('placeholder.desc')"
      :fallback-emoji="emoji"
    >
      <template #action>
        <van-button type="primary" round size="small" @click="onHome">
          {{ t('placeholder.backHome') }}
        </van-button>
      </template>
    </EmptyState>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import EmptyState from '@/components/EmptyState.vue';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

const title = computed(() => (route.meta.title as string) || 'WonderBear');

/**
 * 按 meta.placeholderKey 选合适的插画和 emoji 兜底
 * key → (h5 插画 asset key, emoji)
 */
const MAP: Record<string, { asset: string; emoji: string }> = {
  children: { asset: 'h5.emptyChildren', emoji: '🧒' },
  subscribe: { asset: 'h5.paymentStripe', emoji: '💳' },
  subscribeSuccess: { asset: 'h5.successSubscribed', emoji: '🎉' },
  stories: { asset: 'h5.emptyStories', emoji: '📖' },
  pdf: { asset: 'h5.pdfReady', emoji: '📄' },
  devices: { asset: 'h5.scanQrGuide', emoji: '📱' },
  settings: { asset: 'bear.idle', emoji: '⚙️' },
  history: { asset: 'h5.emptyStories', emoji: '🕐' },
  help: { asset: 'bear.confused', emoji: '❓' },
};

const emptyAsset = computed(() => {
  const key = route.meta.placeholderKey as string | undefined;
  return key ? MAP[key]?.asset : undefined;
});
const emoji = computed(() => {
  const key = route.meta.placeholderKey as string | undefined;
  return key ? MAP[key]?.emoji || '🐻' : '🐻';
});

function onBack() {
  if (window.history.length > 1) router.back();
  else router.replace('/home');
}
function onHome() {
  router.replace('/home');
}
</script>

<style scoped>
.placeholder {
  padding: 0;
  background: var(--wb-bg);
}
:deep(.van-nav-bar) {
  background: var(--wb-bg);
}
:deep(.van-nav-bar__title) {
  color: var(--wb-text);
  font-weight: 600;
}
</style>
