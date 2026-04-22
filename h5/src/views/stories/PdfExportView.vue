<template>
  <div class="page wb-page">
    <van-nav-bar :title="t('pdf.title')" left-arrow @click-left="router.back()" />

    <div class="content">
      <!-- 配置阶段 -->
      <template v-if="phase === 'config'">
        <section class="section">
          <label class="label">{{ t('pdf.chooseLanguage') }}</label>
          <van-radio-group v-model="form.language">
            <van-cell-group inset>
              <van-cell :title="t('pdf.langPrimary')" clickable @click="form.language = 'primary'">
                <template #right-icon><van-radio name="primary" /></template>
              </van-cell>
              <van-cell :title="t('pdf.langLearning')" clickable @click="form.language = 'learning'">
                <template #right-icon><van-radio name="learning" /></template>
              </van-cell>
              <van-cell :title="t('pdf.langBoth')" clickable @click="form.language = 'both'">
                <template #right-icon><van-radio name="both" /></template>
              </van-cell>
            </van-cell-group>
          </van-radio-group>
        </section>

        <section class="section">
          <van-cell-group inset>
            <van-cell :title="t('pdf.includeCover')">
              <template #right-icon><van-switch v-model="form.includeCover" size="22" /></template>
            </van-cell>
          </van-cell-group>
        </section>

        <van-button
          type="primary"
          block
          round
          :loading="starting"
          @click="onStart"
          class="action-btn"
        >
          {{ t('pdf.startBtn') }}
        </van-button>
      </template>

      <!-- 进度阶段 -->
      <template v-else-if="phase === 'processing'">
        <div class="state">
          <van-circle
            v-model:current-rate="task.progress"
            :rate="task.progress"
            :speed="100"
            color="var(--wb-primary)"
            layer-color="var(--wb-primary-light)"
            :text="`${task.progress}%`"
            size="120"
          />
          <p class="state-text">
            {{
              task.status === 'queued'
                ? t('pdf.statusQueued')
                : t('pdf.statusGenerating', { progress: task.progress })
            }}
          </p>
        </div>
      </template>

      <!-- 完成 -->
      <template v-else-if="phase === 'done'">
        <EmptyState
          asset="h5.pdfReady"
          :title="t('pdf.statusCompleted')"
          :desc="''"
          fallback-emoji="📄"
        >
          <template #action>
            <div class="actions">
              <a
                v-if="task.downloadUrl"
                :href="task.downloadUrl"
                :download="`wonderbear-${storyId}.pdf`"
                class="van-button van-button--primary van-button--round van-button--normal download-link"
              >
                <van-icon name="down" /> {{ t('pdf.download') }}
              </a>
              <van-button round plain @click="router.back()">
                {{ t('pdf.backToStory') }}
              </van-button>
            </div>
          </template>
        </EmptyState>
      </template>

      <!-- 失败/超时 -->
      <template v-else>
        <EmptyState
          asset="bear.errorOops"
          :title="t('pdf.statusFailed')"
          :desc="t('pdf.timeoutDesc')"
          fallback-emoji="😅"
        >
          <template #action>
            <van-button round plain @click="resetForm">{{ t('common.retry') }}</van-button>
          </template>
        </EmptyState>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onUnmounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { showToast } from 'vant';
import { pdfApi } from '@/api/pdf';
import { useApiError } from '@/composables/useApiError';
import { PDF_POLL_INTERVAL_MS, PDF_POLL_TIMEOUT_MS } from '@/config';
import EmptyState from '@/components/EmptyState.vue';
import type { PdfTaskStatus } from '@/types';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const { format: fmtErr } = useApiError();

const storyId = route.params.id as string;

type Phase = 'config' | 'processing' | 'done' | 'failed';
const phase = ref<Phase>('config');
const starting = ref(false);

const form = reactive({
  language: 'primary' as 'primary' | 'learning' | 'both',
  includeCover: true,
});

const task = reactive<PdfTaskStatus>({
  taskId: '',
  status: 'queued',
  progress: 0,
  downloadUrl: null,
  expiresAt: null,
  error: null,
});

let pollTimer: ReturnType<typeof setInterval> | null = null;
let timeoutId: ReturnType<typeof setTimeout> | null = null;

function stop() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  if (timeoutId) clearTimeout(timeoutId);
  timeoutId = null;
}

function resetForm() {
  stop();
  phase.value = 'config';
  task.taskId = '';
  task.progress = 0;
  task.status = 'queued';
  task.downloadUrl = null;
}

async function onStart() {
  starting.value = true;
  try {
    const { taskId } = await pdfApi.generate({
      storyIds: [storyId],
      includeCover: form.includeCover,
      language: form.language,
    });
    task.taskId = taskId;
    phase.value = 'processing';
    startPolling();
  } catch (e) {
    showToast(fmtErr(e));
  } finally {
    starting.value = false;
  }
}

function startPolling() {
  pollOnce();
  pollTimer = setInterval(pollOnce, PDF_POLL_INTERVAL_MS);
  timeoutId = setTimeout(() => {
    if (phase.value === 'processing') {
      phase.value = 'failed';
      stop();
    }
  }, PDF_POLL_TIMEOUT_MS);
}

async function pollOnce() {
  if (!task.taskId) return;
  try {
    const s = await pdfApi.status(task.taskId);
    Object.assign(task, s);
    if (s.status === 'completed') {
      phase.value = 'done';
      stop();
    } else if (s.status === 'failed') {
      phase.value = 'failed';
      stop();
    }
  } catch {
    // 单次失败不立即视为失败,等超时
  }
}

onUnmounted(stop);
</script>

<style scoped>
.page { background: var(--wb-bg); min-height: 100vh; padding: 0 0 24px; }
:deep(.van-nav-bar) { background: var(--wb-bg); }
:deep(.van-nav-bar__title) { color: var(--wb-text); font-weight: 600; }
.content { padding: 16px; }

.section {
  margin-bottom: 16px;
}
.label {
  display: block;
  padding: 0 16px 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--wb-text);
}
.action-btn {
  height: 48px;
  font-size: 16px;
  font-weight: 600;
  margin-top: 8px;
}

.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px 0;
}
.state-text {
  margin-top: 24px;
  font-size: 14px;
  color: var(--wb-text-sub);
  text-align: center;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  max-width: 280px;
}
.download-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 44px;
  padding: 0 24px;
  background: var(--wb-primary);
  color: #fff;
  border-radius: 999px;
  text-decoration: none;
  font-weight: 600;
  font-size: 15px;
  border: none;
}
</style>
