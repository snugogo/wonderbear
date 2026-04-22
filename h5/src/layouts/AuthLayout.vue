<template>
  <div class="auth-layout">
    <header class="auth-header">
      <BrandLogo size="md" />
      <LangSwitch />
    </header>

    <main class="auth-main">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
import LangSwitch from '@/components/LangSwitch.vue';
import BrandLogo from '@/components/BrandLogo.vue';
</script>

<style scoped>
.auth-layout {
  min-height: 100vh;
  padding: 16px;
  padding-top: calc(16px + env(safe-area-inset-top, 0));
  background: linear-gradient(180deg, #FFF8F0 0%, #FFD9B8 100%);
}
.auth-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}
.auth-main {
  padding-top: 8px;
}
</style>
