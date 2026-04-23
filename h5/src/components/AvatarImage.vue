<template>
  <span class="avatar-img" :style="boxStyle">
    <img
      :src="src"
      :alt="stem || 'avatar'"
      class="img"
      @error="onImgError"
    />
  </span>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { avatarUrl, DEFAULT_AVATAR_STEM } from '@/config/assets';

interface Props {
  /** 头像 stem,如 'avatar_cat' */
  stem?: string | null;
  /** 显示尺寸(px) */
  size?: number;
}
const props = withDefaults(defineProps<Props>(), { size: 64, stem: '' });

const triedFallback = ref(false);
const src = ref(avatarUrl(props.stem));

watch(
  () => props.stem,
  (next) => {
    triedFallback.value = false;
    src.value = avatarUrl(next);
  }
);

function onImgError(e: Event) {
  // 单次降级到默认头像;再挂就让浏览器显示 alt 文字 + CSS 圆形兜底色
  if (!triedFallback.value) {
    triedFallback.value = true;
    src.value = avatarUrl(DEFAULT_AVATAR_STEM);
  } else {
    (e.target as HTMLImageElement).style.visibility = 'hidden';
  }
}

const boxStyle = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
}));
</script>

<style scoped>
.avatar-img {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  overflow: hidden;
  background: var(--wb-primary-light);
}
.img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
