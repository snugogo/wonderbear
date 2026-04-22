import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Device, Parent, SubscriptionSummary } from '@/types';
import { storage } from '@/utils/storage';
import { STORAGE_KEYS } from '@/config';
import { authApi } from '@/api/auth';

/**
 * 扫码带来的设备上下文
 * URL: h5.wonderbear.app/#/register?device=xxx&code=yyy
 */
export interface DeviceContext {
  deviceId: string;
  activationCode: string;
  enteredAt: number;
}

/**
 * 登录/注册 API 返回的 parent 字段不完整(只有基础信息 + 可选 subscription),
 * store 里用这个类型做最小集合,访问 /api/parent/me 拿到完整 Parent 后再替换
 */
export interface ParentLite {
  id: string;
  email: string;
  locale: Parent['locale'];
  activated: boolean;
  subscription?: SubscriptionSummary | null;
}

export const useAuthStore = defineStore('auth', () => {
  // ---- state ----
  const token = ref<string>(storage.get<string>(STORAGE_KEYS.TOKEN) || '');
  const parent = ref<ParentLite | Parent | null>(storage.get<ParentLite>(STORAGE_KEYS.PARENT));
  const device = ref<Device | null>(null);
  const deviceCtx = ref<DeviceContext | null>(
    storage.get<DeviceContext>(STORAGE_KEYS.DEVICE_CTX)
  );

  // ---- getters ----
  const isLoggedIn = computed(() => !!token.value && !!parent.value);
  const hasPendingDevice = computed(() => !!deviceCtx.value?.deviceId);
  const subscription = computed<SubscriptionSummary | null>(
    () => parent.value?.subscription ?? null
  );
  const isSubscribed = computed(() => {
    const s = subscription.value;
    return !!s && s.status === 'active';
  });

  // ---- actions ----
  function setAuth(
    nextToken: string,
    nextParent: ParentLite | Parent,
    nextDevice?: Device | null
  ) {
    token.value = nextToken;
    parent.value = nextParent;
    if (nextDevice) device.value = nextDevice;
    storage.set(STORAGE_KEYS.TOKEN, nextToken);
    storage.set(STORAGE_KEYS.PARENT, nextParent);
    storage.set(STORAGE_KEYS.LAST_EMAIL, nextParent.email);
  }

  /** 独立更新 device(/api/device/bind 返回后用) */
  function setDevice(nextDevice: Device | null) {
    device.value = nextDevice;
  }

  /** 用 /api/parent/me 的完整响应覆盖 store(替换 ParentLite → Parent) */
  function setFullParent(fullParent: Parent) {
    parent.value = fullParent;
    storage.set(STORAGE_KEYS.PARENT, fullParent);
  }

  function setDeviceContext(ctx: Partial<DeviceContext>) {
    if (!ctx.deviceId && !ctx.activationCode) {
      deviceCtx.value = null;
      storage.remove(STORAGE_KEYS.DEVICE_CTX);
      return;
    }
    const next: DeviceContext = {
      deviceId: ctx.deviceId || '',
      activationCode: ctx.activationCode || '',
      enteredAt: ctx.enteredAt || Date.now(),
    };
    deviceCtx.value = next;
    storage.set(STORAGE_KEYS.DEVICE_CTX, next);
  }

  function clearDeviceContext() {
    deviceCtx.value = null;
    storage.remove(STORAGE_KEYS.DEVICE_CTX);
  }

  async function logout() {
    try {
      if (token.value) await authApi.logout();
    } catch {
      // ignore, still clear locally
    }
    token.value = '';
    parent.value = null;
    device.value = null;
    deviceCtx.value = null;
    storage.remove(STORAGE_KEYS.TOKEN);
    storage.remove(STORAGE_KEYS.PARENT);
    storage.remove(STORAGE_KEYS.DEVICE_CTX);
  }

  return {
    // state
    token,
    parent,
    device,
    deviceCtx,
    // getters
    isLoggedIn,
    hasPendingDevice,
    subscription,
    isSubscribed,
    // actions
    setAuth,
    setDevice,
    setFullParent,
    setDeviceContext,
    clearDeviceContext,
    logout,
  };
});
