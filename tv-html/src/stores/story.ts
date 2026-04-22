/**
 * Story store — generation polling + active story playback.
 *
 * Server contract: API_CONTRACT.md §7.4 / §7.5 / §7.6
 *   - storyGenerate returns { storyId, status:'queued', queuePosition, estimatedDurationSec, priority }
 *   - storyStatus returns { storyId, status, progress:{stage, pagesGenerated, totalPages, percent}, error?, completedAt? }
 *   - storyDetail returns { story: Story } where Story.pages[].pageNum is 1-based
 *
 * Local playback state:
 *   - pageIndex is 0-based (DOM/array convention).
 *     Convert to/from server pageNum: pageNum = pageIndex + 1.
 */

import { defineStore } from 'pinia';
import type { Story, StoryPage, GenerationStage } from '@/services/api';

export type StoryGenStatus = 'idle' | 'queued' | 'generating' | 'completed' | 'failed';

export interface StoryState {
  // ---- Generation ----
  generatingStoryId: string | null;
  genStatus: StoryGenStatus;
  genStage: GenerationStage | null;
  pagesGenerated: number;
  totalPages: number;
  percent: number;
  estimatedDurationSec: number;
  queuePosition: number | null;
  genStartedAt: number | null;

  // ---- Playback ----
  active: Story | null;
  /** 0-based array index into active.pages. Convert to pageNum (1-based) when reporting. */
  pageIndex: number;
  isPaused: boolean;
  manualAdvance: boolean;
  learningMode: boolean;
}

export const useStoryStore = defineStore('story', {
  state: (): StoryState => ({
    generatingStoryId: null,
    genStatus: 'idle',
    genStage: null,
    pagesGenerated: 0,
    totalPages: 12,
    percent: 0,
    estimatedDurationSec: 75,
    queuePosition: null,
    genStartedAt: null,

    active: null,
    pageIndex: 0,
    isPaused: false,
    manualAdvance: false,
    learningMode: false,
  }),

  getters: {
    currentPage(state): StoryPage | null {
      if (!state.active) return null;
      return state.active.pages[state.pageIndex] ?? null;
    },
    isLastPage(state): boolean {
      if (!state.active) return false;
      return state.pageIndex >= state.active.pages.length - 1;
    },
    /** 1-based page number for reporting / display. */
    currentPageNum(state): number {
      return state.pageIndex + 1;
    },
    genElapsedSec(state): number {
      if (!state.genStartedAt) return 0;
      return Math.floor((Date.now() - state.genStartedAt) / 1000);
    },
  },

  actions: {
    /** Called right after /story/generate succeeds. */
    startGeneration(payload: {
      storyId: string;
      estimatedDurationSec: number;
      queuePosition?: number;
    }): void {
      this.generatingStoryId = payload.storyId;
      this.genStatus = 'queued';
      this.genStage = 'queue';
      this.pagesGenerated = 0;
      this.totalPages = 12;
      this.percent = 0;
      this.estimatedDurationSec = payload.estimatedDurationSec;
      this.queuePosition = payload.queuePosition ?? null;
      this.genStartedAt = Date.now();
    },

    /** Called on each /story/:id/status poll response. */
    updateGenProgress(payload: {
      status: StoryGenStatus;
      stage?: GenerationStage;
      pagesGenerated?: number;
      totalPages?: number;
      percent?: number;
    }): void {
      this.genStatus = payload.status;
      if (payload.stage) this.genStage = payload.stage;
      if (typeof payload.pagesGenerated === 'number') this.pagesGenerated = payload.pagesGenerated;
      if (typeof payload.totalPages === 'number') this.totalPages = payload.totalPages;
      if (typeof payload.percent === 'number') this.percent = payload.percent;
    },

    loadStory(story: Story): void {
      this.active = story;
      this.pageIndex = 0;
      this.isPaused = false;
    },

    nextPage(): boolean {
      if (!this.active) return false;
      if (this.pageIndex >= this.active.pages.length - 1) return false;
      this.pageIndex += 1;
      return true;
    },

    prevPage(): boolean {
      if (this.pageIndex <= 0) return false;
      this.pageIndex -= 1;
      return true;
    },

    setPaused(paused: boolean): void { this.isPaused = paused; },
    toggleLearningMode(): void { this.learningMode = !this.learningMode; },

    clearPlayback(): void {
      this.active = null;
      this.pageIndex = 0;
      this.isPaused = false;
    },

    clearGeneration(): void {
      this.generatingStoryId = null;
      this.genStatus = 'idle';
      this.genStage = null;
      this.pagesGenerated = 0;
      this.percent = 0;
      this.queuePosition = null;
      this.genStartedAt = null;
    },
  },
});
