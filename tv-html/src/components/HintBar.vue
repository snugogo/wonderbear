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
          <kbd v-for="(k, j) in h.keys" :key="j" class="hint-key">{{ k }}</kbd>
        </span>
        <span class="hint-label">{{ h.label }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hint-bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 var(--sp-5);
  background: linear-gradient(
    0deg,
    rgba(26, 15, 10, 0.78) 0%,
    rgba(26, 15, 10, 0.55) 60%,
    rgba(26, 15, 10, 0) 100%
  );
  pointer-events: none;
  z-index: 2;
}
.hint-track {
  display: flex;
  align-items: center;
  gap: var(--sp-6);
  font-size: var(--fs-sm);
  color: var(--c-cream-soft);
  letter-spacing: 0.04em;
}
.hint-item {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
}
.hint-keys {
  display: inline-flex;
  gap: 4px;
}
.hint-key {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 34px;
  height: 32px;
  padding: 0 8px;
  background: rgba(255, 245, 230, 0.12);
  border: 1px solid rgba(255, 200, 87, 0.35);
  color: var(--c-cream);
  border-radius: 6px;
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif;
  font-size: 20px;
  line-height: 1;
  font-weight: 600;
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.35);
}
.hint-label {
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
}
</style>
