/**
 * Push event bus.
 * Shell calls window.onXxx() — we translate into bridge events.
 * Defined even in browser mock mode so dev tools can simulate.
 */

import type { BridgeEvent, BridgeEventHandler, BridgeEventPayload } from './types';

type ListenerMap = {
  [E in BridgeEvent]?: Array<BridgeEventHandler<E>>;
};

const listeners: ListenerMap = Object.create(null) as ListenerMap;

export function emit<E extends BridgeEvent>(event: E, payload?: BridgeEventPayload<E>): void {
  const fns = listeners[event];
  if (!fns || fns.length === 0) return;
  // Copy to avoid mutation during iteration
  fns.slice().forEach((fn) => {
    try {
      (fn as BridgeEventHandler<E>)(payload as BridgeEventPayload<E>);
    } catch (e) {
      console.error('[bridge] listener error:', event, e);
    }
  });
}

export function on<E extends BridgeEvent>(event: E, fn: BridgeEventHandler<E>): () => void {
  if (!listeners[event]) {
    (listeners[event] as Array<BridgeEventHandler<E>>) = [];
  }
  (listeners[event] as Array<BridgeEventHandler<E>>).push(fn);
  return () => off(event, fn);
}

export function off<E extends BridgeEvent>(event: E, fn: BridgeEventHandler<E>): void {
  const fns = listeners[event];
  if (!fns) return;
  const i = (fns as Array<BridgeEventHandler<E>>).indexOf(fn);
  if (i >= 0) fns.splice(i, 1);
}

// Wire up Shell → HTML push surface on window.
// Both real and mock paths share this — dev tools simulate via emit() too.
if (typeof window !== 'undefined') {
  window.onAndroidReady = () => emit('ready');
  window.onRemoteVoiceKeyDown = () => emit('voice-key-down');
  window.onRemoteVoiceKeyUp = () => emit('voice-key-up');
  window.onNetworkChange = (connected: boolean) => emit('network-change', !!connected);
  window.onActivationStatusChange = (status: string) => emit('activation-status-change', status);
  window.onTtsEnd = (idOrUrl: string) => emit('tts-end', idOrUrl);
  window.onBgmEnded = (scene: string) => emit('bgm-ended', scene);
  window.onOtaProgress = (percent: number) => emit('ota-progress', percent);
}
