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
  buildDialogueFirstQuestion,
  buildDialogueSystemPromptV2,
  DIALOGUE_ARC_STEPS,
  roundCountForAge,
} from '../utils/storyPrompt.js';
import { pickOpener, pickTone } from '../data/dialoguePromptPool.js';
import { getOpenerTtsUrl } from '../services/staticTtsCache.js';
import { classify as classifySafety } from '../utils/contentSafety.js';
import { generateDialogueTurnV2 } from '../services/llm.js';
import {
  evaluateReply,
  shouldForceFinish,
} from '../services/dialogue-quality.js';
import { synthesize as ttsSynthesize } from '../services/tts.js';
import { transcribe as asrTranscribe } from '../services/asr.js';
import { nanoid } from 'nanoid';
import env from '../config/env.js';
import { orchestrateDialogue } from '../lib/dialogue_orchestrator.js';

// W3: v2-lite dialogue system prompt loader (cached at module level).
// Reads src/prompts/v2-lite/dialogue.system.txt once on first call, then
// returns the cached string for subsequent calls so we don't hit disk per
// request. Only invoked from the v2-lite branch — v1 path is unaffected.
import { readFile as _readFile_w3 } from 'node:fs/promises';
import { fileURLToPath as _fileURLToPath_w3 } from 'node:url';
import { dirname as _dirname_w3, join as _join_w3 } from 'node:path';

