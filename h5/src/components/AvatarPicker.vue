<template>
  <div class="avatar-picker">
    <!-- 当前选中大图:AvatarImage 组件统一兜底,避免 emoji -->
    <div class="current">
      <AvatarImage :stem="modelValue" :size="96" class="current-img-wrap" />
    </div>

    <!-- 预设网格 -->
    <div class="grid">
      <div
        v-for="item in PRESET_AVATARS"
        :key="item.key"
        class="grid-item"
        :class="{ active: item.stem === modelValue }"
        @click="$emit('update:modelValue', item.stem)"
      >
        <AvatarImage :stem="item.stem" :size="56" />
        <van-icon
          v-if="item.stem === modelValue"
          name="success"
          class="check"
          color="#fff"
          size="18"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { PRESET_AVATARS } from '@/config/assets';
import AvatarImage from './AvatarImage.vue';

interface Props {
  /** 当前选中头像 stem,如 'avatar_bear_classic' */
  modelValue: string;
}
defineProps<Props>();
defineEmits<(e: 'update:modelValue', stem: string) => void>();
</script>

<style scoped>
.avatar-picker {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.current {
  display: flex;
  justify-content: center;
  padding: 8px 0;
}
.current-img-wrap :deep(.avatar-img) {
  border: 4px solid var(--wb-primary);
  box-sizing: content-box;
}

.grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 10px;
}
.grid-item {
  position: relative;
  aspect-ratio: 1;
  border-radius: 50%;
  overflow: hidden;
  cursor: pointer;
  border: 2px solid transparent;
  transition: transform 0.12s, border-color 0.12s;
  background: var(--wb-primary-light);
}
.grid-item:active {
  transform: scale(0.92);
}
.grid-item.active {
  border-color: var(--wb-primary);
  box-shadow: 0 0 0 3px rgba(255, 138, 61, 0.2);
}
.check {
  position: absolute;
  right: 2px;
  bottom: 2px;
  background: var(--wb-primary);
  border-radius: 50%;
  padding: 2px;
}
</style>
