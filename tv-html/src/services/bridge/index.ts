/**
 * Bridge facade.
 * App code MUST go through this — never touch window.Android directly.
 *
 * Usage:
 *   import { bridge } from '@/services/bridge';
 *   bridge.playBgm('home', 0.6);
 *   const off = bridge.on('voice-key-down', () => {...});
 *   off(); // unsubscribe
 */

import type { BridgeApi } from './types';
import { createRealBridge } from './real';
import { createMockBridge } from './mock';

import './pushBus'; // side-effect: install window.onXxx handlers

const IS_REAL_DEVICE =
  typeof window !== 'undefined' && typeof window.Android !== 'undefined';

export const bridge: BridgeApi = IS_REAL_DEVICE ? createRealBridge() : createMockBridge();

if (typeof window !== 'undefined') {
  window.__bridge = bridge;
}

export type { BridgeApi, BridgeEvent, BgmScene, VoiceMode, DeviceInfo } from './types';
