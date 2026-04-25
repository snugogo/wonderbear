// ============================================================================
// scripts/migrate-media-to-r2.mjs
//
// One-shot migration: walks every Story row, re-uploads images and audio to
// R2, then rewrites the Story.pages JSON with the new R2 URLs.
//
// Usage (run from server-v7/ with NODE_ENV pointing to .env on the VPS):
//
//   node scripts/migrate-media-to-r2.mjs --dry-run     # log only, no DB write
//   node scripts/migrate-media-to-r2.mjs               # really do it
//   node scripts/migrate-media-to-r2.mjs --skip-images # only audio
//   node scripts/migrate-media-to-r2.mjs --skip-audio  # only images
//   node scripts/migrate-media-to-r2.mjs --story <id>  # one story only
//
// Idempotency: rows whose URL already starts with R2_PUBLIC_URL are skipped,
// so re-runs are safe.
// ============================================================================

import { PrismaClient } from '@prisma/client';
import {
  persistImage,
  persistImageHd,
  persistAudio,
  isMockMode,
} from '../src/services/mediaStorage.js';
import env from '../src/config/env.js';

const prisma = new PrismaClient();

function parseArgs(argv) {
  const args = {
    dryRun: argv.includes('--dry-run'),
    skipImages: argv.includes('--skip-images'),
    skipAudio: argv.includes('--skip-audio'),
    storyId: null,
  };
  const i = argv.indexOf('--story');
  if (i >= 0 && argv[i + 1]) args.storyId = argv[i + 1];
  return args;
}

function isAlreadyR2(url, r2Base) {
  if (!url || typeof url !== 'string' || !r2Base) return false;
  return url.startsWith(r2Base);
}

