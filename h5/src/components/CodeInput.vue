<template>
  <div class="code-input">
    <van-password-input
      :value="modelValue"
      :length="length"
      :mask="false"
      :gutter="8"
      :focused="focused"
      @focus="focused = true"
    />
    <van-number-keyboard
      :show="focused"
      :maxlength="length"
      :value="modelValue"
      @input="onInput"
      @delete="onDelete"
      @blur="focused = false"
      safe-area-inset-bottom
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

interface Props {
  modelValue: string;
  length?: number;
  /** 外部要求聚焦(比如进入页面后自动弹出键盘) */
  autoFocus?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  length: 6,
  autoFocus: false,
});

const emit = defineEmits<{
  (e: 'update:modelValue', val: string): void;
  (e: 'complete', val: string): void;
}>();

const focused = ref(props.autoFocus);

watch(
  () => props.autoFocus,
  (v) => {
    focused.value = v;
  }
);

function onInput(key: string | number) {
  const v = String(key);
  const next = (props.modelValue + v).slice(0, props.length);
  emit('update:modelValue', next);
  if (next.length === props.length) {
    emit('complete', next);
    // 自动收起键盘
    focused.value = false;
  }
}

function onDelete() {
  emit('update:modelValue', props.modelValue.slice(0, -1));
}
</script>

<style scoped>
.code-input :deep(.van-password-input) {
  margin: 0;
}
</style>
