<template>
  <div class="code-input">
    <input
      ref="inputRef"
      type="text"
      :value="modelValue"
      :maxlength="length"
      :inputmode="isAlpha ? 'text' : 'numeric'"
      :pattern="isAlpha ? '[A-Z0-9]*' : '[0-9]*'"
      autocomplete="one-time-code"
      class="code-native-input"
      :placeholder="placeholder"
      @input="onInput"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';

interface Props {
  modelValue: string;
  length?: number;
  /** 输入模式:numeric(纯数字)/ alphanumeric(字母+数字大写) */
  mode?: 'numeric' | 'alphanumeric';
  /** 进入页面后自动聚焦(移动端会自动弹原生数字键盘) */
  autoFocus?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  length: 6,
  mode: 'numeric',
  autoFocus: false,
});

const emit = defineEmits<{
  (e: 'update:modelValue', val: string): void;
  (e: 'complete', val: string): void;
}>();

const inputRef = ref<HTMLInputElement | null>(null);
const isAlpha = computed(() => props.mode === 'alphanumeric');

// N 位下划线占位(letter-spacing 让它看起来像 N 个格子)
const placeholder = computed(() => '-'.repeat(props.length));

function onInput(ev: Event) {
  const el = ev.target as HTMLInputElement;
  // alphanumeric: 保留 A-Z0-9,自动大写;numeric: 只保留 0-9
  const raw = isAlpha.value ? el.value.toUpperCase() : el.value;
  const filter = isAlpha.value ? /[^A-Z0-9]/g : /\D/g;
  const next = raw.replace(filter, '').slice(0, props.length);
  // 若有非法字符被剥掉 / 大写转换,回写 DOM 保持同步
  if (el.value !== next) el.value = next;
  emit('update:modelValue', next);
  if (next.length === props.length) emit('complete', next);
}

watch(
  () => props.autoFocus,
  (v) => {
    if (v && inputRef.value) inputRef.value.focus();
  }
);

onMounted(() => {
  if (props.autoFocus && inputRef.value) inputRef.value.focus();
});
</script>

<style scoped>
.code-input {
  width: 100%;
}
.code-native-input {
  width: 100%;
  height: 52px;
  box-sizing: border-box;
  padding: 0 12px;
  font-size: 24px;
  font-weight: 600;
  letter-spacing: 10px;
  text-align: center;
  background: var(--wb-card);
  border: 1px solid var(--wb-border);
  border-radius: 12px;
  color: var(--wb-text);
  outline: none;
  font-family: ui-monospace, 'SF Mono', Consolas, monospace;
  caret-color: var(--wb-primary);
  transition: border-color 0.15s, box-shadow 0.15s;
}
.code-native-input:focus {
  border-color: var(--wb-primary);
  box-shadow: 0 0 0 3px rgba(124, 92, 255, 0.2);
}
.code-native-input::placeholder {
  color: var(--wb-text-sub);
  opacity: 0.4;
  letter-spacing: 10px;
  font-weight: 400;
}
</style>
