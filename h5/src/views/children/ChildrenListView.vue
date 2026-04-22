<template>
  <div class="page">
    <van-nav-bar :title="t('children.listTitle')" left-arrow @click-left="router.back()">
      <template #right>
        <van-button
          v-if="children.length > 0 && children.length < CHILD_MAX"
          type="primary"
          size="small"
          round
          icon="plus"
          @click="onAdd"
        >
          {{ t('children.add') }}
        </van-button>
      </template>
    </van-nav-bar>

    <div class="content">
      <!-- 加载态 -->
      <div v-if="loading" class="loading">
        <van-loading color="var(--wb-primary)" />
      </div>

      <!-- 空态 -->
      <EmptyState
        v-else-if="children.length === 0"
        asset="h5.emptyChildren"
        :title="t('children.emptyTitle')"
        :desc="t('children.emptyDesc')"
        fallback-emoji="🧒"
      >
        <template #action>
          <van-button type="primary" round icon="plus" @click="onAdd">
            {{ t('children.addFirst') }}
          </van-button>
        </template>
      </EmptyState>

      <!-- 网格 -->
      <template v-else>
        <p class="subtitle">{{ t('children.listSubtitle', { count: children.length }) }}</p>

        <div class="grid">
          <div
            v-for="c in children"
            :key="c.id"
            class="card"
            @click="onEdit(c.id)"
          >
            <AvatarImage :stem="c.avatar" :size="72" />
            <div class="card-name">{{ c.name }}</div>
            <div class="card-meta">
              {{ c.age }}{{ t('children.ageUnit') }} · {{ langLabel(c.primaryLang) }}
            </div>
            <van-icon
              name="delete-o"
              class="delete-btn"
              size="18"
              color="var(--wb-text-sub)"
              @click.stop="onDelete(c)"
            />
          </div>

          <!-- 占位 + 号(未满 4 个时) -->
          <div
            v-if="children.length < CHILD_MAX"
            class="card card-add"
            @click="onAdd"
          >
            <div class="plus-circle">
              <van-icon name="plus" size="32" color="var(--wb-primary)" />
            </div>
            <div class="card-name" style="color: var(--wb-primary-dark)">
              {{ t('children.add') }}
            </div>
          </div>
        </div>

        <p v-if="children.length >= CHILD_MAX" class="max-tip">
          {{ t('children.maxReached') }}
        </p>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { showDialog, showSuccessToast, showToast } from 'vant';
import { childApi } from '@/api/child';
import { CHILD_MAX } from '@/config';
import { useApiError } from '@/composables/useApiError';
import type { Child, Locale } from '@/types';
import AvatarImage from '@/components/AvatarImage.vue';
import EmptyState from '@/components/EmptyState.vue';

const { t } = useI18n();
const router = useRouter();
const { format: fmtErr } = useApiError();

const children = ref<Child[]>([]);
const loading = ref(true);

function langLabel(locale: Locale): string {
  return {
    zh: '中文',
    en: 'English',
    pl: 'Polski',
    ro: 'Română',
  }[locale];
}

async function load() {
  loading.value = true;
  try {
    const { items } = await childApi.list();
    children.value = items;
  } catch (e) {
    showToast(fmtErr(e));
  } finally {
    loading.value = false;
  }
}

function onAdd() {
  if (children.value.length >= CHILD_MAX) {
    showToast(t('children.maxReached'));
    return;
  }
  router.push({ name: 'ChildCreate' });
}

function onEdit(id: string) {
  router.push({ name: 'ChildEdit', params: { id } });
}

async function onDelete(child: Child) {
  try {
    await showDialog({
      title: t('children.deleteTitle', { name: child.name }),
      message: t('children.deleteDesc'),
      confirmButtonText: t('children.delete'),
      cancelButtonText: t('common.cancel'),
      showCancelButton: true,
      confirmButtonColor: 'var(--wb-danger)',
    });
  } catch {
    return; // 用户取消
  }

  try {
    await childApi.remove(child.id);
    showSuccessToast(t('children.deleteSuccess'));
    children.value = children.value.filter((c) => c.id !== child.id);
  } catch (e) {
    showToast(fmtErr(e));
  }
}

onMounted(load);
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: var(--wb-bg);
}
:deep(.van-nav-bar) {
  background: var(--wb-bg);
}
:deep(.van-nav-bar__title) {
  color: var(--wb-text);
  font-weight: 600;
}
.content {
  padding: 16px;
}
.loading {
  display: flex;
  justify-content: center;
  padding: 80px 0;
}
.subtitle {
  margin: 0 4px 16px;
  font-size: 13px;
  color: var(--wb-text-sub);
}

.grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}
.card {
  position: relative;
  background: var(--wb-card);
  border-radius: 16px;
  padding: 16px 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  transition: transform 0.12s, box-shadow 0.12s;
  box-shadow: 0 2px 10px rgba(255, 138, 61, 0.06);
}
.card:active {
  transform: scale(0.98);
  box-shadow: 0 4px 14px rgba(255, 138, 61, 0.12);
}
.card-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--wb-text);
  margin-top: 4px;
}
.card-meta {
  font-size: 12px;
  color: var(--wb-text-sub);
}
.delete-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 4px;
}

.card-add {
  background: transparent;
  border: 2px dashed var(--wb-primary-light);
  box-shadow: none;
}
.plus-circle {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: var(--wb-primary-light);
  display: flex;
  align-items: center;
  justify-content: center;
}

.max-tip {
  margin: 24px 0 0;
  text-align: center;
  font-size: 12px;
  color: var(--wb-text-sub);
}
</style>
