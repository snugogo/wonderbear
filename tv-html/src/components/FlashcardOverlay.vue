<!--
  FlashcardOverlay — 暂停式词汇闪卡覆盖屏
  TV v1.0 §3.3.

  Not a routed screen — a modal overlay summoned by StoryBodyScreen
  when the user presses the "学习/闪卡" button while the story is paused.

  Layout:
    +----------------------------------------------+
    |  [bear corner]                               |
    |                                              |
    |                  moon                        |  60-80px primary
    |                                              |
    |                  月亮                         |  32-40px secondary
    |                                              |
    |        [optional 200×200 keyword image]      |
    |                                              |
    |     • night    夜晚                           |
    |     • forest   森林                            |
    |     • meet     遇见                            |
    |     • edge     边缘                            |
    |     • little   小                              |
    |                                              |
    |          按 OK 键继续播放                       |
    +----------------------------------------------+

  Behavior:
    - Auto-cycle: words[0] → words[1] → ... 1s/word, stops at last.
    - User Left/Right keys → manual prev/next, cancels auto-cycle.
    - OK key → emit('close', 'ok') so parent un-pauses.
    - Back key → emit('close', 'back').
    - 10s of no input → emit('close', 'timeout').

  Props:
    - vocabulary: per-page word list (PRD §3.3.6).
    - native-label / learning-label: ZH/EN names of each side.
-->

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import { asset } from '@/utils/assets';

interface VocabItem {
  learning: string;
  native: string;
  image_url?: string | null;
}

const props = defineProps<{
  /** Words to display on the flashcard. Empty array → empty state. */
  vocabulary: VocabItem[];
  /** Optional override of which side is "primary" — defaults to learning. */
  primarySide?: 'learning' | 'native';
}>();
const emit = defineEmits<{
  (e: 'close', reason: 'ok' | 'back' | 'timeout'): void;
}>();

const { t } = useI18n();
const idx = ref<number>(0);
const isManual = ref<boolean>(false);   // true once user used Left/Right
let autoTimer: number | null = null;
let idleTimer: number | null = null;

const current = computed<VocabItem | null>(() => props.vocabulary[idx.value] ?? null);

/*
 * Auto-cycle: advance one word per 1 s, stop at last. Cancelled when
 * the user takes manual control via Left/Right keys.
 */
function startAuto(): void {
  if (isManual.value) return;
  if (autoTimer !== null) return;
  autoTimer = window.setInterval(() => {
    if (idx.value < props.vocabulary.length - 1) {
      idx.value += 1;
    } else {
      stopAuto();
    }
  }, 1000);
}
function stopAuto(): void {
  if (autoTimer !== null) {
    window.clearInterval(autoTimer);
    autoTimer = null;
  }
}

/*
 * 10 s idle → auto-close (PRD §3.3.7). Reset on every keypress.
 */
function resetIdle(): void {
  if (idleTimer !== null) window.clearTimeout(idleTimer);
  idleTimer = window.setTimeout(() => {
    emit('close', 'timeout');
  }, 10_000);
}

function onKey(e: KeyboardEvent): void {
  resetIdle();
  switch (e.key) {
    case 'ArrowLeft':
      e.preventDefault();
      e.stopPropagation();
      isManual.value = true;
      stopAuto();
      if (idx.value > 0) idx.value -= 1;
      break;
    case 'ArrowRight':
      e.preventDefault();
      e.stopPropagation();
      isManual.value = true;
      stopAuto();
      if (idx.value < props.vocabulary.length - 1) idx.value += 1;
      break;
    case 'Enter':
    case ' ':
      e.preventDefault();
      e.stopPropagation();
      emit('close', 'ok');
      break;
    case 'Escape':
    case 'Backspace':
      e.preventDefault();
      e.stopPropagation();
      emit('close', 'back');
      break;
    default:
      break;
  }
}

onMounted(() => {
  // Capture-phase listener so the global focus router never intercepts.
  window.addEventListener('keydown', onKey, { capture: true });
  startAuto();
  resetIdle();
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey, { capture: true } as AddEventListenerOptions);
  stopAuto();
  if (idleTimer !== null) window.clearTimeout(idleTimer);
});

watch(idx, () => {
  // Idle timer keeps the overlay alive while the auto-cycle is firing.
  resetIdle();
});
</script>

