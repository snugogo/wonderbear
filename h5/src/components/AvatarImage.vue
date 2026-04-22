<template>
  <span class="avatar-img" :style="boxStyle">
    <img
      v-if="!broken"
      :src="src"
      :alt="stem"
      @error="broken = true"
      class="img"
    />
    <span v-else class="fallback" :style="{ fontSize: `${size * 0.65}px` }">{{ emoji }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { avatarUrl } from '@/config/assets';

interface Props {
  /** 头像 stem,如 'avatar_cat' */
  stem: string;
  /** 显示尺寸(px) */
  size?: number;
}
const props = withDefaults(defineProps<Props>(), { size: 64 });

const broken = ref(false);
const src = computed(() => avatarUrl(props.stem));

/** 按 stem 选合适的 emoji 兜底 */
const emoji = computed(() => {
  const s = props.stem;
  if (s.includes('cat')) return '🐱';
  if (s.includes('dog')) return '🐶';
  if (s.includes('rabbit')) return '🐰';
  if (s.includes('fox')) return '🦊';
  if (s.includes('owl')) return '🦉';
  return '🧸';
});

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
.fallback {
  line-height: 1;
}
</style>
