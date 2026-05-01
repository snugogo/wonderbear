<!--
  GlobalBackButton — 右上角浮层 SVG 返回按钮 (WO-3.16 Part C).

  设计原则:
    - 仅鼠标 + 触屏可达,不集成焦点系统(useFocusable)。
    - 遥控器用户继续用物理 ESC 键(已有 setGlobalBackFallback 处理)。
    - 32×32 SVG 矢量图,半透明深底 + 白描边箭头,角落不抢戏。
    - touchstart + click 双绑,iPhone Safari 无 300ms 延迟。

  渲染由 App.vue 控制(基于 screen.current 白名单)。
-->

<script setup lang="ts">
import { useScreenStore } from '@/stores/screen';
import { useI18n } from 'vue-i18n';

const screen = useScreenStore();
const { t } = useI18n();

function handleBack(e: Event): void {
  e.preventDefault();
  e.stopPropagation();
  screen.back();
}
</script>

<template>
  <button
    type="button"
    class="global-back-button"
    :aria-label="t('common.back')"
    @click="handleBack"
    @touchstart.prevent="handleBack"
  >
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  </button>
</template>

<style scoped>
.global-back-button {
  /* WO-3.16.1: 从 fixed 改为 absolute,锚定到 .tv-stage 设计画布 (1280×720),
     避免在更宽的浏览器窗口里被推到黑边外。 */
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 9000; /* 高于一般内容,低于 dev-status-badge (9999) 和模态层 */

  width: 36px;
  height: 36px;
  padding: 0;
  border: 0;
  border-radius: 50%;

  /* WO-3.16.1: 透明度从 0.35 提升到 0.50,让米色羊皮纸背景上的按钮可见。 */
  background: rgba(0, 0, 0, 0.50);
  color: rgba(255, 255, 255, 0.9);

  display: flex;
  align-items: center;
  justify-content: center;

  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;

  transition:
    background 150ms ease-out,
    transform 80ms ease-out;
}

.global-back-button:hover {
  background: rgba(0, 0, 0, 0.65);
}

.global-back-button:active {
  transform: scale(0.92);
  background: rgba(0, 0, 0, 0.75);
}

.global-back-button svg {
  width: 18px;
  height: 18px;
  /* 不集成 focus,无 focus 样式 */
}

/* 显式禁用 focus outline — 这个按钮不应该被键盘/遥控器聚焦 */
.global-back-button:focus,
.global-back-button:focus-visible {
  outline: none;
}
</style>
