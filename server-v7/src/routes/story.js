// ============================================================================
// /api/story/* — Story dialogue + generation + library, per API_CONTRACT §七
//
// Endpoints:
//   POST   /api/story/dialogue/start            (§7.2) device token
//   POST   /api/story/dialogue/:id/turn         (§7.3) device token — audioBase64 patch v3
//   POST   /api/story/generate                  (§7.4) device token
//   GET    /api/story/:id/status                (§7.5) device token
//   GET    /api/story/:id                       (§7.6) device OR parent token
//   GET    /api/story/list                      (§7.7) device OR parent token
//   POST   /api/story/:id/favorite              (§7.8) device OR parent token
//   DELETE /api/story/:id                       (§7.9) device OR parent token
//   POST   /api/story/:id/play-stat             (§7.10) device token
//
// Dependencies:
//   fastify.prisma, fastify.redis, fastify.storyQueue
// ============================================================================

import { ErrorCodes } from '../utils/errorCodes.js';
import { BizError } from '../utils/response.js';
import {
  buildDialogueSystemPrompt,
  roundCountForAge,
} from '../utils/storyPrompt.js';
import { pickOpener, pickTone } from '../data/dialoguePromptPool.js';
import { getOpenerTtsUrl } from '../services/staticTtsCache.js';
import { classify as classifySafety } from '../utils/contentSafety.js';
import { generateDialogueTurn, defaultDialogueQuestion } from '../services/llm.js';
import { synthesize as ttsSynthesize } from '../services/tts.js';
import { transcribe as asrTranscribe } from '../services/asr.js';
import { nanoid } from 'nanoid';

const DIALOGUE_TTL_SECONDS = 30 * 60; // 30 min
const MAX_DIALOGUE_ROUNDS = 7;
const FREE_DAILY_LIMIT = 3; // per device per day

function dialogueKey(dialogueId) {
  return `dialog:session:${dialogueId}`;
}
function dailyLimitKey(deviceId) {
  const day = new Date().toISOString().slice(0, 10);
  return `rate:story-gen:${deviceId}:${day}`;
}

async function loadDialogue(redis, dialogueId) {
  const raw = await redis.get(dialogueKey(dialogueId));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function saveDialogue(redis, dialogueId, session) {
  await redis.setex(
    dialogueKey(dialogueId),
    DIALOGUE_TTL_SECONDS,
    JSON.stringify(session),
  );
}

// Tiny helper: verify accepting either parent OR device token (for endpoints
// that list/get/delete stories).
async function verifyDualAuth(request, prisma) {
  const h = request.headers.authorization;
  if (typeof h !== 'string') throw new BizError(ErrorCodes.TOKEN_EXPIRED);
  const parts = h.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer' || !parts[1]) {
    throw new BizError(ErrorCodes.TOKEN_EXPIRED);
  }
  const token = parts[1];
  let payload;
  try {
    payload = request.server.jwt.verify(token);
  } catch {
    throw new BizError(ErrorCodes.TOKEN_EXPIRED);
  }
  // Blacklist
  const blKey = request.server.blacklistKeyFor?.(token);
  if (blKey) {
    const hit = await request.server.redis.get(blKey);
    if (hit) throw new BizError(ErrorCodes.TOKEN_REVOKED);
  }
  if (payload.type !== 'parent' && payload.type !== 'device') {
    throw new BizError(ErrorCodes.TOKEN_TYPE_MISMATCH);
  }
  request.auth = { type: payload.type, sub: payload.sub, payload, token };
}

function storyToDetail(story, viewerType = 'parent') {
  const out = {
    id: story.id,
    childId: story.childId,
    title: story.title,
    titleLearning: story.titleLearning ?? null,
    coverUrl: story.coverUrl ?? '',
    coverUrlHd: story.coverUrlHd ?? null,
    pages: Array.isArray(story.pages) ? story.pages : [],
    dialogue: story.dialogue ?? {},
    metadata: story.metadata ?? {},
    status: story.status,
    isPublic: story.isPublic,
    favorited: story.favorited,
    playCount: story.playCount,
  };
  if (viewerType === 'device') out.downloaded = false;
  return out;
}

