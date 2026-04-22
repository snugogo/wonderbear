<template>
  <div class="avatar-picker">
    <!-- 当前选中大图 -->
    <div class="current">
      <img
        v-if="!currentBroken"
        :src="currentSrc"
        :alt="modelValue"
        class="current-img"
        @error="currentBroken = true"
      />
      <span v-else class="current-fallback">🧸</span>
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
import { computed, ref, watch } from 'vue';
import { avatarUrl, PRESET_AVATARS } from '@/config/assets';
import AvatarImage from './AvatarImage.vue';

interface Props {
  /** 当前选中头像 stem,如 'avatar_bear_classic' */
  modelValue: string;
}
const props = defineProps<Props>();
defineEmits<(e: 'update:modelValue', stem: string) => void>();

const currentBroken = ref(false);
const currentSrc = computed(() => avatarUrl(props.modelValue));

// 切换时重置 broken 状态,让新选的头像也能触发 error 事件
watch(
  () => props.modelValue,
  () => {
    currentBroken.value = false;
  }
);
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
.current-img {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  object-fit: cover;
  border: 4px solid var(--wb-primary);
  background: var(--wb-primary-light);
}
.current-fallback {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  background: var(--wb-primary-light);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 56px;
  border: 4px solid var(--wb-primary);
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
