/**
 * Key router.
 * Listens to window keydown, translates to FocusKey, routes to:
 *   - direction → move focus (static neighbor or geometric)
 *   - ok → trigger onEnter on current focused element
 *   - back → call scope's back handler, then current onBack
 *
 * 120ms throttle on direction keys (per kickoff hard rule §6).
 * OK and Back are NOT throttled (business logic debounces if needed).
 */

import type { Direction, FocusKey } from './types';
import {
  getCurrentEntry,
  getEntry,
  setFocus,
} from './store';
import { findGeometricNeighbor } from './neighbors';

const DIRECTION_THROTTLE_MS = 120;
let lastDirAt = 0;

const backHandlers: Array<() => boolean> = [];

export function pushBackHandler(fn: () => boolean): () => void {
  backHandlers.push(fn);
  return () => {
    const i = backHandlers.indexOf(fn);
    if (i >= 0) backHandlers.splice(i, 1);
  };
}

function mapKey(e: KeyboardEvent): FocusKey | null {
  switch (e.key) {
    case 'ArrowUp':    return 'up';
    case 'ArrowDown':  return 'down';
    case 'ArrowLeft':  return 'left';
    case 'ArrowRight': return 'right';
    case 'Enter':
    case ' ':          return 'ok';
    case 'Escape':
    case 'Backspace':  return 'back';
    case 'Home':       return 'home';
    default:           return null;
  }
}

function moveFocus(dir: Direction): void {
  const current = getCurrentEntry();
  if (!current) return;

  // Try static neighbor first
  const staticTarget = current.options.neighbors?.[dir];
  if (staticTarget && getEntry(staticTarget)) {
    setFocus(staticTarget);
    return;
  }

  // Fall back to geometric
  const geo = findGeometricNeighbor(current, dir);
  if (geo) setFocus(geo);
}

function handleOk(): void {
  const current = getCurrentEntry();
  current?.options.onEnter?.();
}

function handleBack(): void {
  // Run scope back handlers in reverse order — innermost first
  for (let i = backHandlers.length - 1; i >= 0; i--) {
    if (backHandlers[i]()) return; // handled
  }
  // Then ask current focused element
  const current = getCurrentEntry();
  current?.options.onBack?.();
}

let started = false;

export function startKeyRouter(): void {
  if (started || typeof window === 'undefined') return;
  started = true;

  window.addEventListener('keydown', (e: KeyboardEvent) => {
    const key = mapKey(e);
    if (!key) return;

    // Prevent default for keys we own to avoid scrolling/back behavior
    e.preventDefault();

    if (key === 'up' || key === 'down' || key === 'left' || key === 'right') {
      const now = performance.now();
      if (now - lastDirAt < DIRECTION_THROTTLE_MS) return;
      lastDirAt = now;
      moveFocus(key);
    } else if (key === 'ok') {
      handleOk();
    } else if (key === 'back') {
      handleBack();
    } else if (key === 'home') {
      // Routed via screen store from app code subscribing to a custom event
      window.dispatchEvent(new CustomEvent('wb:home-key'));
    }
  });
}
