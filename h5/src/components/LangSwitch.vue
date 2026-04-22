<template>
  <div class="lang-switch">
    <van-button plain size="small" round @click="show = true">
      {{ currentFlag }} {{ currentLabel }}
    </van-button>
    <van-popup v-model:show="show" position="bottom" round :style="{ padding: '16px' }">
      <div class="lang-list">
        <div
          v-for="l in SUPPORTED_LOCALES"
          :key="l.value"
          class="lang-item"
          :class="{ active: l.value === localeStore.current }"
          @click="pick(l.value)"
        >
          <span class="flag">{{ l.flag }}</span>
          <span class="label">{{ l.label }}</span>
          <van-icon v-if="l.value === localeStore.current" name="success" color="var(--wb-primary)" />
        </div>
      </div>
    </van-popup>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { SUPPORTED_LOCALES } from '@/config';
import { useLocaleStore } from '@/stores/locale';
import type { Locale } from '@/types';

const localeStore = useLocaleStore();
const show = ref(false);

const currentFlag = computed(
  () => SUPPORTED_LOCALES.find((l) => l.value === localeStore.current)?.flag || '🌐'
);
const currentLabel = computed(
  () => SUPPORTED_LOCALES.find((l) => l.value === localeStore.current)?.label || ''
);

async function pick(l: Locale) {
  await localeStore.change(l);
  show.value = false;
}
</script>

<style scoped>
.lang-switch {
  display: inline-block;
}
.lang-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 0 16px;
}
.lang-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 12px;
  border-radius: 12px;
  font-size: 16px;
  color: var(--wb-text);
  cursor: pointer;
  transition: background 0.15s;
}
.lang-item:active {
  background: var(--wb-primary-light);
}
.lang-item.active {
  background: var(--wb-primary-light);
  font-weight: 600;
}
.lang-item .flag {
  font-size: 22px;
}
.lang-item .label {
  flex: 1;
}
</style>
