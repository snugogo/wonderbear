<!--
  HintBar — bottom-edge remote-control hint strip.
  Non-interactive display-only; focus is handled by the global keyRouter.

  Usage:
    <HintBar :hints="[
      { keys: ['↑','↓'], label: t('hint.crossRow') },
      { keys: ['←','→'], label: t('hint.sameRow') },
      { keys: ['OK'],    label: t('hint.confirm') },
    ]" />
-->

<script setup lang="ts">
interface Hint {
  keys: string[];
  label: string;
}
defineProps<{ hints: Hint[] }>();
</script>

<template>
  <div class="hint-bar" aria-hidden="true">
    <div class="hint-track">
      <div v-for="(h, i) in hints" :key="i" class="hint-item">
        <span class="hint-keys">
          <kbd v-for="(k, j) in h.keys" :key="j" class="hint-key wb-text-outline-sm">{{ k }}</kbd>
        </span>
        <span class="hint-label wb-text-outline-sm">{{ h.label }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hint-bar {
  /*
   * 2026-04-24 iter4: 64 px L/R + 24 px bottom safe-area; TVs overscan
   * ~5% so the strip sits clear of the edge on every panel.
   */
  position: absolute;
  left: 0;
  right: 0;
  bottom: 24px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 64px;
  pointer-events: none;
  z-index: 2;
}
.hint-track {
  display: flex;
  align-items: center;
  gap: var(--sp-5);
  font-size: 20px;
  color: var(--c-cream);
  letter-spacing: 0.04em;
}
.hint-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.hint-keys {
  display: inline-flex;
  gap: 4px;
}
.hint-key {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
  padding: 0 7px;
  background: rgba(255, 245, 230, 0.2);
  border: 1px solid rgba(245, 158, 11, 0.45);
  color: var(--c-cream);
  border-radius: 5px;
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif;
  font-size: 18px;
  line-height: 1;
  font-weight: 700;
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.4);
}
.hint-label {
  color: var(--c-cream);
  font-weight: 600;
}
</style>