<template>
  <div class="flashcard-overlay" role="dialog" aria-modal="true">
    <!--
      Corner bear — PRD wanted bear_flashcard_teach. CSV doesn't have
      that, so we reuse bear_pointing (already in TV). 建议人工补图.
    -->
    <img class="corner-bear" :src="asset('bear/bear_pointing.webp')" alt="" aria-hidden="true" />

    <main class="card">
      <template v-if="current">
        <!--
          Primary side (learning lang by default, e.g., English moon).
          Animated only via opacity to satisfy GP15.
        -->
        <Transition name="word" mode="out-in">
          <div :key="`p-${idx}`" class="primary">
            {{ primarySide === 'native' ? current.native : current.learning }}
          </div>
        </Transition>
        <Transition name="word" mode="out-in">
          <div :key="`s-${idx}`" class="secondary">
            {{ primarySide === 'native' ? current.learning : current.native }}
          </div>
        </Transition>

        <img
          v-if="current.image_url"
          class="keyword-img"
          :src="current.image_url"
          alt=""
        />

        <ul v-if="vocabulary.length > 1" class="vocab-list" aria-hidden="true">
          <li
            v-for="(v, i) in vocabulary"
            :key="`v-${i}`"
            class="vocab-row"
            :class="{ 'is-current': i === idx }"
          >
            <span class="vocab-l">{{ v.learning }}</span>
            <span class="vocab-n">{{ v.native }}</span>
          </li>
        </ul>
      </template>

      <p v-else class="empty">{{ t('flashcard.empty') }}</p>

      <div class="hint">{{ t('flashcard.continueHint') }}</div>
    </main>
  </div>
</template>

<style scoped>
/*
 * GP15: rgba flat fill (no backdrop-filter), opacity-only word transition,
 * static art for the corner bear. Always above all screen content.
 */
.flashcard-overlay {
  position: fixed;
  inset: 0;
  z-index: 9000;
  background: rgba(40, 30, 20, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 60px;
}

.corner-bear {
  position: absolute;
  left: 4%;
  top: 18%;
  width: 220px;
  height: 220px;
  object-fit: contain;
  opacity: 0.92;
  filter: drop-shadow(0 6px 14px rgba(0, 0, 0, 0.55));
  pointer-events: none;
}

.card {
  background: #FFF8E7;
  border-radius: 24px;
  padding: 56px 80px;
  min-width: 720px;
  max-width: 1280px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.primary {
  font-family:
    'Fredoka',
    'PingFang SC', 'Microsoft YaHei UI', 'Microsoft YaHei',
    'Source Han Sans CN', 'Noto Sans SC',
    -apple-system, 'Segoe UI', sans-serif;
  font-size: 80px;
  font-weight: 800;
  color: #3D2817;
  line-height: 1.1;
}
.secondary {
  font-family: inherit;
  font-size: 40px;
  font-weight: 500;
  color: #595959;
  line-height: 1.2;
}
.keyword-img {
  width: 200px;
  height: 200px;
  object-fit: cover;
  border-radius: 16px;
  margin-top: 12px;
}

.vocab-list {
  list-style: none;
  margin: 24px 0 0;
  padding: 16px 24px;
  background: rgba(255, 255, 255, 0.6);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  max-width: 720px;
}
.vocab-row {
  font-size: 24px;
  color: #3D2817;
  display: flex;
  align-items: baseline;
  gap: 24px;
  padding: 6px 0;
}
.vocab-row::before {
  content: '•';
  color: #F0B95C;
  font-weight: 800;
}
.vocab-l { font-weight: 700; min-width: 200px; }
.vocab-n { color: #595959; font-weight: 500; }
.vocab-row.is-current { color: #C77B00; font-weight: 700; }

.empty {
  font-size: 32px;
  color: #595959;
  margin: 24px 0;
}

.hint {
  margin-top: 24px;
  font-size: 22px;
  color: #595959;
  letter-spacing: 0.05em;
}

/* Word fade — opacity only, satisfies GP15. */
.word-enter-active, .word-leave-active {
  transition: opacity 200ms ease-out;
}
.word-enter-from, .word-leave-to { opacity: 0; }
.word-enter-to,   .word-leave-from { opacity: 1; }
</style>
