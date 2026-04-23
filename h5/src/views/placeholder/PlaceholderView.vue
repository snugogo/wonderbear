<template>
  <div class="placeholder wb-page">
    <van-nav-bar
      :title="title"
      left-arrow
      @click-left="onBack"
    />

    <EmptyState
      :asset="emptyAsset"
      :fallback-asset="fallbackAsset"
      :title="t('placeholder.comingSoon')"
      :desc="t('placeholder.desc')"
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
 * 按 meta.placeholderKey 选合适的插画 + 备选
 * 全部走图,绝不降级到 emoji(EmptyState 组件内部最终兜底为 CSS 圆)
 */
const MAP: Record<string, { asset: string; fallback: string }> = {
  children: { asset: 'h5.emptyChildren', fallback: 'bear.emptyBox' },
  subscribe: { asset: 'h5.paymentStripe', fallback: 'bear.idle' },
  subscribeSuccess: { asset: 'h5.successSubscribed', fallback: 'bear.cheer' },
  stories: { asset: 'h5.emptyStories', fallback: 'bear.read' },
  pdf: { asset: 'h5.pdfReady', fallback: 'bear.happy' },
  devices: { asset: 'h5.scanQrGuide', fallback: 'bear.qrPeek' },
  settings: { asset: 'bear.idle', fallback: 'bear.welcome' },
  history: { asset: 'h5.emptyStories', fallback: 'bear.read' },
  help: { asset: 'bear.confused', fallback: 'bear.idle' },
};

const emptyAsset = computed(() => {
  const key = route.meta.placeholderKey as string | undefined;
  return key ? MAP[key]?.asset : undefined;
});
const fallbackAsset = computed(() => {
  const key = route.meta.placeholderKey as string | undefined;
  return (key && MAP[key]?.fallback) || 'bear.confused';
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
