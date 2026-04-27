/**
 * Demo story factory — used in dev/gallery sessions where the server is
 * not reachable but the screen needs a `storyStore.active` object that
 * is rich enough for StoryCover / StoryBody / StoryEnd / Learning to
 * render and exercise their key bindings.
 *
 * The data shape mirrors GalleryView.vue so screens behave identically
 * regardless of which entry point seeded the demo.
 */

import type { Story, StoryPage } from '@/services/api';
import { asset } from './assets';

export interface DemoStorySummary {
  id: string;
  title: string;
  coverUrl?: string;
  createdAt?: string;
  playCount?: number;
  favorited?: boolean;
  primaryLang?: string;
}

const PAGE_BGS = [
  'story/story_generic_forest.webp',
  'bg/bg_meadow.webp',
  'story/story_generic_ocean.webp',
  'bg/bg_seaside.webp',
  'story/story_generic_sky.webp',
];

const SAMPLE_PAGES_EN = [
  'Luna tiptoed deeper into the glowing forest, where every leaf whispered a secret.',
  'A small bear cub hummed a tune as fireflies danced around his ears.',
  'Beyond the river of stars, an ancient turtle waited with a folded map.',
  'The moonbridge creaked once, then opened a path made of soft, silver light.',
  'Brave little Mia tucked her acorn into her pocket and waved goodbye.',
  'Three tiny mice rolled a giant strawberry across the marble courtyard.',
];

const SAMPLE_PAGES_ZH = [
  '露娜蹑手蹑脚走进发光的森林,每片叶子都在低语秘密。',
  '小熊一边哼着歌,一边看萤火虫绕着耳朵飞舞。',
  '在群星之河的尽头,一只古老的乌龟拿着折叠的地图等待着。',
  '月亮桥吱呀一声,亮起一条由柔软银光铺成的路。',
  '勇敢的米娅把橡果放进口袋,挥手道别。',
  '三只小老鼠推着一颗巨大的草莓,穿过大理石庭院。',
];

export function buildDemoStoryPages(count = 12): StoryPage[] {
  return Array.from({ length: count }, (_, i) => ({
    pageNum: i + 1,
    imageUrl: asset(PAGE_BGS[i % PAGE_BGS.length] ?? PAGE_BGS[0]!),
    imageUrlHd: asset(PAGE_BGS[i % PAGE_BGS.length] ?? PAGE_BGS[0]!),
    text: SAMPLE_PAGES_EN[i % SAMPLE_PAGES_EN.length] ?? SAMPLE_PAGES_EN[0]!,
    textLearning: i % 2 === 0
      ? (SAMPLE_PAGES_ZH[i % SAMPLE_PAGES_ZH.length] ?? null)
      : null,
    ttsUrl: null,
    ttsUrlLearning: null,
    durationMs: 4000,
  }));
}

export function buildDemoStory(
  summary: DemoStorySummary,
  childId = 'demo-child',
): Story {
  const now = summary.createdAt ?? new Date().toISOString();
  return {
    id: summary.id,
    childId,
    title: summary.title,
    titleLearning: null,
    coverUrl: summary.coverUrl ?? '',
    pages: buildDemoStoryPages(12),
    dialogue: {
      summary: {
        mainCharacter: 'Luna',
        scene: 'glowing forest',
        conflict: 'lost the golden key',
      },
      rounds: [],
    },
    metadata: {
      primaryLang: (summary.primaryLang === 'zh' ? 'zh' : 'en'),
      learningLang: 'zh',
      provider: 'mock',
    },
    status: 'completed',
    isPublic: false,
    favorited: summary.favorited ?? false,
    playCount: summary.playCount ?? 0,
    createdAt: now,
    completedAt: now,
  };
}