const __filename_w3 = _fileURLToPath_w3(import.meta.url);
const __dirname_w3 = _dirname_w3(__filename_w3);
let _v2LiteDialoguePromptCache = null;
async function loadV2LiteDialoguePrompt() {
  if (_v2LiteDialoguePromptCache) return _v2LiteDialoguePromptCache;
  const promptPath = _join_w3(
    __dirname_w3,
    '..',
    'prompts',
    'v2-lite',
    'dialogue.system.txt',
  );
  _v2LiteDialoguePromptCache = await _readFile_w3(promptPath, 'utf8');
  return _v2LiteDialoguePromptCache;
}

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
          if (env.ASR_DUMP_ENABLED === 'true') {
            try {
              const fs = (await import('node:fs'));
              fs.writeFileSync('/tmp/asr-dump-' + Date.now() + '.webm', buf);
              request.log.info({size: buf.length, mt: audioMimeType}, '[asr-dump] saved');
            } catch(e) {
              request.log.warn({err: e.message}, '[asr-dump] failed');
            }
          }
          // WO-1 §3.1 root-cause locale fix: session.childProfile.primaryLang
          // can go stale (Redis 30-min cache outlives a parent profile edit,
          // or the client sent a stale targetLang on /dialogue/start). Re-read
          // child.primaryLang from DB on every turn; fall back to session,
          // then env.ASR_LANGUAGE_DEFAULT.
          let asrLocale = session.childProfile?.primaryLang;
          try {
            const childFresh = await prisma.child.findUnique({
              where: { id: session.childId },
              select: { primaryLang: true },
            });
            if (childFresh?.primaryLang) {
              asrLocale = childFresh.primaryLang;
              if (asrLocale !== session.childProfile?.primaryLang) {
                request.log.warn(
                  { dialogueId: id, sessionLang: session.childProfile?.primaryLang, dbLang: asrLocale },
                  '[asr] session childProfile lang stale; using fresh DB lang',
                );
                session.childProfile.primaryLang = asrLocale;
              }
            }
          } catch (dbErr) {
            request.log.warn({ err: dbErr.message }, '[asr] fresh child lookup failed; using session lang');
          }
          if (!asrLocale) asrLocale = (env.ASR_LANGUAGE_DEFAULT || 'zh').slice(0, 2);
          const res = await asrTranscribe({
            audioBuffer: buf,
            mimeType: audioMimeType || 'audio/mpeg',
            locale: asrLocale,
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

      // === PROMPT_VERSION routing — workorder 2026-04-30-v2lite-w2 ===
      // Default 'v1' = Track B legacy path (byte-identical to pre-W2).
      // 'v2-lite' / 'v2-full' = orchestrator path (W3 will switch via env).
      if (env.PROMPT_VERSION === 'v1') {
      // ----- v7.2 co-creation flow ---------------------------------
      // 1) evaluate child reply quality (server-side adaptive signal)
      const previousQuestionText = (() => {
        // Most-recent assistant turn (the question the child was answering)
        for (let i = session.history.length - 1; i >= 0; i--) {
          if (session.history[i].role === 'assistant') return session.history[i].text;
        }
        return null;
      })();
      const quality = evaluateReply({
        replyText: text,
        previousQuestionText,
        locale: session.childProfile.primaryLang,
      });

      // 2) record the user turn (with quality signal) into history + arc state
      session.history.push({ role: 'user', text, round, quality });
      session.arc = session.arc || {};

      // 3) decide hard-cap conditions BEFORE calling LLM
      //    - skipRemaining (round >=4): user explicitly ended via OK key
      //    - hard cap: round === roundCount → must finish this turn
      //    - quality: 3+ consecutive 'empty' replies → force finish to avoid loop
      const reachedHardCap = round >= session.roundCount;
      const skipFinishing = skipRemaining === true && round >= 4;
      const emptyLoopFinishing = shouldForceFinish(
        session.history,
        session.childProfile.primaryLang,
      ) && round >= 3;
      const forceDone = reachedHardCap || skipFinishing || emptyLoopFinishing;

      // 4) call v7.2 LLM (built-in retry + default-bank fallback, never null)
      const llm = await generateDialogueTurnV2({
        systemPrompt: buildDialogueSystemPromptV2({
          age: session.childProfile.age,
          primaryLang: session.childProfile.primaryLang,
          learningLang: session.childProfile.secondLang,
          history: session.history,
          arc: session.arc,
          quality,
          suggestMode: quality.suggestMode,
          currentRound: round,
          roundCount: session.roundCount,
        }),
        history: session.history,
        userInput: text,
        round,
        roundCount: session.roundCount,
        primaryLang: session.childProfile.primaryLang,
        learningLang: session.childProfile.secondLang,
        forceDone,
      });

      // 5) merge arcUpdate into session arc state
      if (llm.arcUpdate && typeof llm.arcUpdate === 'object') {
        for (const step of DIALOGUE_ARC_STEPS) {
          if (typeof llm.arcUpdate[step] === 'string' && llm.arcUpdate[step].trim()) {
            session.arc[step] = llm.arcUpdate[step].trim();
          }
        }
      }

      // 6) determine final done flag — server-side hard cap wins
      const done = forceDone || llm.done === true;

      // 7) build nextQuestion + pre-gen TTS (only when not done)
      let nextQuestion = null;
      let storyOutline = null;

      if (done) {
        // Ensure storyOutline exists. If LLM didn't return one (e.g. forceDone
        // path with retry exhausted), fall back to the default bank outline
        // built from accumulated history.
        const ps =
          (llm.storyOutline && Array.isArray(llm.storyOutline.paragraphs))
            ? llm.storyOutline.paragraphs
            : null;
        storyOutline = (ps && ps.length >= 1)
          ? { paragraphs: ps.slice(0, 5) }
          : { paragraphs: [
              `${session.childProfile.name || 'The hero'} starts a small adventure.`,
              'A friend joins along the way.',
              'A gentle bump appears, but they solve it together.',
              'They walk home smiling under the warm sky.',
            ] };
        session.storyOutline = storyOutline;
        // Backfill summary so /story/generate (existing 12-page LLM) still works.
        session.summary = {
          mainCharacter:
            session.arc.character ||
            session.history.find((h) => h.role === 'user' && h.round === 1)?.text ||
            session.childProfile.name,
          scene: session.arc.setting || 'a sunny meadow',
          conflict: session.arc.obstacle || session.arc.goal || 'a fun little problem',
          outline: storyOutline.paragraphs,
          rounds: session.history.map((h) => ({
            q: h.role === 'assistant' ? h.text : null,
            a: h.role === 'user' ? h.text : null,
          })),
        };
        session.status = 'awaiting-confirm';
      } else if (llm.nextQuestion?.text) {
        nextQuestion = {
          round: round + 1,
          text: llm.nextQuestion.text,
          textLearning: llm.nextQuestion.textLearning ?? null,
          ttsUrl: null,
        };
        // Pre-gen TTS for next question (non-fatal). The next dialogue
        // question is spoken by the bear → dialogue voice
        // (workorder 2026-04-29-tts-three-voice-roles).
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
        session.history.push({
          role: 'assistant',
          text: nextQuestion.text,
          round: round + 1,
        });
        session.currentRound = round + 1;
      }

      await saveDialogue(redis, id, session);

      // 8) shape response — extends v7.1 envelope with v7.2 fields
      const resp = {
        round,
        done,
        // v7.2 additions:
        mode: llm.mode || (quality.suggestMode === 'auto' ? 'cheerleader' : quality.suggestMode),
        lastTurnSummary: typeof llm.lastTurnSummary === 'string' && llm.lastTurnSummary
          ? llm.lastTurnSummary
          : null,
        arcUpdate: llm.arcUpdate || null,
        // v7.1-compatible:
        nextQuestion,
        summary: done ? (session.summary || null) : null,
        // v7.2 storyOutline (TV uses this to drive StoryPreviewScreen):
        storyOutline,
        safetyLevel: safety.level,
        safetyReplacement: safety.replacement,
        _provider: llm._provider || null,
      };
      if (recognizedText) resp.recognizedText = recognizedText;
      return resp;
      }

      // === V2-LITE BRANCH (PROMPT_VERSION=v2-lite|v2-full) ===
      // W2 wires the v2-lite path through dialogue_orchestrator. The actual
      // v2-lite SYSTEM_PROMPT comes in W3 — here we use a placeholder.
      // This branch is dormant in prod (default PROMPT_VERSION=v1).
      const v2OriginalHistory = Array.isArray(session.history)
        ? [...session.history]
        : [];

      const orchestratorSession = {
        history: v2OriginalHistory.map((h) => ({
          role: h.role === 'user' ? 'child' : h.role === 'assistant' ? 'bear' : h.role,
          text: h.text,
        })),
        elements: Array.isArray(session.elements) ? [...session.elements] : [],
        turnCount: typeof session.turnCount === 'number' ? session.turnCount : 0,
        recapCount: typeof session.recapCount === 'number' ? session.recapCount : 0,
        lastRecapTurn:
          typeof session.lastRecapTurn === 'number' ? session.lastRecapTurn : 0,
        lastRecapElementsCount:
          typeof session.lastRecapElementsCount === 'number'
            ? session.lastRecapElementsCount
            : 0,
        realWorldHooks: Array.isArray(session.realWorldHooks)
          ? [...session.realWorldHooks]
          : [],
      };

      const v2LiteLlmCallFn = async ({ history, elements, childInput }) => {
        // Mock-mode fallback so unit tests / CI don't need a real key.
        if (
          process.env.USE_MOCK_AI === 'true' ||
          process.env.USE_MOCK_AI === '1' ||
          !env.GEMINI_API_KEY
        ) {
          return JSON.stringify({
            reply: '小熊听到啦~ 然后呢?',
            elements: Array.isArray(elements) ? elements.slice(-3) : [],
            intent: 'continue',
          });
        }
        // Live Gemini 2.5 Flash call — same mechanism as services/llm.js.
        // W3: load v2-lite system prompt from file (cached at module level).
        const SYSTEM_PROMPT_PLACEHOLDER = await loadV2LiteDialoguePrompt();
        const userMsg =
          `[history]\n${JSON.stringify(history)}\n` +
          `[elements_so_far]\n${JSON.stringify(elements)}\n` +
          `[child_says]\n${childInput}`;
        const url =
          'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
        try {
          const httpResp = await fetch(`${url}?key=${env.GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [
                { role: 'user', parts: [{ text: SYSTEM_PROMPT_PLACEHOLDER }] },
                { role: 'model', parts: [{ text: 'OK.' }] },
                { role: 'user', parts: [{ text: userMsg }] },
              ],
              generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 400,
                responseMimeType: 'application/json',
                thinkingConfig: { thinkingBudget: 0 },
              },
            }),
          });
          if (!httpResp.ok) return null;
          const data = await httpResp.json();
          return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
        } catch {
          return null;
        }
      };

      const orchestratedResult = await orchestrateDialogue({
        session: orchestratorSession,
        childInput: text,
        llmCallFn: v2LiteLlmCallFn,
      });

      // Map orchestrator output → v1-compatible response shape.
      const v2Done = orchestratedResult.intent === 'recap';
      let v2NextQuestion = null;
      let v2StoryOutline = null;

      // Sync mutations back into session in v1-compatible shape.
      session.history = [
        ...v2OriginalHistory,
        { role: 'user', text, round },
      ];
      session.elements = orchestratorSession.elements;
      session.turnCount = orchestratorSession.turnCount;
      session.realWorldHooks = orchestratorSession.realWorldHooks;
      session.arc = session.arc || {};

      if (v2Done) {
        const els = Array.isArray(orchestratedResult.elements)
          ? orchestratedResult.elements.slice(0, 5).map((e) => String(e))
          : [];
        v2StoryOutline = els.length >= 1
          ? { paragraphs: els }
          : { paragraphs: [
              `${session.childProfile.name || 'The hero'} starts a small adventure.`,
              'A friend joins along the way.',
              'A gentle bump appears, but they solve it together.',
              'They walk home smiling under the warm sky.',
            ] };
        session.storyOutline = v2StoryOutline;
        session.summary = {
          mainCharacter: session.childProfile.name,
          scene: 'a sunny meadow',
          conflict: 'a fun little problem',
          outline: v2StoryOutline.paragraphs,
          rounds: session.history.map((h) => ({
            q: h.role === 'assistant' ? h.text : null,
            a: h.role === 'user' ? h.text : null,
          })),
        };
        session.status = 'awaiting-confirm';
      } else {
        v2NextQuestion = {
          round: round + 1,
          text: orchestratedResult.reply,
          textLearning: null,
          ttsUrl: null,
        };
        try {
          const tts = await ttsSynthesize({
            text: v2NextQuestion.text,
            lang: session.childProfile.primaryLang,
            purpose: 'dialogue',
          });
          v2NextQuestion.ttsUrl = tts.audioUrl;
        } catch {
          // swallow; client still has text
        }
        session.history.push({
          role: 'assistant',
          text: v2NextQuestion.text,
          round: round + 1,
        });
        session.currentRound = round + 1;
      }

      await saveDialogue(redis, id, session);

      const v2Resp = {
        round,
        done: v2Done,
        mode: 'storyteller',
        lastTurnSummary: null,
        arcUpdate: null,
        nextQuestion: v2NextQuestion,
        summary: v2Done ? (session.summary || null) : null,
        storyOutline: v2StoryOutline,
        safetyLevel: safety.level,
        safetyReplacement: safety.replacement,
        _provider: 'v2-lite',
        _promptVersion: env.PROMPT_VERSION,
      };
      if (recognizedText) v2Resp.recognizedText = recognizedText;
      return v2Resp;
    },
  );

  // ------------------------------------------------------------------
  // 7.3b POST /api/story/dialogue/:id/confirm  (v7.2 — story preview accept)
  //
  // Called by TV's StoryPreviewScreen after the child presses Enter on the
  // 3-5 paragraph outline. Triggers the same generation pipeline as
  // /api/story/generate. We do NOT inline /generate's body to avoid quota
  // double-charge — instead the route does its own lightweight enqueue
  // here so the client gets a single round-trip back to GeneratingScreen.
  // ------------------------------------------------------------------
  fastify.post(
    '/api/story/dialogue/:id/confirm',
    { onRequest: [fastify.authenticateDevice] },
    async (request, reply) => {
      const { id } = request.params;
      const session = await loadDialogue(redis, id);
      if (!session) {
        throw new BizError(ErrorCodes.STORY_NOT_FOUND, {
          details: { kind: 'dialogue', id },
        });
      }
      if (session.deviceId !== request.auth.sub) {
        throw new BizError(ErrorCodes.STORY_NOT_FOUND);
      }
      if (!session.storyOutline) {
        throw new BizError(ErrorCodes.PARAM_INVALID, {
          details: { reason: 'dialogue not finished — no storyOutline yet' },
        });
      }

      const device = await prisma.device.findUnique({
        where: { id: request.auth.sub },
        include: { parent: { include: { subscription: true } } },
      });
      if (!device) throw new BizError(ErrorCodes.DEVICE_NOT_FOUND);

      const subscribed = device.parent?.subscription?.status === 'active';
      const plan = device.parent?.subscription?.plan;
      const priority = plan === 'yearly' ? 'high' : 'normal';

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
        const newCount = dailyCount + 1;
        await redis.setex(dailyLimitKey(device.id), 86400, String(newCount));
      }

      const story = await prisma.story.create({
        data: {
          childId: session.childId,
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
          outline: session.storyOutline.paragraphs,
          rounds: session.history.map((h) => ({
            q: h.role === 'assistant' ? h.text : null,
            a: h.role === 'user' ? h.text : null,
          })),
        },
      }) ?? 1;

      session.status = 'confirmed';
      session.confirmedStoryId = story.id;
      await saveDialogue(redis, id, session);

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
