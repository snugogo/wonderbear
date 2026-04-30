<!--
  StoryPreviewScreen — v7.2 §1.4
  After dialogue done=true, before generating. Shows the 3-5 paragraph
  storyOutline produced by the dialogue LLM so the child sees their story
  laid out and feels like a creator. Press OK → /dialogue/:id/confirm
  → screen.go('generating').

  Server contract: API_CONTRACT.md §7.3 / §7.3b
    - dialogue.storyOutline.paragraphs is set by DialogueScreen.applyTurn
      after a `done=true` turn.
    - api.dialogueConfirm(dialogueId) starts the same generation pipeline
      as /story/generate but takes the outline directly from the Redis
      session — no need to re-pass dialogueId/childId.

  Focus:
    - confirm-button is the only focusable; auto-focus on mount.
  Hardware:
    - OK key on the button → confirm + go('generating')
    - Back key → return to dialogue (so the kid can re-open the mic if they
      want to add one more thing).
-->

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue';
import { useDialogueStore } from '@/stores/dialogue';
import { useStoryStore } from '@/stores/story';
import { useScreenStore } from '@/stores/screen';
import { useBgmStore } from '@/stores/bgm';
import { useI18n } from 'vue-i18n';
import { useFocusable } from '@/services/focus';
import { api, ApiError } from '@/services/api';
import { ERR } from '@/utils/errorCodes';
import { asset } from '@/utils/assets';

const dialogue = useDialogueStore();
const storyStore = useStoryStore();
const screen = useScreenStore();
const bgm = useBgmStore();
const { t } = useI18n();

const confirmBtnRef = ref<HTMLElement | null>(null);
let mounted = true;
let inFlight = false;

const paragraphs = computed<string[]>(() => {
  const ps = dialogue.storyOutline?.paragraphs;
  return Array.isArray(ps) && ps.length > 0
    ? ps.slice(0, 5)
    : [t('storyPreview.fallbackParagraph')];
});

function isDevBrowser(): boolean {
  if (import.meta.env.DEV) return true;
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).has('dev');
}

async function confirmAndGenerate(): Promise<void> {
  if (!mounted || inFlight) return;
  inFlight = true;

  // Dev/gallery mode: skip the server call so reviewers can walk
  // dialogue → preview → generating offline. Mirrors the same shortcut
  // used in DialogueScreen.startGenerationAndNavigate().
  if (isDevBrowser()) {
    storyStore.startGeneration({
      storyId: 'demo-gen-' + Date.now(),
      estimatedDurationSec: 75,
      queuePosition: 1,
    });
    screen.go('generating');
    return;
  }

  if (!dialogue.dialogueId) {
    screen.goError(ERR.STORY_GEN_FAILED);
    return;
  }
  try {
    const { data } = await api.dialogueConfirm(dialogue.dialogueId);
    storyStore.startGeneration({
      storyId: data.storyId,
      estimatedDurationSec: data.estimatedDurationSec,
      queuePosition: data.queuePosition,
    });
    screen.go('generating');
  } catch (e) {
    const code = e instanceof ApiError ? e.code : ERR.STORY_GEN_FAILED;
    screen.goError(code);
  } finally {
    inFlight = false;
  }
}

useFocusable(confirmBtnRef, {
  id: 'preview-confirm',
  autoFocus: true,
  onEnter: () => { void confirmAndGenerate(); },
});

let backKeyHandler: ((e: KeyboardEvent) => void) | null = null;

onMounted(() => {
  bgm.play('chat');
  // Hardware Back key (or browser Esc) → back to dialogue so the kid can
  // add one more turn if they want. Once dialogue is done the bear is
  // still listening.
  backKeyHandler = (e: KeyboardEvent) => {
    if (!mounted) return;
    if (e.key === 'Escape' || e.key === 'Backspace') {
      screen.go('dialogue');
    }
  };
  window.addEventListener('keydown', backKeyHandler);
});

onBeforeUnmount(() => {
  mounted = false;
  if (backKeyHandler) {
    window.removeEventListener('keydown', backKeyHandler);
    backKeyHandler = null;
  }
});
</script>

