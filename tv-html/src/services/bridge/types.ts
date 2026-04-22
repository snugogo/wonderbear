/**
 * Bridge type definitions.
 * Source of truth: 3_GP15硬件适配指南.md §3.3 / §3.4
 */

export interface DeviceInfo {
  deviceId: string;
  hwFingerprint: string;
  activationCode: string;
  firmwareVer: string;
  model: string;
  batchCode: string | null;
  osVersion: string;
  webviewVersion?: string;
  assetsBaseUrl?: string;
}

export type BgmScene =
  | 'home'
  | 'chat'
  | 'story_cover'
  | 'story_body'
  | 'story_ending'
  | 'learning'
  | 'setting';

export type VoiceMode = 'bt_remote' | 'dmic' | 'dialogue';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// Reverse push events from Shell → HTML
export type BridgeEvent =
  | 'ready'
  | 'voice-key-down'
  | 'voice-key-up'
  | 'network-change'
  | 'activation-status-change'
  | 'tts-end'
  | 'bgm-ended'
  | 'ota-progress';

export type BridgeEventPayload<E extends BridgeEvent> =
  E extends 'ready' ? void :
  E extends 'voice-key-down' ? void :
  E extends 'voice-key-up' ? void :
  E extends 'network-change' ? boolean :
  E extends 'activation-status-change' ? string :
  E extends 'tts-end' ? string :
  E extends 'bgm-ended' ? string :
  E extends 'ota-progress' ? number :
  never;

export type BridgeEventHandler<E extends BridgeEvent> =
  (payload: BridgeEventPayload<E>) => void;

export interface BridgeApi {
  readonly isReal: boolean;
  readonly isMock: boolean;

  // Device / config
  getDeviceInfo(): DeviceInfo | null;

  // Audio
  playBgm(scene: BgmScene, volume?: number): void;
  stopBgm(): void;
  setBgmVolume(volume: number): void;
  playTts(url: string): void;
  stopTts(): void;

  // Voice recording
  startVoiceRecord(mode?: VoiceMode): void | Promise<void>;
  stopVoiceRecord(): string | null | Promise<string | null>;

  // System
  log(tag: string, message: string | object): void;
  reboot(): void;
  reportTelemetry(events: object[]): void;
  openExternalUrl(url: string): void;

  // Events
  on<E extends BridgeEvent>(event: E, fn: BridgeEventHandler<E>): () => void;
  off<E extends BridgeEvent>(event: E, fn: BridgeEventHandler<E>): void;

  // Mock-only debug helpers (real impl: undefined)
  _mock?: {
    simulateNetworkChange(online: boolean): void;
    simulateVoiceKeyDown(): void;
    simulateVoiceKeyUp(): void;
    simulateTtsEnd(url?: string): void;
    simulateActivationStatusChange(status: string): void;
  };
}
