// ============================================================================
// queues/storyJob.js — in-process story generation pipeline.
//
// Phase 1 decision (HANDOFF_BATCH4): NO BullMQ. Single in-process queue with
// FIFO ordering + priority lane for yearly subscribers. Phase 2 can swap this
// to BullMQ by keeping the same enqueue() / getStatus() shape.
//
// Pipeline stages (Story.stage):
//   queue  → llm  → image  → tts  → assembly  → done
//
// Side effects per story:
//   - updates Story.status / stage / pagesGenerated / failureCode
//   - writes ImageGenLog row for each image attempt
//   - decrements Device.storiesLeft (once, after LLM succeeds)
//   - runs off the request thread (setImmediate scheduling)
//
// The queue is a singleton attached to the Fastify app instance via a plugin.
// Tests can instantiate createStoryQueue(prisma) directly and drive it
// synchronously with await queue.runNextUntilEmpty().
// ============================================================================

import { generateStoryJson } from '../services/llm.js';
import { generatePageImage } from '../services/imageGen.js';
import { synthesize as ttsSynthesize } from '../services/tts.js';
import { persistImage, persistImageHd } from '../services/mediaStorage.js';
import { buildStorySystemPrompt } from '../utils/storyPrompt.js';

// ---------------------------------------------------------------------------
// Prompt-override helper (2026-04-27 task 7 — simplified after STYLE rollback)
//
// Production: pass-through (page.imagePrompt unchanged).
// Test only:  DORA_TEST_P12_OVERRIDE=1 swaps P12 with the Dora seed-frame
//             prompt. Default OFF so normal production stories are unaffected.
// ---------------------------------------------------------------------------
const DORA_P12_SEED_PROMPT = (
  'A 5-year-old girl named Dora as the main subject, centered in the frame, '
  + 'with long brown curly hair clearly visible, wearing a yellow skirt and '
  + 'white sleeveless top distinctly painted, laughing joyfully with a warm '
  + 'gentle expression, arms outstretched, two cloud friends (one pink, one '
  + 'white) dancing under a brilliant rainbow in the sky behind her, red '
  + 'flowers blooming on the green grass around her, warm golden afternoon '
  + 'light bathing her clearly, magical happy ending atmosphere, full body '
  + 'view of Dora.'
);

function applyImagePromptOverrides(page) {
  // Production default: pass-through (Kai-baseline behavior).
  // The P1/P8 "big bright eyes" → "expressive eyes" defensive replacement
  // (originally added for the Carson-Ellis v1.3 STYLE that was rolled back)
  // proved unnecessary and was removed (2026-04-27 task 7).
  // DORA_TEST_P12_OVERRIDE=1 retained as a test affordance for the Dora
  // seed-frame prompt; off by default in production.
  if (
    page.pageNum === 12
    && (process.env.DORA_TEST_P12_OVERRIDE === '1'
      || process.env.DORA_TEST_P12_OVERRIDE === 'true')
  ) {
    return DORA_P12_SEED_PROMPT;
  }
  return page.imagePrompt;
}

