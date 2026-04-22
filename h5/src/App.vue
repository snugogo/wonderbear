<template>
  <router-view v-slot="{ Component, route }">
    <transition :name="route.meta.transition as string || 'fade'" mode="out-in">
      <component :is="Component" :key="route.fullPath" />
    </transition>
  </router-view>
</template>

<script setup lang="ts">
// 根组件只承载路由,不做多余事
</script>

<style>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