function shortPreview(s) {
  if (!s) return '<empty>';
  if (typeof s !== 'string') return `<${typeof s}>`;
  if (s.startsWith('data:')) return `[base64 ${Math.round(s.length / 1024)}KB]`;
  return s.length > 64 ? s.slice(0, 64) + '…' : s;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  console.log(args.dryRun ? '== DRY RUN (no DB writes) ==' : '== MIGRATION MODE ==');
  if (args.skipImages) console.log('  -- skipping images');
  if (args.skipAudio) console.log('  -- skipping audio');
  if (args.storyId) console.log(`  -- only story=${args.storyId}`);

  if (isMockMode()) {
    console.error(
      '\n[abort] mediaStorage.isMockMode() === true. Either USE_MOCK_AI is set ' +
        'or R2_* env vars are missing. Migration would no-op. Aborting to avoid ' +
        'a silent skip.',
    );
    process.exit(2);
  }

  const r2Base = (env.R2_PUBLIC_URL || '').replace(/\/$/, '');
  if (!r2Base) {
    console.error('[abort] R2_PUBLIC_URL is empty');
    process.exit(2);
  }
  console.log(`R2 base: ${r2Base}`);
  console.log(`Bucket : ${env.R2_BUCKET_NAME}\n`);

  const where = args.storyId ? { id: args.storyId } : {};
  const stories = await prisma.story.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      pages: true,
      metadata: true,
      coverUrl: true,
      coverUrlHd: true,
      createdAt: true,
    },
  });

  console.log(`Found ${stories.length} stories\n`);

  const stats = {
    imageMigrated: 0,
    imageSkipped: 0,
    imageFailed: 0,
    audioMigrated: 0,
    audioSkipped: 0,
    audioFailed: 0,
    storiesUpdated: 0,
  };

  for (const story of stories) {
    const pages = Array.isArray(story.pages) ? story.pages : [];
    if (pages.length === 0) continue;

    const meta = story.metadata && typeof story.metadata === 'object' ? story.metadata : {};
    const primaryLang = meta.primaryLang || 'zh';
    const learningLang = meta.learningLang && meta.learningLang !== 'none' ? meta.learningLang : 'en';

    const newPages = [];
    let storyChanged = false;

    for (let i = 0; i < pages.length; i++) {
      const page = { ...pages[i] };
      const pageNum = page.pageNum || i + 1;

      // ---- images ----
      if (!args.skipImages && page.imageUrl) {
        if (isAlreadyR2(page.imageUrl, r2Base)) {
          stats.imageSkipped++;
        } else {
          try {
            if (args.dryRun) {
              console.log(
                `  [DRY-IMG] story=${story.id} p${pageNum} ${shortPreview(page.imageUrl)}`,
              );
            } else {
              const persistMeta = { storyId: story.id, pageNum, provider: 'migrate' };
              const [webp, png] = await Promise.all([
                persistImage(page.imageUrl, persistMeta),
                persistImageHd(page.imageUrl, persistMeta),
              ]);
              page.imageUrl = webp.persistedUrl;
              page.imageUrlHd = png.persistedUrl;
              storyChanged = true;
              console.log(
                `  IMG    story=${story.id} p${pageNum} → ${webp.sizeKb}KB webp + ${png.sizeKb}KB png`,
              );
            }
            stats.imageMigrated++;
          } catch (err) {
            console.error(`  IMG-FAIL story=${story.id} p${pageNum}: ${err.message}`);
            stats.imageFailed++;
          }
        }
      } else if (page.imageUrl) {
        stats.imageSkipped++;
      }

      // ---- primary-lang audio ----
      if (!args.skipAudio && page.ttsUrl) {
        if (isAlreadyR2(page.ttsUrl, r2Base)) {
          stats.audioSkipped++;
        } else {
          try {
            if (args.dryRun) {
              console.log(
                `  [DRY-AUD] story=${story.id} p${pageNum}/${primaryLang} ${shortPreview(page.ttsUrl)}`,
              );
            } else {
              const audio = await persistAudio(page.ttsUrl, {
                storyId: story.id,
                pageNum,
                lang: primaryLang,
                voiceId: 'migrate',
              });
              page.ttsUrl = audio.persistedUrl;
              storyChanged = true;
              console.log(
                `  AUD    story=${story.id} p${pageNum}/${primaryLang} → ${audio.sizeKb}KB`,
              );
            }
            stats.audioMigrated++;
          } catch (err) {
            console.error(
              `  AUD-FAIL story=${story.id} p${pageNum}/${primaryLang}: ${err.message}`,
            );
            stats.audioFailed++;
          }
        }
      } else if (page.ttsUrl) {
        stats.audioSkipped++;
      }

      // ---- learning-lang audio ----
      if (!args.skipAudio && page.ttsUrlLearning) {
        if (isAlreadyR2(page.ttsUrlLearning, r2Base)) {
          stats.audioSkipped++;
        } else {
          try {
            if (args.dryRun) {
              console.log(
                `  [DRY-AUD2] story=${story.id} p${pageNum}/${learningLang} ${shortPreview(page.ttsUrlLearning)}`,
              );
            } else {
              const audio = await persistAudio(page.ttsUrlLearning, {
                storyId: story.id,
                pageNum,
                lang: learningLang,
                voiceId: 'migrate',
              });
              page.ttsUrlLearning = audio.persistedUrl;
              storyChanged = true;
              console.log(
                `  AUD2   story=${story.id} p${pageNum}/${learningLang} → ${audio.sizeKb}KB`,
              );
            }
            stats.audioMigrated++;
          } catch (err) {
            console.error(
              `  AUD2-FAIL story=${story.id} p${pageNum}/${learningLang}: ${err.message}`,
            );
            stats.audioFailed++;
          }
        }
      } else if (page.ttsUrlLearning) {
        stats.audioSkipped++;
      }

      newPages.push(page);
    }

    // Sync top-level coverUrl / coverUrlHd from the (possibly updated) page 1
    const coverPage = newPages.find((p) => p.pageNum === 1) || newPages[0] || null;
    const updateData = { pages: newPages };
    if (coverPage && coverPage.imageUrl && coverPage.imageUrl !== story.coverUrl) {
      updateData.coverUrl = coverPage.imageUrl;
      storyChanged = true;
    }
    if (coverPage && coverPage.imageUrlHd && coverPage.imageUrlHd !== story.coverUrlHd) {
      updateData.coverUrlHd = coverPage.imageUrlHd;
      storyChanged = true;
    }

    if (storyChanged && !args.dryRun) {
      await prisma.story.update({
        where: { id: story.id },
        data: updateData,
      });
      stats.storiesUpdated++;
    }
  }

  console.log('\n=== Summary ===');
  console.log(
    `Image: migrated=${stats.imageMigrated} skipped=${stats.imageSkipped} failed=${stats.imageFailed}`,
  );
  console.log(
    `Audio: migrated=${stats.audioMigrated} skipped=${stats.audioSkipped} failed=${stats.audioFailed}`,
  );
  console.log(`Stories updated: ${stats.storiesUpdated}`);

  await prisma.$disconnect();
  if (stats.imageFailed > 0 || stats.audioFailed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('\n[fatal]', err);
  process.exit(1);
});
