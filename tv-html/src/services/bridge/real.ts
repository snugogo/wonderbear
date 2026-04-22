/**
 * Real bridge for GP15 device.
 * Thin wrapper around window.Android, all calls wrapped in try/catch
 * because native methods can throw on edge cases (Shell crash, app killed).
 */

import type { BridgeApi, DeviceInfo, BgmScene, VoiceMode } from './types';
import { on, off } from './pushBus';

export function createRealBridge(): BridgeApi {
  const A = window.Android!;
  let deviceInfoCache: DeviceInfo | null = null;

  return {
    isReal: true,
    isMock: false,

    getDeviceInfo(): DeviceInfo | null {
      if (deviceInfoCache) return deviceInfoCache;
      try {
        const raw = A.getDeviceInfo();
        deviceInfoCache = (typeof raw === 'string' ? JSON.parse(raw) : raw) as DeviceInfo;
        return deviceInfoCache;
      } catch (e) {
        console.error('[bridge] getDeviceInfo failed:', e);
        return null;
      }
    },

    playBgm(scene: BgmScene, volume = 0.6): void {
      try { A.playBgm(scene, volume); }
      catch (e) { console.error('[bridge] playBgm:', e); }
    },

    stopBgm(): void {
      try { A.stopBgm(); }
      catch (e) { console.error('[bridge] stopBgm:', e); }
    },

    setBgmVolume(volume: number): void {
      try { A.setBgmVolume(volume); }
      catch (e) { console.error('[bridge] setBgmVolume:', e); }
    },

    playTts(url: string): void {
      try { A.playTts(url, 'onTtsEnd'); }
      catch (e) { console.error('[bridge] playTts:', e); }
    },

    stopTts(): void {
      try { A.stopTts(); }
      catch (e) { console.error('[bridge] stopTts:', e); }
    },

    startVoiceRecord(mode: VoiceMode = 'dialogue'): void {
      try { A.startVoiceRecord(mode); }
      catch (e) { console.error('[bridge] startVoiceRecord:', e); }
    },

    stopVoiceRecord(): string | null {
      try { return A.stopVoiceRecord(); }
      catch (e) { console.error('[bridge] stopVoiceRecord:', e); return null; }
    },

    log(tag: string, message: string | object): void {
      try {
        A.log(tag, typeof message === 'string' ? message : JSON.stringify(message));
      } catch {
        // log must never throw
      }
    },

    reboot(): void {
      try { A.reboot(); }
      catch (e) { console.error('[bridge] reboot:', e); }
    },

    reportTelemetry(events: object[]): void {
      try { A.reportTelemetry(JSON.stringify(events)); }
      catch (e) { console.error('[bridge] reportTelemetry:', e); }
    },

    openExternalUrl(url: string): void {
      try { A.openExternalUrl(url); }
      catch (e) { console.error('[bridge] openExternalUrl:', e); }
    },

    on,
    off,
  };
}
