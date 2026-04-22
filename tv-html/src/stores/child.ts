/**
 * Child store. Tracks active child and the full list (for switch dialog).
 *
 * Server contract: API_CONTRACT.md §5.7 (/device/active-child) returns
 *   { activeChild: Child | null, allChildren: Child[] }
 *
 * Child age is a number (3-8). For UI purposes we derive an "age bucket"
 * (3-4 / 5-6 / 7-8) which the server uses internally to pick dialogue length
 * (5 vs 7 rounds), but the bucket is NOT a server contract field — it's a
 * UI-side classification.
 */

import { defineStore } from 'pinia';
import { api } from '@/services/api';
import type { Child } from '@/services/api';
import type { Locale } from '@/utils/errorCodes';

export type AgeBucket = '3-4' | '5-6' | '7-8';

export function ageToBucket(age: number): AgeBucket {
  if (age <= 4) return '3-4';
  if (age <= 6) return '5-6';
  return '7-8';
}

export interface ChildState {
  active: Child | null;
  allChildren: Child[];
  loading: boolean;
}

export const useChildStore = defineStore('child', {
  state: (): ChildState => ({
    active: null,
    allChildren: [],
    loading: false,
  }),

  getters: {
    activeChildId(): string | null { return this.active?.id ?? null; },
    activeAgeBucket(): AgeBucket {
      return this.active ? ageToBucket(this.active.age) : '5-6';
    },
    activePrimaryLang(): Locale {
      return (this.active?.primaryLang ?? 'zh') as Locale;
    },
    activeSecondLang(): Locale | 'none' {
      return this.active?.secondLang ?? 'none';
    },
  },

  actions: {
    async refreshActive(): Promise<void> {
      this.loading = true;
      try {
        const { data } = await api.deviceActiveChildGet();
        this.active = data.activeChild;
        this.allChildren = data.allChildren;
      } finally {
        this.loading = false;
      }
    },

    async setActive(childId: string, deviceId: string): Promise<void> {
      const { data } = await api.deviceActiveChildSet({ deviceId, childId });
      this.active = data.activeChild;
    },

    setActiveLocal(child: Child | null): void {
      this.active = child;
    },
  },
});
