<template>
  <div class="empty-state">
    <img v-if="imgSrc" :src="imgSrc" :alt="title" class="illust" @error="onImgError" />
    <div v-else class="illust-fallback">{{ fallbackEmoji }}</div>

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
  title?: string;
  desc?: string;
  /** 图片加载失败时的 emoji 兜底 */
  fallbackEmoji?: string;
}

const props = withDefaults(defineProps<Props>(), {
  fallbackEmoji: '🐻',
});

const broken = ref(false);
const imgSrc = computed(() => (props.asset && !broken.value ? asset(props.asset) : ''));

function onImgError() {
  // 图片还没生成、或 CDN 暂时挂了都走 emoji 兜底
  broken.value = true;
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
  width: 160px;
  height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 72px;
  background: var(--wb-primary-light);
  border-radius: 50%;
  margin-bottom: 16px;
  opacity: 0.6;
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
