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
import { useScreenStore, type ScreenName } from './stores/screen';
import { api } from './services/api';
import { ApiError } from './services/api';
import './styles/global.css';

/**
 * Gallery mode short-circuit. Activated by ?gallery=1 (dev only).
 * Mounts GalleryView instead of App and skips all activation/refresh logic.
 * Zero impact on normal bootstrap.
 *
 * 2026-04-23: startKeyRouter() must run here too, otherwise arrow/OK/Back
 * keys are dead inside the previewed screen (normal bootstrap path is skipped).
 */
async function bootstrapGallery(): Promise<void> {
  const { default: GalleryView } = await import('./dev/GalleryView.vue');
  const app = createApp(GalleryView);
  app.use(createPinia());
  app.use(i18n);
  startKeyRouter();
  app.mount('#app');
}

async function bootstrap(): Promise<void> {
  // Dev-only: show the real OS cursor so mouse input works for testing.
  // (global.css defaults `cursor: none !important` for TV kiosk mode; this
  // lifts that for any session with ?dev=1, independent of DevConsole mount.)
  if (typeof window !== 'undefined'
      && new URLSearchParams(window.location.search).has('dev')) {
    document.body.setAttribute('data-dev', '1');
  }



  if (typeof window !== 'undefined'
      && new URLSearchParams(window.location.search).get('gallery') === '1') {
    return bootstrapGallery();
  }

  /*
   * 2026-04-28 · ?demoToken=1 (48h showcase)
   * Fetch a demo device token from /api/device/demo-bind, write it to
   * localStorage, then reload WITHOUT the query so a normal token-based
   * boot kicks in and lands on home+library with real data.
   *
   * Enabled server-side by `WB_DEMO_BIND_ENABLED=1`. If disabled the
   * server returns 404 and we fall through to the regular activation
   * boot path so nothing breaks.
   */
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    if (params.get('demoToken') === '1') {
      try {
        const baseUrl = (() => {
          try { return localStorage.getItem('wb_api_base') ?? '/api'; }
          catch { return '/api'; }
        })();
        const r = await fetch(`${baseUrl}/device/demo-bind`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
        if (r.ok) {
          const j = await r.json();
          const token: string | undefined =
            j?.deviceToken ?? j?.data?.deviceToken;
          if (typeof token === 'string' && token.length > 0) {
            try { localStorage.setItem('wb_device_token', token); }
            catch { /* private mode / quota — ignore */ }
            // Reload without the demoToken query so the normal boot
            // path runs with the freshly-stored token.
            const url = new URL(window.location.href);
            url.searchParams.delete('demoToken');
            window.location.replace(url.toString());
            return;
          }
        }
        // eslint-disable-next-line no-console
        console.warn('[boot] demo-bind disabled or failed, falling through');
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[boot] demo-bind error:', e);
      }
    }
  }

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

  /*
   * 2026-04-27 dev-mode guard.
   * In ?dev browser sessions there's no real backend, so every API call
   * 401s and this handler would yo-yo the user back to ActivationScreen
   * the instant they navigate away (e.g. via remote-Back / ESC). Disable
   * the auto-reactivate path in dev so the Back key actually escapes.
   * Production behaviour is unchanged.
   */
  const isDevQuery = import.meta.env.DEV
    || (typeof window !== 'undefined'
        && new URLSearchParams(window.location.search).has('dev'));
  if (isDevQuery) {
    api.onAuthError(() => {
      bridge.log('boot', { event: 'auth_error_ignored_in_dev' });
    });
  } else {
    // Wire api auth-error → re-activate flow
    api.onAuthError(() => {
      api.clearDeviceToken();
      screen.go('activation');
    });
  }

  api.setLocale(getLocale());

  // Try to load OEM config (non-blocking on failure)
  device.loadOemConfig().catch(() => { /* fallback already in store */ });

  // Determine initial screen.
  // If we have a token, ask server for current binding state.
  // Otherwise jump to activation (factory case).
  //
  // 2026-04-27 dev-mode override: in browser dev sessions activation is
  // a one-time ceremony that already passed (mock token / bound device).
  // Forcing the user back through activation on every Ctrl+F5 is just
  // friction. Boot straight into home unless they explicitly deep-link
  // to ?screen=activation to review that screen's UI.
  if (isDevQuery) {
    device.status = 'bound';
    screen.go('home');
    bridge.log('boot', { event: 'dev_default_home' });
  } else if (api.getDeviceToken()) {
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

  /*
   * Dev-only: ?screen=<name> deep-link into any screen.
   * iter7 hardening — apply the override BEFORE app.mount so the target
   * screen boots directly (no activation → flash → screen). Also seed
   * minimal store data for screens that would otherwise goError without
   * a real server session (generating / story-*).
   *
   * Suppress the auth-error handler globally — in dev browser mode every
   * OEM / status API call 401s (no real server) and would otherwise
   * punt the user back to ActivationScreen moments after our override.
   */
  if (typeof window !== 'undefined') {
    const p = new URLSearchParams(window.location.search);
    const want = p.get('screen');
    const VALID: ScreenName[] = ['activation','home','create','dialogue','generating',
      'story-cover','story-body','story-end','library','favorites','learning','profile',
      'leaderboard','create-invite','offline','error'];
    if (want && (VALID as string[]).includes(want)) {
      api.onAuthError(() => { /* deep-link mode — stay on the chosen screen */ });
      if (want === 'generating') {
        const { useStoryStore } = await import('./stores/story');
        const s = useStoryStore();
        s.generatingStoryId = 'demo-gen';
        s.genStatus = 'generating';
        s.genStage = 'image';
        s.pagesGenerated = 5;
        s.totalPages = 12;
        s.percent = 42;
        s.genStartedAt = Date.now() - 18_000;
      }
      screen.go(want as ScreenName);
    }
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
