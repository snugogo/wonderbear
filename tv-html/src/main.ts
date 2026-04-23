/**
 * WonderBear TV bootstrap.
 *
 * Sequence:
 *   1. Init Vue + Pinia + i18n
 *   2. Initialize bridge (eager — installs window.onXxx handlers)
 *   3. Start key router
 *   4. Load device info from bridge
 *   5. Wait for native 'ready' OR timeout 1.5s (browser dev fires synthetically)
 *   6. Determine initial screen: bound → home, else → activation
 *   7. Mount app
 */

import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { i18n, getLocale } from './i18n';
import { bridge } from './services/bridge';
import { startKeyRouter } from './services/focus';
import { useDeviceStore } from './stores/device';
import { useScreenStore } from './stores/screen';
import { api } from './services/api';
import { ApiError } from './services/api';
import './styles/global.css';

async function bootstrap(): Promise<void> {
  const app = createApp(App);
  const pinia = createPinia();
  app.use(pinia);
  app.use(i18n);

  // Initialize global services
  startKeyRouter();

  const device = useDeviceStore();
  const screen = useScreenStore();

  // Wait for native ready (or mock timeout). Don't block forever.
  await new Promise<void>((resolve) => {
    let resolved = false;
    const off = bridge.on('ready', () => {
      if (resolved) return;
      resolved = true;
      off();
      resolve();
    });
    setTimeout(() => {
      if (resolved) return;
      resolved = true;
      off();
      resolve();
    }, 1500);
  });

  // Pull device info from bridge
  device.loadDeviceInfo();
  bridge.log('boot', { event: 'device_info_loaded', deviceId: device.deviceId });

  // Wire api auth-error → re-activate flow
  api.onAuthError(() => {
    api.clearDeviceToken();
    screen.go('activation');
  });

  api.setLocale(getLocale());

  // Try to load OEM config (non-blocking on failure)
  device.loadOemConfig().catch(() => { /* fallback already in store */ });

  // Determine initial screen.
  // If we have a token, ask server for current binding state.
  // Otherwise jump to activation (factory case).
  if (api.getDeviceToken()) {
    try {
      await device.refreshStatus();
      screen.go(device.isActivated ? 'home' : 'activation');
    } catch (e) {
      const code = e instanceof ApiError ? e.code : -1;
      bridge.log('boot', { event: 'status_check_failed', code });
      // Network / server error → activation as safe default
      screen.go('activation');
    }
  } else {
    screen.go('activation');
  }

  app.mount('#app');

  // Expose for dev console / debugging
  if (typeof window !== 'undefined') {
    window.__WB = { bridge, api, device, screen, i18n };
  }

  bridge.log('boot', { event: 'app_mounted', initialScreen: screen.current });
}

bootstrap().catch((e) => {
  console.error('[boot] fatal:', e);
  // Render minimal error message instead of leaving the boot loader stuck
  const root = document.getElementById('app');
  if (root) {
    // TV_TASKS v1.1 P1-3: boot-fail text bumped from 18px -> 32px
    // (minimum readable body size at TV viewing distance).
    root.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:#ff9aa2;font-size:32px;padding:24px;text-align:center;line-height:1.4">Boot failed &mdash; please restart the device</div>';
  }
});