export function createStoryQueue(prisma, options = {}) {
  const high = [];
  const normal = [];
  let running = false;
  // maxPagesConcurrent retained in API surface for backward-compat with
  // existing tests/callers, but ignored after 2026-04-27 task 3 refactor —
  // pages 2-12 now run strictly sequential for chained-reference consistency.
  // eslint-disable-next-line no-unused-vars
  const maxPagesConcurrent = options.maxPagesConcurrent || 1;

  function enqueue(job) {
    const lane = job.priority === 'high' ? high : normal;
    lane.push(job);
    return lane.length;
  }

  function queueDepth(priority = 'normal') {
    return priority === 'high' ? high.length : normal.length;
  }

  function dequeue() {
    if (high.length > 0) return high.shift();
    return normal.shift();
  }

  async function runOne(job) {
    const { storyId } = job;

    try {
      // ---------- Stage: queue → llm ----------
      await prisma.story.update({
        where: { id: storyId },
        data: { stage: 'llm', status: 'generating' },
      });

      const storyJson = await generateStoryJson({
        systemPrompt: buildStorySystemPrompt(job.childProfile),
        dialogueSummary: job.dialogueSummary,
        childProfile: job.childProfile,
      });

      // Decrement storiesLeft ONCE LLM succeeds, only for non-subscribers.
      if (job.deviceId && !job.subscribed) {
        await prisma.device.updateMany({
          where: { id: job.deviceId, storiesLeft: { gt: 0 } },
          data: { storiesLeft: { decrement: 1 } },
        });
      }

      // ---------- Stage: llm → image ----------
      await prisma.story.update({
        where: { id: storyId },
        data: {
          stage: 'image',
          title: storyJson.title,
          titleLearning: storyJson.titleEn,
          characterDescription: storyJson.characterDescription,
        },
      });

      const pages = storyJson.pages;
      const pagesWithImages = new Array(pages.length);
      let totalCostCents = 0;

      // -- helper: invoke image generator for one page and record the result ---
      const logAttempt = (pageNum) => async (att) => {
        try {
          await prisma.imageGenLog.create({
            data: {
              storyId,
              pageNum,
              provider: att.provider,
              tier: att.tier,
              success: att.success,
              durationMs: att.durationMs,
              costCents: att.costCents,
              errorCode: att.errorCode,
              errorMessage: att.errorMessage,
            },
          });
        } catch {
          // log failure is non-fatal
        }
      };

      // -- helper: persist a freshly-generated image to R2 (webp + png HD) ---
      // Mutates imgResult.imageUrl / imageUrlHd in place. Failure of either
      // upload is logged + tolerated (we keep the original upstream URL so
      // the story can still complete).
      const persistImageOutputs = async (imgResult, pageNum) => {
        if (!imgResult?.imageUrl) return imgResult;
        if (imgResult.provider === 'placeholder') return imgResult;
        const persistMeta = { storyId, pageNum, provider: imgResult.provider };
        const [webp, png] = await Promise.allSettled([
          persistImage(imgResult.imageUrl, persistMeta),
          persistImageHd(imgResult.imageUrl, persistMeta),
        ]);
        if (webp.status === 'fulfilled') {
          imgResult.imageUrl = webp.value.persistedUrl;
          imgResult.r2KeyWebp = webp.value.r2Key || null;
        } else {
          // eslint-disable-next-line no-console
          console.error(
            `[storyJob ${storyId}] persistImage(webp) p${pageNum}:`,
            webp.reason?.message || webp.reason,
          );
          imgResult.persistError = String(webp.reason?.message || webp.reason).slice(0, 500);
        }
        if (png.status === 'fulfilled') {
          imgResult.imageUrlHd = png.value.persistedUrl;
          imgResult.r2KeyPng = png.value.r2Key || null;
        } else {
          // eslint-disable-next-line no-console
          console.error(
            `[storyJob ${storyId}] persistImage(png) p${pageNum}:`,
            png.reason?.message || png.reason,
          );
          imgResult.persistError =
            (imgResult.persistError ? imgResult.persistError + ' | ' : '') +
            String(png.reason?.message || png.reason).slice(0, 500);
        }
        return imgResult;
      };

      const materializePage = (page, imgResult) => ({
        pageNum: page.pageNum,
        imageUrl: imgResult.imageUrl,
        imageUrlHd: imgResult.imageUrlHd,
        text: page.text?.[job.childProfile.primaryLang] || page.text?.en || '',
        textLearning:
          job.childProfile.secondLang && job.childProfile.secondLang !== 'none'
            ? page.text?.[job.childProfile.secondLang] || null
            : null,
        emotion: page.emotion,
      });

      // ---------- Cover first (page 1) — Nano Banana Pro → OpenAI → FAL ----
      const coverSrc = pages.find((p) => p.pageNum === 1) || pages[0];
      const coverIdx = pages.indexOf(coverSrc);
      const coverResult = await generatePageImage({
        imagePrompt: applyImagePromptOverrides(coverSrc),
        characterDesc: storyJson.characterDescription,
        pageNum: coverSrc.pageNum,
        seed: `${storyId}:${coverSrc.pageNum}`,
        onAttempt: logAttempt(coverSrc.pageNum),
        childAge: job.childProfile?.age ?? null,
      });
      // Push cover to R2 BEFORE pages 2-12 — they'll use the R2 URL as the
      // FAL kontext reference image, so we need a stable URL that won't 404
      // 24 hours later.
      await persistImageOutputs(coverResult, coverSrc.pageNum);
      pagesWithImages[coverIdx] = materializePage(coverSrc, coverResult);
      totalCostCents += coverResult.costCents;
      await prisma.story.update({
        where: { id: storyId },
        data: { pagesGenerated: 1 },
      });

      // ---------- Pages 2-12 — strict sequential chained reference --------
      // 2026-04-27 (task 3): switched from parallel batches to strict serial
      // chained reference (P2 ref P1, P3 ref P2, ..., P12 ref P11) so character
      // consistency carries through the whole book.
      //
      // Q1 D safety net: if any page falls through to placeholder, the next
      // page's reference falls back to the cover URL (instead of breaking the
      // whole chain). This keeps the rest of the book aligned to the cover at
      // worst.
      //
      // If cover itself fell through to placeholder, the entire chain is forced
      // to text2image (no reference available).
      const coverIsPlaceholder = coverResult.provider === 'placeholder';
      const coverRefUrl = coverIsPlaceholder ? null : coverResult.imageUrl;
      if (coverIsPlaceholder) {
        console.warn(`[storyJob ${storyId}] cover is placeholder — pages 2-12 forced to text2image`);
      }
      const restIndices = pages
        .map((_, i) => i)
        .filter((i) => i !== coverIdx)
        .sort((a, b) => pages[a].pageNum - pages[b].pageNum);
      // Reference strategy (2026-04-27 task 7):
      //   default = COVER-ANCHORED (Kai-baseline behavior, all P2-P12 ref cover)
      //   USE_CHAINED_REF=1 → chained (P_n refs P_{n-1}, original Phase A choice)
      // Cover-anchored eliminates accumulated drift across 11 pages and matches
      // the consistency profile of the proven Kai baseline. Chained ref kept
      // behind env flag for revert if needed.
      const USE_CHAINED = (
        process.env.USE_CHAINED_REF === '1'
        || process.env.USE_CHAINED_REF === 'true'
      );
      let prevRefUrl = coverRefUrl;
      let finished = 1;
      for (const i of restIndices) {
        const page = pages[i];
        const refForThisPage = USE_CHAINED ? prevRefUrl : coverRefUrl;
        const imgResult = await generatePageImage({
          imagePrompt: applyImagePromptOverrides(page),
          characterDesc: storyJson.characterDescription,
          pageNum: page.pageNum,
          referenceImageUrl: refForThisPage,
          forceText2Image: !refForThisPage,
          seed: `${storyId}:${page.pageNum}`,
          onAttempt: logAttempt(page.pageNum),
        });
        await persistImageOutputs(imgResult, page.pageNum);
        pagesWithImages[i] = materializePage(page, imgResult);
        totalCostCents += imgResult.costCents;
        // Chained-mode bookkeeping: advance prevRefUrl only on real success.
        if (USE_CHAINED) {
          if (imgResult.provider !== 'placeholder' && imgResult.imageUrl) {
            prevRefUrl = imgResult.imageUrl;
          } else {
            prevRefUrl = coverRefUrl;
          }
        }
        finished += 1;
        await prisma.story.update({
          where: { id: storyId },
          data: { pagesGenerated: finished },
        }).catch(() => {});
      }

      // ---------- Stage: image → tts ----------
      await prisma.story.update({
        where: { id: storyId },
        data: { stage: 'tts' },
      });

      for (const p of pagesWithImages) {
        try {
          const tts = await ttsSynthesize({
            text: p.text,
            lang: job.childProfile.primaryLang,
            storyId,
            pageNum: p.pageNum,
          });
          p.ttsUrl = tts.audioUrl;
          p.durationMs = tts.durationMs;
        } catch (err) {
          p.ttsUrl = null;
          p.durationMs = null;
        }
        if (p.textLearning) {
          try {
            const tts2 = await ttsSynthesize({
              text: p.textLearning,
              lang: job.childProfile.secondLang,
              storyId,
              pageNum: p.pageNum,
            });
            p.ttsUrlLearning = tts2.audioUrl;
          } catch {
            p.ttsUrlLearning = null;
          }
        }
      }

      // ---------- Stage: tts → assembly → done ----------
      const coverUrl = pagesWithImages[0]?.imageUrl || null;
      const coverUrlHd = pagesWithImages[0]?.imageUrlHd || null;
      const totalDuration = pagesWithImages.reduce(
        (sum, p) => sum + (p.durationMs || 0),
        0,
      );

      // Per API_ACTUAL_FORMAT §7.6 / TV+H5 shared Story type: Story.dialogue is
      // { summary: { mainCharacter, scene, conflict }, rounds: [{ q, a }, ...] }.
      // The session-side summary has the three fields at the same level as
      // `rounds`; reshape to the contract before persisting.
      const ds = job.dialogueSummary || {};
      const dialogueField = {
        summary: {
          mainCharacter: ds.mainCharacter ?? '',
          scene: ds.scene ?? '',
          conflict: ds.conflict ?? '',
        },
        rounds: Array.isArray(ds.rounds) ? ds.rounds : [],
      };

      await prisma.story.update({
        where: { id: storyId },
        data: {
          stage: 'done',
          status: 'completed',
          pagesGenerated: 12,
          coverUrl,
          coverUrlHd,
          pages: pagesWithImages,
          dialogue: dialogueField,
          metadata: {
            primaryLang: job.childProfile.primaryLang,
            learningLang: job.childProfile.secondLang || 'none',
            duration: Math.round(totalDuration / 1000),
            provider: 'mixed',
            createdAt: new Date().toISOString(),
          },
          genCostCents: totalCostCents,
          completedAt: new Date(),
        },
      });
    } catch (err) {
      await prisma.story.update({
        where: { id: storyId },
        data: {
          status: 'failed',
          stage: 'done',
          failureCode: classifyErrorCode(err),
          failureMessage: String(err?.message || err).slice(0, 500),
        },
      }).catch(() => {});
    }
  }

  async function pump() {
    if (running) return;
    running = true;
    try {
      let job;
      // eslint-disable-next-line no-cond-assign
      while ((job = dequeue())) {
        await runOne(job);
      }
    } finally {
      running = false;
    }
  }

  function scheduleNext() {
    // Defer to next tick so we return quickly from the route handler.
    setImmediate(() => {
      pump().catch(() => {});
    });
  }

  /** Synchronously drive the queue to empty — used by smoke tests. */
  async function runNextUntilEmpty() {
    if (running) {
      // Wait for the in-flight pump to finish.
      while (running) await new Promise((r) => setImmediate(r));
    }
    await pump();
  }

  return {
    enqueue(job) {
      const pos = enqueue(job);
      scheduleNext();
      return pos;
    },
    queueDepth,
    runNextUntilEmpty,
    // For tests: run synchronously instead of via setImmediate
    async runImmediate(job) {
      enqueue(job);
      await pump();
    },
  };
}

function classifyErrorCode(err) {
  const msg = String(err?.message || err).toLowerCase();
  if (msg.includes('whisper') || msg.includes('asr')) return 30011;
  if (msg.includes('tts') || msg.includes('elevenlabs')) return 30003;
  if (msg.includes('image') || msg.includes('fal') || msg.includes('imagen') || msg.includes('openai image')) return 30002;
  return 30001;
}
