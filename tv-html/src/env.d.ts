/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, unknown>;
  export default component;
}

interface ImportMetaEnv {
  readonly VITE_API_BASE: string;
  readonly VITE_H5_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// JS Bridge surface — exposed by Android Shell at runtime.
// Real implementation in src/services/bridge/real.ts.
interface AndroidBridge {
  getDeviceInfo(): string;
  getOemConfig?(): string;
  playBgm(scene: string, volume: number): void;
  fadeBgm?(targetVolume: number, durationMs: number): void;
  stopBgm(): void;
  setBgmVolume(volume: number): void;
  playTts(url: string, onEndCallbackName: string): void;
  stopTts(): void;
  startVoiceRecord(mode: string): void;
  stopVoiceRecord(): string | null;
  getVoiceAvailability?(): string;
  log(tag: string, message: string): void;
  reboot(): void;
  reportTelemetry(eventsJson: string): void;
  openExternalUrl(url: string): void;
  getSystemBrightness?(): number;
  setSystemBrightness?(value: number): void;
  showToast?(message: string): void;
  getNetworkStatus?(): string;
}

// Shell → HTML push surface — Android calls these on window.
interface Window {
  Android?: AndroidBridge;
  onAndroidReady?(): void;
  onRemoteVoiceKeyDown?(): void;
  onRemoteVoiceKeyUp?(): void;
  onNetworkChange?(connected: boolean): void;
  onActivationStatusChange?(status: string): void;
  onTtsEnd?(idOrUrl: string): void;
  onBgmEnded?(scene: string): void;
  onOtaProgress?(percent: number): void;
  __bridge?: unknown;
  __api?: unknown;
  __WB?: unknown;
}
