/**
 * Device store.
 * Holds DeviceInfo (from bridge), OEM config (from API), activation status,
 * and the per-device storiesLeft quota the server returns.
 *
 * Server contract:
 *   §5.1 /device/register → { deviceToken, device:{id,deviceId,status,boundAt,storiesLeft}, oemConfig }
 *   §5.2 /device/status   → { status, parent:{...}|null, activeChild:Child|null }
 *   §11.1 /oem/config     → { oemConfig: OemConfig | null }
 */

import { defineStore } from 'pinia';
import { bridge } from '@/services/bridge';
import { api } from '@/services/api';
import type { DeviceInfo } from '@/services/bridge';
import type { DeviceStatus, OemConfig } from '@/services/api';
import { useChildStore } from '@/stores/child';
import { getLocale } from '@/i18n';

const FALLBACK_H5_BASE = 'https://h5.wonderbear.app';
const FALLBACK_BRAND = 'WonderBear';

export interface DeviceState {
  info: DeviceInfo | null;
  oem: OemConfig | null;
  status: DeviceStatus | 'unknown';
  /** DB-side primary key (different from hardware deviceId). Set after register. */
  serverDeviceId: string | null;
  /** Quota of free stories left on this device (per §5.1). */
  storiesLeft: number;
  /** Bound parent summary, if any (per §5.2). */
  parentEmail: string | null;
  online: boolean;
  lastStatusErrorCode: number | null;
}

export const useDeviceStore = defineStore('device', {
  state: (): DeviceState => ({
    info: null,
    oem: null,
    status: 'unknown',
    serverDeviceId: null,
    storiesLeft: 0,
    parentEmail: null,
    online: typeof navigator !== 'undefined' ? navigator.onLine : true,
    lastStatusErrorCode: null,
  }),

  getters: {
    deviceId(): string | null { return this.info?.deviceId ?? null; },
    activationCode(): string | null { return this.info?.activationCode ?? null; },
    /** Used by buildBindingUrl for the QR code. */
    h5BaseUrl(): string { return this.oem?.h5BaseUrl || FALLBACK_H5_BASE; },
    /** Brand name in current locale (per §11.1, brandName is i18n object). */
    brandName(): string {
      if (!this.oem) return FALLBACK_BRAND;
      const locale = getLocale();
      const bn = this.oem.brandName;
      return bn[locale] || bn.en || bn.zh || FALLBACK_BRAND;
    },
    isActivated(): boolean { return this.status === 'bound'; },
    /** WO-3.29.3 ESC-fix: 游客模式视作已授权(skip + guest token 双 flag) */
    isAuthorized(): boolean {
      if (this.status === 'bound') return true;
      if (typeof localStorage === 'undefined') return false;
      return localStorage.getItem('wb_activation_skipped') === '1'
          && !!localStorage.getItem('wb_device_token');
    },
  },

  actions: {
    loadDeviceInfo(): void {
      this.info = bridge.getDeviceInfo();
    },

    /** Apply /device/register response — usually called once at first boot. */
    applyRegisterResponse(payload: {
      deviceToken: string;
      device: { id: string; deviceId: string; status: DeviceStatus; storiesLeft: number };
      oemConfig: OemConfig | null;
    }): void {
      api.setDeviceToken(payload.deviceToken);
      this.serverDeviceId = payload.device.id;
      this.status = payload.device.status;
      this.storiesLeft = payload.device.storiesLeft;
      if (payload.oemConfig) this.oem = payload.oemConfig;
    },

    async loadOemConfig(): Promise<void> {
      try {
        const { data } = await api.oemConfig();
        this.oem = data.oemConfig;
      } catch (e) {
        bridge.log('device', { event: 'oem_config_failed', err: String(e) });
        this.oem = null; // getters fall back gracefully
      }
    },

    /**
     * Poll /device/status. Also syncs the activeChild into child store
     * so consumers (HomeScreen greeting, DialogueScreen childId) stay fresh.
     */
    async refreshStatus(): Promise<void> {
      try {
        const { data } = await api.deviceStatus();
        this.status = data.status;
        this.parentEmail = data.parent?.email ?? null;
        this.lastStatusErrorCode = null;
        // Sync into child store
        useChildStore().setActiveLocal(data.activeChild);
      } catch (e) {
        const code = (e as { code?: number }).code ?? -1;
        this.lastStatusErrorCode = code;
      }
    },

    setOnline(online: boolean): void {
      this.online = online;
    },
  },
});
