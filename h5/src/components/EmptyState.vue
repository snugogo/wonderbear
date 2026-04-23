<template>
  <div class="empty-state">
    <img
      v-if="!broken"
      :src="imgSrc"
      :alt="title || 'empty'"
      class="illust"
      @error="onImgError"
    />
    <div v-else class="illust-fallback" aria-hidden="true" />

    <h3 v-if="title" class="title">{{ title }}</h3>
    <p v-if="desc" class="desc">{{ desc }}</p>

    <div v-if="$slots.action" class="action">
      <slot name="action" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { asset } from '@/config/assets';

interface Props {
  /** 素材 key,如 'h5.emptyChildren' 或 'bear.confused' */
  asset?: string;
  /** 次级兜底图 key,首图挂了先试这张(例如 bear.confused) */
  fallbackAsset?: string;
  title?: string;
  desc?: string;
}

const props = withDefaults(defineProps<Props>(), {
  asset: '',
  fallbackAsset: 'bear.confused',
});

const broken = ref(false);
const triedFallback = ref(false);
const imgSrc = computed(() => {
  if (broken.value) return '';
  if (triedFallback.value && props.fallbackAsset) return asset(props.fallbackAsset);
  return props.asset ? asset(props.asset) : '';
});

function onImgError() {
  // 首图挂了 → 尝试 fallbackAsset(如 bear_confused.webp)
  // 再挂 → 让 CSS 画纯色圆占位,不用 emoji
  if (!triedFallback.value && props.fallbackAsset && props.fallbackAsset !== props.asset) {
    triedFallback.value = true;
  } else {
    broken.value = true;
  }
}
</script>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px 24px;
  text-align: center;
}
.illust {
  width: 160px;
  height: 160px;
  object-fit: contain;
  margin-bottom: 16px;
}
.illust-fallback {
  width: 140px;
  height: 140px;
  border-radius: 50%;
  background: var(--wb-primary-light);
  margin-bottom: 16px;
  opacity: 0.55;
}
.title {
  font-size: 18px;
  font-weight: 600;
  color: var(--wb-text);
  margin: 0 0 8px;
}
.desc {
  font-size: 14px;
  color: var(--wb-text-sub);
  margin: 0 0 16px;
  line-height: 1.5;
}
.action {
  margin-top: 8px;
}
</style>
