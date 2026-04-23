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

      const pagesWithImages = [];
      let totalCostCents = 0;
      const pages = storyJson.pages;

      // Simple sequential loop; could parallelize with Promise.all and a
      // semaphore — deferred to Phase 2 tuning.
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const imgResult = await generatePageImage({
          imagePrompt: page.imagePrompt,
          characterDesc: storyJson.characterDescription,
          pageNum: page.pageNum,
          seed: `${storyId}:${page.pageNum}`,
          onAttempt: async (att) => {
            try {
              await prisma.imageGenLog.create({
                data: {
                  storyId,
                  pageNum: page.pageNum,
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
          },
        });

        pagesWithImages.push({
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
        totalCostCents += imgResult.costCents;

        await prisma.story.update({
          where: { id: storyId },
          data: { pagesGenerated: i + 1 },
        });
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

      await prisma.story.update({
        where: { id: storyId },
        data: {
          stage: 'done',
          status: 'completed',
          pagesGenerated: 12,
          coverUrl,
          coverUrlHd,
          pages: pagesWithImages,
          dialogue: job.dialogueSummary,
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