function storyToSummary(story) {
  return {
    id: story.id,
    title: story.title,
    coverUrl: story.coverUrl ?? '',
    createdAt: story.createdAt.toISOString(),
    playCount: story.playCount,
    favorited: story.favorited,
    primaryLang: story.metadata?.primaryLang || 'en',
  };
}

export default async function storyRoutes(fastify) {
  const { prisma, redis } = fastify;

  // ------------------------------------------------------------------
  // 7.2 POST /api/story/dialogue/start
  // ------------------------------------------------------------------
  fastify.post(
    '/api/story/dialogue/start',
    { onRequest: [fastify.authenticateDevice] },
    async (request) => {
      const body = request.body ?? {};
      const { childId, targetLang, learningLang } = body;
      if (!childId) {
        throw new BizError(ErrorCodes.PARAM_MISSING, { details: { field: 'childId' } });
      }

      const device = await prisma.device.findUnique({
        where: { id: request.auth.sub },
        include: { parent: { include: { subscription: true } } },
      });
      if (!device) throw new BizError(ErrorCodes.DEVICE_NOT_FOUND);
      if (device.status !== 'bound') throw new BizError(ErrorCodes.DEVICE_NOT_ACTIVATED);

      // Verify child belongs to this parent
      const child = await prisma.child.findUnique({ where: { id: childId } });
      if (!child || child.parentId !== device.parentId) {
        throw new BizError(ErrorCodes.CHILD_NOT_FOUND);
      }

      // Quota gates — subscribers skip
      const subscribed = device.parent?.subscription?.status === 'active';
      if (!subscribed) {
        if (device.storiesLeft <= 0) {
          throw new BizError(ErrorCodes.QUOTA_EXHAUSTED, {
            details: { storiesLeft: 0 },
            actions: [{ label: '升级', labelEn: 'Upgrade', url: '/sub' }],
          });
        }
        const dailyCount = parseInt((await redis.get(dailyLimitKey(device.id))) || '0', 10);
        if (dailyCount >= FREE_DAILY_LIMIT) {
          throw new BizError(ErrorCodes.DAILY_LIMIT_REACHED, {
            details: { limit: FREE_DAILY_LIMIT },
          });
        }
      }

      const primary = targetLang || child.primaryLang || 'en';
      const learning = learningLang || child.secondLang || 'none';
      const roundCount = roundCountForAge(child.age);

      const dialogueId = `dlg_${nanoid(12)}`;

      // Pick a deterministic tone + opener for this session
      const tone = pickTone(dialogueId);
      const opener = pickOpener(primary, dialogueId);
      const openerLearning = learning !== 'none' ? pickOpener(learning, dialogueId) : null;

      const session = {
        dialogueId,
        deviceId: device.id,
        parentId: device.parentId,
        childId,
        childProfile: {
          id: child.id, name: child.name, age: child.age,
          primaryLang: primary, secondLang: learning,
        },
        toneId: tone.id,
        toneLines: tone.personalityLines,
        roundCount,
        currentRound: 1,
        history: [],
        createdAt: new Date().toISOString(),
      };
      await saveDialogue(redis, dialogueId, session);

      // Serve pre-warmed TTS; fall back to live synthesis if slot is empty.
      // Opener is the bear's first dialogue line → dialogue voice
      // (workorder 2026-04-29-tts-three-voice-roles).
      let ttsUrl = getOpenerTtsUrl(opener.lang, opener.index);
      if (!ttsUrl) {
        try {
          const tts = await ttsSynthesize({
            text: opener.text,
            lang: primary,
            purpose: 'dialogue',
          });
          ttsUrl = tts.audioUrl;
        } catch {
          ttsUrl = null;
        }
      }

      return {
        dialogueId,
        roundCount,
        firstQuestion: {
          text: opener.text,
          textLearning: openerLearning?.text ?? null,
          ttsUrl,
        },
      };
    },
  );

  // ------------------------------------------------------------------
  // 7.3 POST /api/story/dialogue/:id/turn  (supports audioBase64 patch v3)
  // ------------------------------------------------------------------
  fastify.post(
    '/api/story/dialogue/:id/turn',
    { onRequest: [fastify.authenticateDevice] },
    async (request) => {
      const { id } = request.params;
      const body = request.body ?? {};
      const { round, userInput, audioBase64, audioMimeType, skipRemaining = false } = body;

      if (typeof round !== 'number' || round < 1) {
        throw new BizError(ErrorCodes.PARAM_INVALID, {
          details: { field: 'round' },
        });
      }
      if (round > MAX_DIALOGUE_ROUNDS) {
        throw new BizError(ErrorCodes.DIALOGUE_ROUND_OVERFLOW);
      }
      if (!userInput && !audioBase64) {
        throw new BizError(ErrorCodes.PARAM_MISSING, {
          details: { reason: 'either userInput or audioBase64 required' },
        });
      }

      const session = await loadDialogue(redis, id);
      if (!session) {
        throw new BizError(ErrorCodes.STORY_NOT_FOUND, {
          details: { kind: 'dialogue', id },
        });
      }
      if (session.deviceId !== request.auth.sub) {
        throw new BizError(ErrorCodes.STORY_NOT_FOUND);
      }
      if (round > session.roundCount) {
        throw new BizError(ErrorCodes.DIALOGUE_ROUND_OVERFLOW);
      }

      // audioBase64 wins over userInput; run ASR if provided
      let text = userInput || '';
      let recognizedText = null;
      if (audioBase64) {
        try {
          const buf = Buffer.from(audioBase64, 'base64');
          if (!buf || buf.length < 4) throw new Error('audioBase64 decoded to empty buffer');
          const res = await asrTranscribe({
            audioBuffer: buf,
            mimeType: audioMimeType || 'audio/mpeg',
            locale: session.childProfile.primaryLang,
          });
          text = res.text;
          recognizedText = res.text;
        } catch (err) {
          throw new BizError(ErrorCodes.ASR_FAILED, { cause: err.message });
        }
      }

      // Content safety
      const safety = classifySafety(text, {
        mode: 'input',
        locale: session.childProfile.primaryLang,
      });
      if (safety.level === 'blocked') {
        throw new BizError(ErrorCodes.CONTENT_SAFETY_BLOCKED, {
          details: { reason: safety.reason, hits: safety.hits },
        });
      }

      // Append history, generate next question (or finish)
      session.history.push({ role: 'user', text, round });

      const done = skipRemaining && round >= 4 ? true : round >= session.roundCount;
      let nextQuestion = null;
      let summary = null;

      if (!done) {
        const basePrompt = buildDialogueSystemPrompt({
          age: session.childProfile.age,
          primaryLang: session.childProfile.primaryLang,
          learningLang: session.childProfile.secondLang,
        });
        const systemPrompt = session.toneLines
          ? `${basePrompt}\n\n${session.toneLines.join('\n')}`
          : basePrompt;
        // Defense in depth (workorder 2026-04-29-server-dialogue-llm-fix §3.3):
        // generateDialogueTurn now retries + falls back internally, but if the
        // whole call still throws we MUST NOT bubble null nextQuestion to the
        // client (TV would display "I didn't hear you" forever). On any error
        // we synthesize a default question so the dialogue always advances.
        let gen;
        try {
          gen = await generateDialogueTurn({
            systemPrompt,
            history: session.history,
            userInput: text,
            round,
            roundCount: session.roundCount,
            primaryLang: session.childProfile.primaryLang,
            learningLang: session.childProfile.secondLang,
          });
        } catch (err) {
          request.log.error(
            { err, dialogueId: id, round },
            'generateDialogueTurn threw; falling back to default question',
          );
          gen = null;
        }
        const candidate =
          gen && gen.nextQuestion && typeof gen.nextQuestion.text === 'string'
            && gen.nextQuestion.text.trim() !== ''
            ? gen.nextQuestion
            : defaultDialogueQuestion({
                round: round + 1,
                primaryLang: session.childProfile.primaryLang,
                learningLang: session.childProfile.secondLang,
              });
        nextQuestion = { round: round + 1, ...candidate, ttsUrl: null };

        // Pre-gen TTS for next question (non-fatal). The next dialogue
        // question is spoken by the bear → dialogue voice
        // (workorder 2026-04-29-tts-three-voice-roles).
        if (nextQuestion?.text) {
          try {
            const tts = await ttsSynthesize({
              text: nextQuestion.text,
              lang: session.childProfile.primaryLang,
              purpose: 'dialogue',
            });
            nextQuestion.ttsUrl = tts.audioUrl;
          } catch {
            // swallow; client still has text
          }
        }

        session.history.push({
          role: 'assistant',
          text: nextQuestion?.text || '',
          round: round + 1,
        });
        session.currentRound = round + 1;
      } else {
        // Synthesize a dialogue summary for the generate step
        summary = {
          mainCharacter:
            session.history.find((h) => h.round === 1)?.text ||
            session.childProfile.name,
          scene:
            session.history.find((h) => h.round === 2)?.text ||
            'a sunny meadow',
          conflict:
            session.history.find((h) => h.round === 3)?.text ||
            'a fun little problem',
          rounds: session.history.map((h) => ({
            q: h.role === 'assistant' ? h.text : null,
            a: h.role === 'user' ? h.text : null,
          })),
        };
        session.summary = summary;
      }

      await saveDialogue(redis, id, session);

      const resp = {
        round,
        done,
        nextQuestion,
        summary,
        safetyLevel: safety.level,
        safetyReplacement: safety.replacement,
      };
      if (recognizedText) resp.recognizedText = recognizedText;
      return resp;
    },
  );

  // ------------------------------------------------------------------
  // 7.4 POST /api/story/generate
  // ------------------------------------------------------------------
  fastify.post(
    '/api/story/generate',
    { onRequest: [fastify.authenticateDevice] },
    async (request, reply) => {
      const body = request.body ?? {};
      const { dialogueId, childId } = body;
      if (!dialogueId) {
        throw new BizError(ErrorCodes.PARAM_MISSING, { details: { field: 'dialogueId' } });
      }
      if (!childId) {
        throw new BizError(ErrorCodes.PARAM_MISSING, { details: { field: 'childId' } });
      }

      const session = await loadDialogue(redis, dialogueId);
      if (!session) {
        throw new BizError(ErrorCodes.STORY_NOT_FOUND, {
          details: { kind: 'dialogue', id: dialogueId },
        });
      }
      if (session.deviceId !== request.auth.sub || session.childId !== childId) {
        throw new BizError(ErrorCodes.CHILD_NOT_FOUND);
      }

      const device = await prisma.device.findUnique({
        where: { id: request.auth.sub },
        include: { parent: { include: { subscription: true } } },
      });
      if (!device) throw new BizError(ErrorCodes.DEVICE_NOT_FOUND);

      const subscribed = device.parent?.subscription?.status === 'active';
      const plan = device.parent?.subscription?.plan;
      const priority = plan === 'yearly' ? 'high' : 'normal';

      // Quota checks (LLM will actually decrement on success)
      if (!subscribed && device.storiesLeft <= 0) {
        throw new BizError(ErrorCodes.QUOTA_EXHAUSTED, {
          details: { storiesLeft: 0 },
          actions: [{ label: '升级', labelEn: 'Upgrade', url: '/sub' }],
        });
      }
      if (!subscribed) {
        const dailyCount = parseInt((await redis.get(dailyLimitKey(device.id))) || '0', 10);
        if (dailyCount >= FREE_DAILY_LIMIT) {
          throw new BizError(ErrorCodes.DAILY_LIMIT_REACHED, {
            details: { limit: FREE_DAILY_LIMIT },
          });
        }
        // Increment daily counter optimistically
        const newCount = dailyCount + 1;
        await redis.setex(dailyLimitKey(device.id), 86400, String(newCount));
      }

      // Create Story row in 'queued'
      const story = await prisma.story.create({
        data: {
          childId,
          deviceId: device.deviceId,
          title: '',
          status: 'queued',
          stage: 'queue',
          pagesGenerated: 0,
          metadata: {
            primaryLang: session.childProfile.primaryLang,
            learningLang: session.childProfile.secondLang || 'none',
            provider: 'mixed',
          },
        },
      });

      // Enqueue
      const queueDepth = fastify.storyQueue?.enqueue({
        storyId: story.id,
        deviceId: device.id,
        subscribed,
        priority,
        childProfile: session.childProfile,
        dialogueSummary: session.summary || {
          mainCharacter: session.childProfile.name,
          scene: 'a sunny meadow',
          conflict: 'a fun little problem',
          rounds: session.history.map((h) => ({
            q: h.role === 'assistant' ? h.text : null,
            a: h.role === 'user' ? h.text : null,
          })),
        },
      }) ?? 1;

      reply.code(202);
      return {
        storyId: story.id,
        status: 'queued',
        queuePosition: queueDepth,
        estimatedDurationSec: 75,
        priority,
      };
    },
  );

  // ------------------------------------------------------------------
  // 7.5 GET /api/story/:id/status
  // ------------------------------------------------------------------
  fastify.get(
    '/api/story/:id/status',
    { onRequest: [fastify.authenticateDevice] },
    async (request) => {
      const { id } = request.params;
      const story = await prisma.story.findUnique({ where: { id } });
      if (!story) throw new BizError(ErrorCodes.STORY_NOT_FOUND);

      const device = await prisma.device.findUnique({ where: { id: request.auth.sub } });
      if (!device || story.deviceId !== device.deviceId) {
        throw new BizError(ErrorCodes.STORY_NOT_FOUND);
      }

      const percent =
        story.status === 'completed'
          ? 100
          : story.status === 'failed'
          ? 0
          : Math.round((story.pagesGenerated / 12) * 100);

      const error = story.status === 'failed' ? {
        code: story.failureCode ?? ErrorCodes.STORY_GEN_FAILED,
        message: story.failureMessage || 'Story generation failed',
        retriable: story.failureCode !== ErrorCodes.CONTENT_SAFETY_BLOCKED,
      } : null;

      return {
        storyId: story.id,
        status: story.status,
        progress: {
          stage: story.stage,
          pagesGenerated: story.pagesGenerated,
          totalPages: 12,
          percent,
        },
        error,
        completedAt: story.completedAt?.toISOString() || null,
      };
    },
  );

  // ------------------------------------------------------------------
  // 7.6 GET /api/story/:id  (dual auth)
  // ------------------------------------------------------------------
  fastify.get('/api/story/:id', async (request) => {
    await verifyDualAuth(request, prisma);
    const { id } = request.params;
    const story = await prisma.story.findUnique({ where: { id } });
    if (!story) throw new BizError(ErrorCodes.STORY_NOT_FOUND);
    if (story.status !== 'completed') {
      throw new BizError(ErrorCodes.STORY_NOT_READY, {
        details: { status: story.status, stage: story.stage },
      });
    }

    const { type, sub } = request.auth;
    if (type === 'parent') {
      const child = await prisma.child.findUnique({ where: { id: story.childId } });
      if (!child || child.parentId !== sub) {
        throw new BizError(ErrorCodes.STORY_NOT_FOUND);
      }
    } else {
      const device = await prisma.device.findUnique({ where: { id: sub } });
      if (!device || story.deviceId !== device.deviceId) {
        throw new BizError(ErrorCodes.STORY_NOT_FOUND);
      }
    }

    return { story: storyToDetail(story, type) };
  });

  // ------------------------------------------------------------------
  // 7.7 GET /api/story/list  (dual auth)
  // ------------------------------------------------------------------
  fastify.get('/api/story/list', async (request) => {
    await verifyDualAuth(request, prisma);
    const q = request.query || {};
    const { cursor, childId: queryChildId, onlyFavorited } = q;
    const limit = Math.min(parseInt(q.limit || '20', 10), 50);
    const sort = q.sort || 'newest';
    const { type, sub } = request.auth;

    let childId = queryChildId;
    if (!childId && type === 'device') {
      const device = await prisma.device.findUnique({ where: { id: sub } });
      if (!device) throw new BizError(ErrorCodes.DEVICE_NOT_FOUND);
      childId = device.activeChildId;
    }
    if (!childId) {
      throw new BizError(ErrorCodes.PARAM_MISSING, { details: { field: 'childId' } });
    }

    // Ownership check
    const child = await prisma.child.findUnique({ where: { id: childId } });
    if (!child) throw new BizError(ErrorCodes.CHILD_NOT_FOUND);
    if (type === 'parent' && child.parentId !== sub) {
      throw new BizError(ErrorCodes.CHILD_NOT_FOUND);
    }
    if (type === 'device') {
      const device = await prisma.device.findUnique({ where: { id: sub } });
      if (!device || device.parentId !== child.parentId) {
        throw new BizError(ErrorCodes.CHILD_NOT_FOUND);
      }
    }

    const where = { childId, status: 'completed' };
    if (onlyFavorited === true || onlyFavorited === 'true') where.favorited = true;

    const orderBy =
      sort === 'most_played'
        ? [{ playCount: 'desc' }, { createdAt: 'desc' }]
        : sort === 'favorited'
        ? [{ favorited: 'desc' }, { createdAt: 'desc' }]
        : [{ createdAt: 'desc' }];

    const items = await prisma.story.findMany({
      where,
      orderBy,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const total = await prisma.story.count({ where });

    let nextCursor = null;
    if (items.length > limit) {
      const nextItem = items.pop();
      nextCursor = nextItem.id;
    }

    return {
      items: items.map(storyToSummary),
      nextCursor,
      total,
    };
  });

  // ------------------------------------------------------------------
  // 7.8 POST /api/story/:id/favorite  (dual auth)
  // ------------------------------------------------------------------
  fastify.post('/api/story/:id/favorite', async (request) => {
    await verifyDualAuth(request, prisma);
    const { id } = request.params;
    const body = request.body ?? {};
    if (typeof body.favorited !== 'boolean') {
      throw new BizError(ErrorCodes.PARAM_INVALID, {
        details: { field: 'favorited', expectedType: 'boolean' },
      });
    }
    const story = await prisma.story.findUnique({ where: { id } });
    if (!story) throw new BizError(ErrorCodes.STORY_NOT_FOUND);

    // Ownership
    await assertStoryOwnership(prisma, request, story);

    const updated = await prisma.story.update({
      where: { id },
      data: { favorited: body.favorited },
    });
    return { storyId: updated.id, favorited: updated.favorited };
  });

  // ------------------------------------------------------------------
  // 7.9 DELETE /api/story/:id  (dual auth)
  // ------------------------------------------------------------------
  fastify.delete('/api/story/:id', async (request) => {
    await verifyDualAuth(request, prisma);
    const { id } = request.params;
    const story = await prisma.story.findUnique({ where: { id } });
    if (!story) throw new BizError(ErrorCodes.STORY_NOT_FOUND);
    await assertStoryOwnership(prisma, request, story);
    await prisma.story.delete({ where: { id } });
    return { deleted: true };
  });

  // ------------------------------------------------------------------
  // 7.10 POST /api/story/:id/play-stat
  // ------------------------------------------------------------------
  fastify.post(
    '/api/story/:id/play-stat',
    { onRequest: [fastify.authenticateDevice] },
    async (request) => {
      const { id } = request.params;
      const body = request.body ?? {};
      const { event, pageNum, durationMs } = body;
      if (!event || !['start', 'page_end', 'complete', 'abort'].includes(event)) {
        throw new BizError(ErrorCodes.PARAM_INVALID, { details: { field: 'event' } });
      }
      const story = await prisma.story.findUnique({ where: { id } });
      if (!story) throw new BizError(ErrorCodes.STORY_NOT_FOUND);

      const device = await prisma.device.findUnique({ where: { id: request.auth.sub } });
      if (!device || story.deviceId !== device.deviceId) {
        throw new BizError(ErrorCodes.STORY_NOT_FOUND);
      }

      if (event === 'complete') {
        await prisma.story.update({
          where: { id },
          data: { playCount: { increment: 1 } },
        });
      }
      request.log.info({ storyId: id, event, pageNum, durationMs }, 'play-stat');
      return null;
    },
  );
}

async function assertStoryOwnership(prisma, request, story) {
  const { type, sub } = request.auth;
  if (type === 'parent') {
    const child = await prisma.child.findUnique({ where: { id: story.childId } });
    if (!child || child.parentId !== sub) {
      throw new BizError(ErrorCodes.STORY_NOT_FOUND);
    }
  } else {
    const device = await prisma.device.findUnique({ where: { id: sub } });
    if (!device || story.deviceId !== device.deviceId) {
      throw new BizError(ErrorCodes.STORY_NOT_FOUND);
    }
  }
}
