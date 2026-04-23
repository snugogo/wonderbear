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
import { buildStorySystemPrompt } from '../utils/storyPrompt.js';

export function createStoryQueue(prisma, options = {}) {
  const high = [];
  const normal = [];
  let running = false;
  const maxPagesConcurrent = options.maxPagesConcurrent || 3;

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

      // ---------- Cover first (page 1) — text2image (OpenAI → Gemini) -------
      const coverSrc = pages.find((p) => p.pageNum === 1) || pages[0];
      const coverIdx = pages.indexOf(coverSrc);
      const coverResult = await generatePageImage({
        imagePrompt: coverSrc.imagePrompt,
        characterDesc: storyJson.characterDescription,
        pageNum: coverSrc.pageNum,
        seed: `${storyId}:${coverSrc.pageNum}`,
        onAttempt: logAttempt(coverSrc.pageNum),
      });
      pagesWithImages[coverIdx] = materializePage(coverSrc, coverResult);
      totalCostCents += coverResult.costCents;
      await prisma.story.update({
        where: { id: storyId },
        data: { pagesGenerated: 1 },
      });

      // ---------- Pages 2-12 — img2img conditioned on the cover URL --------
      // Run up to maxPagesConcurrent at once so the founder-demo latency is
      // acceptable (12 pages sequential at ~6s each = 72s; parallel = ~30s).
      const referenceImageUrl = coverResult.imageUrl;
      const restIndices = pages
        .map((_, i) => i)
        .filter((i) => i !== coverIdx);
      const concurrency = maxPagesConcurrent;
      let finished = 1;
      for (let batchStart = 0; batchStart < restIndices.length; batchStart += concurrency) {
        const batch = restIndices.slice(batchStart, batchStart + concurrency);
        await Promise.all(batch.map(async (i) => {
          const page = pages[i];
          const imgResult = await generatePageImage({
            imagePrompt: page.imagePrompt,
            characterDesc: storyJson.characterDescription,
            pageNum: page.pageNum,
            referenceImageUrl,
            seed: `${storyId}:${page.pageNum}`,
            onAttempt: logAttempt(page.pageNum),
          });
          pagesWithImages[i] = materializePage(page, imgResult);
          totalCostCents += imgResult.costCents;
        }));
        finished += batch.length;
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
