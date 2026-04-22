/**
 * Screen store.
 * Replaces Vue Router — TV is screen swapping, not URL navigation.
 *
 * 12 P0 screens per kickoff:
 *   Week 5: activation, home, dialogue, generating, story-cover, story-body, story-end
 *   Week 6: library, learning, profile, offline, error
 */

import { defineStore } from 'pinia';
import { resetForScreenChange } from '@/services/focus';

export type ScreenName =
  | 'boot'
  | 'activation'
  | 'home'
  | 'dialogue'
  | 'generating'
  | 'story-cover'
  | 'story-body'
  | 'story-end'
  | 'library'
  | 'learning'
  | 'profile'
  | 'offline'
  | 'error';

export interface ScreenState {
  current: ScreenName;
  previous: ScreenName | null;
  /** Optional payload passed when navigating */
  payload: Record<string, unknown> | null;
  /** Used by ErrorScreen to know what code to render */
  errorCode: number | null;
}

export const useScreenStore = defineStore('screen', {
  state: (): ScreenState => ({
    current: 'boot',
    previous: null,
    payload: null,
    errorCode: null,
  }),

  actions: {
    go(screen: ScreenName, payload: Record<string, unknown> | null = null): void {
      if (this.current === screen) return;
      this.previous = this.current;
      this.current = screen;
      this.payload = payload;
      // Focus state belongs to old screen — clear so new screen can autoFocus fresh
      resetForScreenChange();
    },

    goError(code: number, payload: Record<string, unknown> | null = null): void {
      this.errorCode = code;
      this.go('error', payload);
    },

    /** Return to previous screen if known, else home */
    back(): void {
      const target = this.previous ?? 'home';
      this.previous = this.current;
      this.current = target;
      this.payload = null;
      resetForScreenChange();
    },
  },
});