<template>
  <div class="story-preview-screen">
    <img class="bg" :src="asset('bg/bg_home_cozy.webp')" alt="" aria-hidden="true" />

    <header class="preview-header">
      <div class="header-row">
        <img
          class="header-avatar"
          :src="asset('avatar/avatar_bear_painter.webp')"
          alt=""
          aria-hidden="true"
        />
        <h1 class="title wb-text-shadow">{{ t('storyPreview.title') }}</h1>
      </div>
      <div class="subtitle wb-text-shadow-sm">{{ t('storyPreview.subtitle') }}</div>
    </header>

    <main class="outline-card">
      <ol class="paragraph-list">
        <li
          v-for="(p, i) in paragraphs"
          :key="i"
          class="paragraph-item"
        >
          <span class="paragraph-num">{{ i + 1 }}</span>
          <span class="paragraph-text">{{ p }}</span>
        </li>
      </ol>
    </main>

    <footer class="preview-footer">
      <button
        ref="confirmBtnRef"
        type="button"
        class="confirm-btn wb-focus-feedback"
        @click="confirmAndGenerate()"
      >
        <img
          class="confirm-icon"
          :src="asset('ui/ui_remote.webp')"
          alt=""
          aria-hidden="true"
        />
        <span class="confirm-label">{{ t('storyPreview.confirm') }}</span>
      </button>
      <div class="confirm-hint wb-text-shadow-sm">{{ t('storyPreview.confirmHint') }}</div>
    </footer>
  </div>
</template>

<style scoped>
.story-preview-screen {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: var(--c-bg-canvas);
}
.bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 0;
  user-select: none;
  pointer-events: none;
}

.preview-header {
  position: relative;
  z-index: 1;
  flex: 0 0 auto;
  padding: 48px 64px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.header-row {
  display: flex;
  align-items: center;
  gap: 18px;
}
.header-avatar {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  object-fit: cover;
  background: rgba(255, 241, 200, 0.7);
  border: 3px solid var(--c-amber);
  filter: drop-shadow(0 6px 12px rgba(0, 0, 0, 0.4));
}
.title {
  font-family: var(--ff-display);
  color: var(--c-cream);
  font-size: 44px;
  font-weight: 800;
  letter-spacing: 0.02em;
  margin: 0;
}
.subtitle {
  font-family: var(--ff-display);
  color: var(--c-cream);
  font-size: 22px;
  opacity: 0.85;
  letter-spacing: 0.02em;
}

.outline-card {
  position: relative;
  z-index: 1;
  flex: 1 1 auto;
  margin: 16px 96px;
  padding: 32px 40px;
  background: rgba(255, 245, 230, 0.94);
  border: 1px solid rgba(245, 158, 11, 0.25);
  border-radius: 24px;
  box-shadow: var(--shadow-card);
  overflow-y: auto;
  /*
   * WO-3.8 (反馈 4): hide the mouse-style scrollbar but keep scroll
   * functionality (D-pad / wheel still scrolls). Three-vendor coverage:
   *   - scrollbar-width  → Firefox
   *   - -ms-overflow-style → legacy IE/Edge
   *   - ::-webkit-scrollbar → Chrome / Safari / Edge Chromium
   */
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.outline-card::-webkit-scrollbar {
  display: none;
}
.paragraph-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.paragraph-item {
  display: flex;
  align-items: flex-start;
  gap: 18px;
  font-family: var(--ff-display);
  color: #2b1a0f;
  font-size: 28px;
  line-height: 1.5;
}
.paragraph-num {
  flex: 0 0 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--c-amber);
  color: #2b1a0f;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  margin-top: 4px;
}
.paragraph-text {
  flex: 1 1 auto;
}

.preview-footer {
  position: relative;
  z-index: 1;
  flex: 0 0 auto;
  padding: 16px 64px 36px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.confirm-btn {
  display: inline-flex;
  align-items: center;
  gap: 18px;
  padding: 16px 36px;
  background: rgba(245, 158, 11, 0.32);
  border: 2px solid var(--c-amber);
  border-radius: 999px;
  color: var(--c-cream);
  font-family: var(--ff-display);
  cursor: pointer;
  transition: transform var(--t-fast) var(--ease-out),
              border-color var(--t-fast) var(--ease-out),
              box-shadow var(--t-fast) var(--ease-out);
}
.confirm-icon {
  width: 56px;
  height: 56px;
  object-fit: contain;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.4));
}
.confirm-label {
  font-size: 28px;
  font-weight: 800;
  letter-spacing: 0.02em;
}
.confirm-btn.is-focused,
.confirm-btn[data-focused='true'] {
  transform: scale(1.06);
  border-color: var(--c-amber);
  box-shadow:
    inset 0 0 0 3px var(--c-amber),
    0 0 0 5px rgba(255, 245, 230, 0.3),
    0 0 28px 6px var(--c-focus-soft);
}
.confirm-hint {
  font-family: var(--ff-display);
  color: var(--c-cream);
  font-size: 18px;
  opacity: 0.75;
  letter-spacing: 0.02em;
}
</style>
