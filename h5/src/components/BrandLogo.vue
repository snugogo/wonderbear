<template>
  <div class="brand-logo" :class="[size]">
    <img
      :src="imgSrc"
      alt="WonderBear"
      class="bear"
      @error="onErr"
    />
    <span v-if="showText" class="text">WonderBear</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { asset } from '@/config/assets';

interface Props {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  /** 可指定不同小熊姿态,默认 idle */
  pose?: 'idle' | 'welcome' | 'wave' | 'happy';
}
const props = withDefaults(defineProps<Props>(), {
  size: 'md',
  showText: true,
  pose: 'idle',
});

const imgSrc = computed(() => asset(`bear.${props.pose}`));

// 任意姿态失败则退回主图(app_icon_master.webp),绝不出 emoji
function onErr(e: Event) {
  const img = e.target as HTMLImageElement;
  if (!img.dataset.fallback) {
    img.dataset.fallback = '1';
    img.src = '/assets/icon/app_icon_master.webp';
  } else {
    img.style.visibility = 'hidden';
  }
}
</script>

<style scoped>
.brand-logo {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.bear {
  object-fit: contain;
}
.text {
  font-weight: 700;
  color: var(--wb-text);
  letter-spacing: 0.2px;
}

.sm .bear { width: 24px; height: 24px; }
.sm .text { font-size: 14px; }

.md .bear { width: 32px; height: 32px; }
.md .text { font-size: 20px; }

.lg .bear { width: 64px; height: 64px; }
.lg .text { font-size: 24px; }
</style>
