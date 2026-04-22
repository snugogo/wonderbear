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

export function createMockBridge(): BridgeApi {
  let mockTtsAudio: HTMLAudioElement | null = null;
  let mediaStream: MediaStream | null = null;
  let mediaRecorder: MediaRecorder | null = null;
  let recordedChunks: Blob[] = [];

  const mockDeviceInfo: DeviceInfo = {
    deviceId: 'dev-browser-' + Math.random().toString(36).slice(2, 10),
    model: 'GP15-Browser',
    activationCode: 'DEVTEST',
    firmwareVer: '0.0.0-dev',
    osVersion: 'Browser-Mock',
    hwFingerprint: 'mock-fp',
    batchCode: null,
    assetsBaseUrl: '/assets',
  };

  // Signal "ready" on next tick so app code can subscribe first
  setTimeout(() => emit('ready'), 0);

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
