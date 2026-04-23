/**
 * Mock bridge for browser dev.
 * - playTts uses HTMLAudioElement
 * - startVoiceRecord uses navigator.mediaDevices.getUserMedia
 * - playBgm/stopBgm log only (no actual audio in browser to avoid annoying devs)
 *
 * Exposes _mock helpers so dev console can simulate native push events.
 */

import type { BridgeApi, DeviceInfo, BgmScene, VoiceMode } from './types';
import { on, off, emit } from './pushBus';
import { useChildStore } from '@/stores/child';
import { api } from '@/services/api';

/**
 * Seed a demo child ("Luna", age 5, en/zh) into the child store so the
 * HomeScreen greeting and avatar are non-empty even when the server call
 * (/api/device/active-child) would 401 in browser dev mode.
 * Only called when the URL has ?autobind=1 (browser demo mode).
 */
function applyDemoChildIfRequested(): void {
  try {
    const store = useChildStore();
    const now = new Date().toISOString();
    const luna = {
      id: 'demo-luna',
      parentId: 'demo-parent',
      name: 'Luna',
      age: 5,
      gender: 'female' as const,
      avatar: 'avatar_bear_classic',
      primaryLang: 'en' as const,
      secondLang: 'zh' as const,
      birthday: null,
      coins: 0,
      voiceId: null,
      createdAt: now,
      updatedAt: now,
    };
    store.setActiveLocal(luna);
    store.allChildren = [luna];
  } catch (e) {
    console.warn('[mock bridge] applyDemoChildIfRequested failed:', e);
  }
}

export function createMockBridge(): BridgeApi {
  let mockTtsAudio: HTMLAudioElement | null = null;
  let mediaStream: MediaStream | null = null;
  let mediaRecorder: MediaRecorder | null = null;
  let recordedChunks: Blob[] = [];

  // Dev helpers — all driven by URL flags, only active in the browser.
  //   ?code=XXXX     -> override mock activationCode (otherwise DEVTEST)
  //   ?autobind=1    -> skip ActivationScreen: fire 'activation-status-change'
  //                     after boot so the app jumps straight to HomeScreen.
  //                     Also seeds a demo child "Luna" into the child store.
  const urlParams =
    typeof location !== 'undefined'
      ? new URLSearchParams(location.search)
      : new URLSearchParams();
  const urlCode = urlParams.get('code');
  const autobind = urlParams.get('autobind') === '1';

  const mockDeviceInfo: DeviceInfo = {
    deviceId: 'dev-browser-' + Math.random().toString(36).slice(2, 10),
    model: 'GP15-Browser',
    activationCode: (urlCode && urlCode.trim()) || 'DEVTEST',
    firmwareVer: '0.0.0-dev',
    osVersion: 'Browser-Mock',
    hwFingerprint: 'mock-fp',
    batchCode: null,
    assetsBaseUrl: '/assets',
  };

  // Signal "ready" on next tick so app code can subscribe first
  setTimeout(() => emit('ready'), 0);

  // Auto-bind: one-tap demo entry. Fires after the app has had time to mount
  // and subscribe to 'activation-status-change'. Paired with a mock Luna that
  // gets injected into the child store (see applyDemoChildIfRequested below).
  if (autobind) {
    // Wait long enough for main.ts to finish bootstrap + ActivationScreen
    // onMounted to subscribe to 'activation-status-change'. Bootstrap has a
    // 1500ms "native ready" timeout plus mount + vue reactive flush, so we
    // give it a healthy margin.
    setTimeout(() => {
      // Suppress the global auth-error handler that main.ts installs, which
      // would otherwise kick us back to ActivationScreen the instant
      // HomeScreen's child.refreshActive() hits 401 (no real device token in
      // browser dev mode). We've seeded Luna locally, so auth errors are
      // harmless in demo mode.
      api.onAuthError(() => {});
      applyDemoChildIfRequested();
      emit('activation-status-change', 'bound');
    }, 2500);
  }

  return {
    isReal: false,
    isMock: true,

    getDeviceInfo(): DeviceInfo { return mockDeviceInfo; },

    playBgm(scene: BgmScene, volume = 0.6): void {
      console.log('[mock bridge] playBgm:', scene, volume);
    },
    stopBgm(): void { console.log('[mock bridge] stopBgm'); },
    setBgmVolume(v: number): void { console.log('[mock bridge] setBgmVolume:', v); },

    playTts(url: string): void {
      console.log('[mock bridge] playTts:', url);
      if (mockTtsAudio) { mockTtsAudio.pause(); mockTtsAudio = null; }
      if (!url) {
        setTimeout(() => emit('tts-end', url), 500);
        return;
      }
      try {
        mockTtsAudio = new Audio(url);
        mockTtsAudio.onended = () => emit('tts-end', url);
        mockTtsAudio.onerror = () => emit('tts-end', url); // fail-soft
        mockTtsAudio.play().catch(() => emit('tts-end', url));
      } catch (e) {
        console.warn('[mock bridge] playTts failed, synthesizing end:', e);
        setTimeout(() => emit('tts-end', url), 1000);
      }
    },

    stopTts(): void {
      if (mockTtsAudio) { mockTtsAudio.pause(); mockTtsAudio = null; }
    },

    async startVoiceRecord(mode: VoiceMode = 'dialogue'): Promise<void> {
      console.log('[mock bridge] startVoiceRecord:', mode);
      recordedChunks = [];
      try {
        if (!navigator.mediaDevices) throw new Error('no mediaDevices');
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(mediaStream);
        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) recordedChunks.push(e.data);
        };
        mediaRecorder.start();
      } catch (e) {
        console.warn('[mock bridge] recording unavailable, will return empty on stop:', (e as Error).message);
        mediaRecorder = null;
      }
    },

    stopVoiceRecord(): Promise<string | null> {
      return new Promise((resolve) => {
        if (!mediaRecorder) { resolve(null); return; }
        mediaRecorder.onstop = async () => {
          const blob = new Blob(recordedChunks, { type: 'audio/webm' });
          if (mediaStream) {
            mediaStream.getTracks().forEach((t) => t.stop());
            mediaStream = null;
          }
          const buf = await blob.arrayBuffer();
          const bytes = new Uint8Array(buf);
          // Build base64 in chunks (avoid String.fromCharCode argument limit)
          let binary = '';
          const chunkSize = 0x8000;
          for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
          }
          resolve(btoa(binary));
        };
        mediaRecorder.stop();
      });
    },

    log(tag: string, msg: string | object): void {
      console.log(`[${tag}]`, msg);
    },

    reboot(): void {
      console.log('[mock bridge] reboot (no-op in browser)');
      if (confirm('Simulate reboot? Page will reload.')) location.reload();
    },

    reportTelemetry(events: object[]): void {
      console.log('[mock bridge] telemetry:', events);
    },

    openExternalUrl(url: string): void {
      window.open(url, '_blank');
    },

    on,
    off,

    _mock: {
      simulateNetworkChange(online: boolean): void { emit('network-change', !!online); },
      simulateVoiceKeyDown(): void { emit('voice-key-down'); },
      simulateVoiceKeyUp(): void { emit('voice-key-up'); },
      simulateTtsEnd(url = ''): void { emit('tts-end', url); },
      simulateActivationStatusChange(status: string): void {
        emit('activation-status-change', status);
      },
    },
  };
}
