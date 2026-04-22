<template>
  <div class="brand-logo" :class="[size]">
    <img
      v-if="!broken"
      :src="imgSrc"
      alt="WonderBear"
      class="bear"
      @error="broken = true"
    />
    <span v-else class="bear-fallback">🧸</span>
    <span v-if="showText" class="text">WonderBear</span>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
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

const broken = ref(false);
const imgSrc = computed(() => asset(`bear.${props.pose}`));
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
.bear-fallback {
  display: inline-block;
  line-height: 1;
}
.text {
  font-weight: 700;
  color: var(--wb-text);
  letter-spacing: 0.2px;
}

.sm .bear,
.sm .bear-fallback { width: 24px; height: 24px; font-size: 24px; }
.sm .text { font-size: 14px; }

.md .bear,
.md .bear-fallback { width: 32px; height: 32px; font-size: 28px; }
.md .text { font-size: 20px; }

.lg .bear,
.lg .bear-fallback { width: 64px; height: 64px; font-size: 56px; }
.lg .text { font-size: 24px; }
</style>
