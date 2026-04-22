/**
 * BGM store.
 * Scene-based BGM control. All audio actually plays in native Shell via bridge —
 * this store just tracks state and respects the parent toggle.
 *
 * Per 3_GP15硬件适配指南.md §6.1, scene → BGM mapping:
 *   home: 20%, chat: 15%, story_cover: 30%, story_body: 20%, story_ending: 0, learning/setting: 0
 */

import { defineStore } from 'pinia';
import { bridge, type BgmScene } from '@/services/bridge';

const SCENE_VOLUMES: Record<BgmScene, number> = {
  home: 0.20,
  chat: 0.15,
  story_cover: 0.30,
  story_body: 0.20,
  story_ending: 0.0,
  learning: 0.0,
  setting: 0.0,
};

export interface BgmState {
  enabled: boolean;     // global toggle (parent setting, synced from device)
  currentScene: BgmScene | null;
  currentVolume: number;
}

export const useBgmStore = defineStore('bgm', {
  state: (): BgmState => ({
    enabled: true,
    currentScene: null,
    currentVolume: 0,
  }),

  actions: {
    play(scene: BgmScene): void {
      if (!this.enabled) return;
      const vol = SCENE_VOLUMES[scene];
      if (vol === 0) {
        this.stop();
        return;
      }
      this.currentScene = scene;
      this.currentVolume = vol;
      bridge.playBgm(scene, vol);
    },

    stop(): void {
      this.currentScene = null;
      this.currentVolume = 0;
      bridge.stopBgm();
    },

    setEnabled(enabled: boolean): void {
      this.enabled = enabled;
      if (!enabled) this.stop();
    },
  },
});
