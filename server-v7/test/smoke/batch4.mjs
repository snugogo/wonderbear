// ============================================================================
// Batch 4 smoke tests — story dialogue + generation + library + TTS
//
// Exercises the full story flow end-to-end in MOCK mode (USE_MOCK_AI=1).
// Reuses the batch 3 fake prisma / redis helpers, extended with story +
// imageGenLog tables and list ops that already exist in batch 3's fake redis.
// ============================================================================

process.env.USE_MOCK_AI = '1';

import Fastify from 'fastify';
import { ErrorCodes } from '../../src/utils/errorCodes.js';
import requestIdPlugin from '../../src/plugins/requestId.js';
import responseEnvelopePlugin from '../../src/plugins/responseEnvelope.js';
import errorHandlerPlugin from '../../src/plugins/errorHandler.js';
import authPlugin from '../../src/plugins/auth.js';
import storyQueuePlugin from '../../src/plugins/storyQueue.js';
import deviceRoutes from '../../src/routes/device.js';
import childRoutes from '../../src/routes/child.js';
import storyRoutes from '../../src/routes/story.js';
import ttsRoutes from '../../src/routes/tts.js';
import { signParentToken, signDeviceToken } from '../../src/utils/jwt.js';
import {
  sanitizeImagePrompt,
  SAFE_REPLACEMENTS,
  DANGEROUS_COMBOS_OPENAI,
  detectDangerousCombo,
  basicClean,
  roundCountForAge,
  buildDialogueFirstQuestion,
  buildStorySystemPrompt,
  STYLE_SUFFIXES,
} from '../../src/utils/storyPrompt.js';
import { classify as classifySafety } from '../../src/utils/contentSafety.js';

// -----------------------------------------------------------------------
// Fake Redis / Prisma — extended
// -----------------------------------------------------------------------
function makeFakeRedis() {
  const strings = new Map();
  const lists = new Map();
  const now = () => Date.now();
  const cleanupString = (k) => {
    const e = strings.get(k);
    if (e && e.expiresAt != null && e.expiresAt <= now()) strings.delete(k);
  };
  const cleanupList = (k) => {
    const e = lists.get(k);
    if (e && e.expiresAt != null && e.expiresAt <= now()) lists.delete(k);
  };
  return {
    async get(k) { cleanupString(k); return strings.get(k)?.value ?? null; },
    async set(k, v) { strings.set(k, { value: String(v), expiresAt: null }); return 'OK'; },
    async setex(k, ttl, v) { strings.set(k, { value: String(v), expiresAt: now() + ttl * 1000 }); return 'OK'; },
    async del(...keys) {
      let n = 0;
      for (const k of keys) { if (strings.delete(k)) n++; if (lists.delete(k)) n++; }
      return n;
    },
    async expire(k, ttl) {
      const s = strings.get(k); if (s) { s.expiresAt = now() + ttl * 1000; return 1; }
      const l = lists.get(k); if (l) { l.expiresAt = now() + ttl * 1000; return 1; }
      return 0;
    },
    async ttl(k) {
      cleanupString(k); cleanupList(k);
      const e = strings.get(k) ?? lists.get(k);
      if (!e) return -2;
      if (e.expiresAt == null) return -1;
      return Math.max(0, Math.ceil((e.expiresAt - now()) / 1000));
    },
    async incr(k) {
      cleanupString(k);
      const e = strings.get(k);
      const next = (e ? parseInt(e.value, 10) : 0) + 1;
      strings.set(k, { value: String(next), expiresAt: e?.expiresAt ?? null });
      return next;
    },
    async rpush(k, ...vs) {
      cleanupList(k);
      const e = lists.get(k) ?? { items: [], expiresAt: null };
      for (const v of vs) e.items.push(String(v));
      lists.set(k, e);
      return e.items.length;
    },
    async lrange(k, start, stop) {
      cleanupList(k);
      const e = lists.get(k); if (!e) return [];
      const len = e.items.length;
      const s = start < 0 ? Math.max(0, len + start) : Math.min(start, len);
      const t = stop < 0 ? len + stop : Math.min(stop, len - 1);
      if (t < s) return [];
      return e.items.slice(s, t + 1);
    },
    async lrem(k, count, value) {
      cleanupList(k);
      const e = lists.get(k); if (!e) return 0;
      const target = String(value); let removed = 0;
      if (count >= 0) {
        for (let i = 0; i < e.items.length && (count === 0 || removed < count); ) {
          if (e.items[i] === target) { e.items.splice(i, 1); removed++; } else i++;
        }
      }
      if (e.items.length === 0) lists.delete(k);
      return removed;
    },
    async ping() { return 'PONG'; },
  };
}

function makeFakePrisma() {
  const parents = new Map();
  const parentsByEmail = new Map();
  const devices = new Map();
  const devicesByDeviceId = new Map();
  const children = new Map();
  const activationCodes = new Map();
  const activationCodesByCode = new Map();
  const subscriptions = new Map();
  const stories = new Map();
  const imageLogs = [];
  let counter = 0;
  const cuid = (p) => `${p}_${++counter}_${Math.random().toString(36).slice(2, 8)}`;

  function hydrateDevice(d, include) {
    const out = { ...d };
    if (!include) return out;
    if (include.parent) {
      const p = d.parentId ? parents.get(d.parentId) : null;
      if (p && include.parent === true) out.parent = p;
      else if (p && typeof include.parent === 'object') {
        const pOut = { ...p };
        if (include.parent.include?.subscription) {
          pOut.subscription = Array.from(subscriptions.values()).find(s => s.parentId === p.id) ?? null;
        }
        if (include.parent.include?.children) {
          pOut.children = Array.from(children.values()).filter(c => c.parentId === p.id);
        }
        out.parent = pOut;
      } else out.parent = p;
    }
    if (include.activeChild) {
      out.activeChild = d.activeChildId ? children.get(d.activeChildId) ?? null : null;
    }
    if (include.oemConfig) out.oemConfig = null;
    if (include.activationCodeRef) out.activationCodeRef = d.activationCodeId ? activationCodes.get(d.activationCodeId) ?? null : null;
    return out;
  }

  function hydrateStory(s) { return { ...s }; }

  const api = {
    parent: {
      async findUnique({ where, include }) {
        let p = where?.id ? parents.get(where.id) : (where?.email ? parents.get(parentsByEmail.get(where.email)) : null);
        if (!p) return null;
        const out = { ...p };
        if (include?.subscription) out.subscription = Array.from(subscriptions.values()).find(s => s.parentId === p.id) ?? null;
        if (include?.devices) out.devices = Array.from(devices.values()).filter(d => d.parentId === p.id);
        if (include?.children) out.children = Array.from(children.values()).filter(c => c.parentId === p.id);
        return out;
      },
      async create({ data }) {
        const id = cuid('par');
        const p = { id, email: data.email, passwordHash: data.passwordHash ?? null, locale: data.locale ?? 'en', playBgm: true, failedLoginCount: 0, lockedUntil: null, lastLoginAt: null, createdAt: new Date(), updatedAt: new Date() };
        parents.set(id, p); parentsByEmail.set(p.email, id); return p;
      },
      async update({ where, data }) { const p = parents.get(where.id); Object.assign(p, data, { updatedAt: new Date() }); return { ...p }; },
    },
    device: {
      async findUnique({ where, include }) {
        let d = where?.id ? devices.get(where.id) : (where?.deviceId ? devices.get(devicesByDeviceId.get(where.deviceId)) : null);
        return d ? hydrateDevice(d, include) : null;
      },
      async findFirst({ where, include }) {
        for (const d of devices.values()) {
          if (where?.id && d.id !== where.id) continue;
          if (where?.deviceId && d.deviceId !== where.deviceId) continue;
          if (where?.parentId !== undefined && d.parentId !== where.parentId) continue;
          return hydrateDevice(d, include);
        }
        return null;
      },
      async findMany({ where, orderBy }) {
        let list = Array.from(devices.values());
        if (where?.parentId !== undefined) list = list.filter(d => d.parentId === where.parentId);
        return list.map(d => ({ ...d }));
      },
      async count({ where }) {
        let n = 0;
        for (const d of devices.values()) { if (where?.parentId !== undefined && d.parentId !== where.parentId) continue; n++; }
        return n;
      },
      async create({ data, include }) {
        const id = cuid('dev');
        const d = {
          id, deviceId: data.deviceId, activationCode: data.activationCode ?? null, activationCodeId: data.activationCodeId ?? null,
          parentId: data.parentId ?? null, activeChildId: data.activeChildId ?? null,
          oemId: data.oemId ?? null, batchCode: data.batchCode ?? null,
          status: data.status ?? 'activated_unbound', storiesLeft: data.storiesLeft ?? 0,
          model: data.model ?? 'GP15', firmwareVer: data.firmwareVer ?? null, osVersion: data.osVersion ?? null,
          hwFingerprint: data.hwFingerprint ?? null, boundAt: data.boundAt ?? null, lastSeenAt: data.lastSeenAt ?? null,
          createdAt: new Date(), updatedAt: new Date(),
        };
        devices.set(id, d); devicesByDeviceId.set(d.deviceId, id);
        return hydrateDevice(d, include);
      },
      async update({ where, data, include }) {
        const d = devices.get(where.id);
        for (const [k, v] of Object.entries(data)) {
          if (v && typeof v === 'object' && ('decrement' in v || 'increment' in v)) {
            const cur = d[k] ?? 0;
            d[k] = 'decrement' in v ? cur - v.decrement : cur + v.increment;
          } else d[k] = v;
        }
        d.updatedAt = new Date();
        return hydrateDevice(d, include);
      },
      async updateMany({ where, data }) {
        let n = 0;
        for (const d of devices.values()) {
          if (where?.activeChildId !== undefined && d.activeChildId !== where.activeChildId) continue;
          if (where?.id !== undefined && d.id !== where.id) continue;
          if (where?.storiesLeft?.gt !== undefined && !(d.storiesLeft > where.storiesLeft.gt)) continue;
          for (const [k, v] of Object.entries(data)) {
            if (v && typeof v === 'object' && ('decrement' in v || 'increment' in v)) {
              const cur = d[k] ?? 0;
              d[k] = 'decrement' in v ? cur - v.decrement : cur + v.increment;
            } else d[k] = v;
          }
          d.updatedAt = new Date(); n++;
        }
        return { count: n };
      },
    },
    child: {
      async findUnique({ where }) { return children.get(where.id) ?? null; },
      async findMany({ where, orderBy }) {
        let list = Array.from(children.values());
        if (where?.parentId !== undefined) list = list.filter(c => c.parentId === where.parentId);
        return list.map(c => ({ ...c }));
      },
      async count({ where }) {
        let n = 0;
        for (const c of children.values()) { if (where?.parentId !== undefined && c.parentId !== where.parentId) continue; n++; }
        return n;
      },
      async create({ data }) {
        const id = cuid('chd');
        const c = { id, parentId: data.parentId, name: data.name, age: data.age, gender: data.gender ?? null, avatar: data.avatar ?? '🐻', primaryLang: data.primaryLang ?? 'en', secondLang: data.secondLang ?? 'none', birthday: data.birthday ?? null, coins: 0, voiceId: null, createdAt: new Date(), updatedAt: new Date() };
        children.set(id, c); return c;
      },
      async update({ where, data }) { const c = children.get(where.id); Object.assign(c, data, { updatedAt: new Date() }); return c; },
      async delete({ where }) { const c = children.get(where.id); children.delete(where.id); return c; },
    },
    activationCode: {
      async findUnique({ where }) {
        if (where?.id) return activationCodes.get(where.id) ?? null;
        if (where?.code) return activationCodes.get(activationCodesByCode.get(where.code)) ?? null;
        return null;
      },
      async update({ where, data }) { const c = activationCodes.get(where.id); Object.assign(c, data, { updatedAt: new Date() }); return c; },
    },
    subscription: {
      async findUnique({ where }) {
        if (where?.parentId) return Array.from(subscriptions.values()).find(s => s.parentId === where.parentId) ?? null;
        return null;
      },
    },
    story: {
      async findUnique({ where }) { return stories.get(where.id) ?? null; },
      async findMany({ where, orderBy, take, cursor, skip }) {
        let list = Array.from(stories.values());
        if (where?.childId) list = list.filter(s => s.childId === where.childId);
        if (where?.status) list = list.filter(s => s.status === where.status);
        if (where?.favorited !== undefined) list = list.filter(s => s.favorited === where.favorited);
        if (Array.isArray(orderBy)) {
          for (const o of [...orderBy].reverse()) {
            const [k, d] = Object.entries(o)[0];
            list.sort((a, b) => (d === 'desc' ? (b[k] > a[k] ? 1 : -1) : (a[k] > b[k] ? 1 : -1)));
          }
        }
        if (cursor) {
          const idx = list.findIndex(s => s.id === cursor.id);
          if (idx >= 0) list = list.slice(idx + (skip || 0));
        }
        if (take) list = list.slice(0, take);
        return list.map(hydrateStory);
      },
      async count({ where }) {
        let n = 0;
        for (const s of stories.values()) {
          if (where?.childId && s.childId !== where.childId) continue;
          if (where?.status && s.status !== where.status) continue;
          if (where?.favorited !== undefined && s.favorited !== where.favorited) continue;
          n++;
        }
        return n;
      },
      async findFirst({ where, orderBy }) {
        let list = Array.from(stories.values());
        if (where?.childId) list = list.filter(s => s.childId === where.childId);
        if (where?.status) list = list.filter(s => s.status === where.status);
        if (orderBy?.createdAt === 'desc') list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return list[0] ?? null;
      },
      async create({ data }) {
        const id = cuid('sty');
        const s = {
          id, childId: data.childId, deviceId: data.deviceId ?? null,
          title: data.title ?? '', titleLearning: data.titleLearning ?? null,
          coverUrl: data.coverUrl ?? null, coverUrlHd: data.coverUrlHd ?? null,
          pages: data.pages ?? [], dialogue: data.dialogue ?? {},
          characterDescription: data.characterDescription ?? null,
          metadata: data.metadata ?? {},
          status: data.status ?? 'queued', stage: data.stage ?? 'queue',
          pagesGenerated: data.pagesGenerated ?? 0,
          failureCode: data.failureCode ?? null, failureMessage: data.failureMessage ?? null,
          isPublic: false, favorited: false, playCount: 0, genCostCents: data.genCostCents ?? 0,
          createdAt: new Date(), completedAt: null, updatedAt: new Date(),
        };
        stories.set(id, s);
        return hydrateStory(s);
      },
      async update({ where, data }) {
        const s = stories.get(where.id);
        if (!s) throw new Error('story not found');
        for (const [k, v] of Object.entries(data)) {
          if (v && typeof v === 'object' && ('increment' in v || 'decrement' in v)) {
            const cur = s[k] ?? 0;
            s[k] = 'increment' in v ? cur + v.increment : cur - v.decrement;
          } else s[k] = v;
        }
        s.updatedAt = new Date();
        return hydrateStory(s);
      },
      async delete({ where }) { const s = stories.get(where.id); stories.delete(where.id); return s; },
    },
    imageGenLog: {
      async create({ data }) { imageLogs.push({ id: cuid('log'), createdAt: new Date(), ...data }); return {}; },
    },
    async $transaction(fn) { return fn(api); },
    async $queryRaw() { return [{ ok: 1 }]; },
    _seedActivationCode(code) {
      const id = cuid('ac');
      const rec = { id, code, batchId: 'batch-test', status: 'issued', createdAt: new Date(), updatedAt: new Date() };
      activationCodes.set(id, rec); activationCodesByCode.set(code, id); return rec;
    },
    _seedSubscription({ parentId, plan = 'monthly', status = 'active' }) {
      const id = cuid('sub');
      const s = { id, parentId, plan, status, pdfExportsLeft: 2, createdAt: new Date(), updatedAt: new Date() };
      subscriptions.set(id, s); return s;
    },
    _imageLogs() { return imageLogs; },
    _allStories() { return Array.from(stories.values()); },
  };
  return api;
}

async function buildBatch4App() {
  const app = Fastify({ logger: false });
  app.decorate('prisma', makeFakePrisma());
  app.decorate('redis', makeFakeRedis());
  await app.register(requestIdPlugin);
  await app.register(responseEnvelopePlugin);
  await app.register(errorHandlerPlugin);
  await app.register(authPlugin);
  await app.register(storyQueuePlugin);
  await app.register(deviceRoutes);
  await app.register(childRoutes);
  await app.register(storyRoutes);
  await app.register(ttsRoutes);
  return app;
}

// -----------------------------------------------------------------------
// Bootstrap helper — full activation + bind + child
// -----------------------------------------------------------------------
async function bootstrap(app, { activationCode = 'WB9999', deviceId = 'GP15-BATCH4-A1B2C3', email = 'b4@example.com', childName = 'Luna', age = 5, primaryLang = 'zh', secondLang = 'en' } = {}) {
  app.prisma._seedActivationCode(activationCode);
  const reg = await app.inject({
    method: 'POST', url: '/api/device/register',
    payload: { deviceId, activationCode },
  });
  const deviceToken = reg.json().data.deviceToken;
  const par = await app.prisma.parent.create({ data: { email, locale: 'zh' } });
  const { token: parentToken } = await signParentToken(app, par.id);
  await app.inject({
    method: 'POST', url: '/api/device/bind',
    headers: { authorization: `Bearer ${parentToken}` },
    payload: { deviceId, activationCode },
  });
  const ch = await app.inject({
    method: 'POST', url: '/api/child',
    headers: { authorization: `Bearer ${parentToken}` },
    payload: { name: childName, age, primaryLang, secondLang },
  });
  const childId = ch.json().data.child.id;
  // Set active child via device
  await app.inject({
    method: 'POST', url: '/api/device/active-child',
    headers: { authorization: `Bearer ${deviceToken}` },
    payload: { childId },
  });
  return { deviceToken, parentToken, childId, parentId: par.id };
}

// =======================================================================
// Entry
// =======================================================================
export async function runBatch4Tests({ assert, section }) {
  // -----------------------------------------------------------------
  section('batch 4: storyPrompt — basicClean + style suffixes');
  // -----------------------------------------------------------------
  assert(typeof STYLE_SUFFIXES.default === 'string' && STYLE_SUFFIXES.default.includes('projection-display optimized'),
    'default style suffix mentions projection-display optimized (v7.1)');
  assert(!STYLE_SUFFIXES.default.includes('aged paper'), 'default style has no "aged paper" (v7.1 forbids)');
  assert(!STYLE_SUFFIXES.default.includes('muted tones'), 'default style has no "muted tones" (v7.1 forbids)');
  assert(STYLE_SUFFIXES.default.includes('vibrant saturated colors'), 'default style includes vibrant saturated colors');
  assert(STYLE_SUFFIXES.default.includes('high contrast'), 'default style includes high contrast');

  assert(basicClean('  a \n b  c  ') === 'a b c', 'basicClean collapses whitespace');
  assert(basicClean('a'.repeat(500)).length === 400, 'basicClean truncates to 400');

  // -----------------------------------------------------------------
  section('batch 4: storyPrompt — SAFE_REPLACEMENTS + sanitize');
  // -----------------------------------------------------------------
  assert(SAFE_REPLACEMENTS.some(([f]) => f === 'bedroom'), 'replacements includes bedroom');
  assert(SAFE_REPLACEMENTS.some(([f]) => f === 'aged paper'), 'replacements includes aged paper (v7.1 forbidden style)');
  assert(SAFE_REPLACEMENTS.some(([f]) => f === 'sepia'), 'replacements includes sepia (v7.1 forbidden style)');

  {
    const { finalPrompt, counters } = sanitizeImagePrompt('A child in bedroom at night', {
      channel: 'openai',
      characterDesc: 'Anchor character',
    });
    assert(!finalPrompt.toLowerCase().includes('bedroom'), 'sanitize: bedroom removed in openai channel');
    assert(!finalPrompt.toLowerCase().includes(' at night'), 'sanitize: at night removed');
    assert(counters.replacementHits >= 2, `sanitize: ≥2 replacement hits (got ${counters.replacementHits})`);
    assert(finalPrompt.startsWith('Anchor character'), 'sanitize: characterDesc prefix applied');
    assert(finalPrompt.includes('projection-display optimized'), 'sanitize: v7.1 style suffix appended');
  }

  {
    // Dangerous combo detection (OpenAI only)
    const combo = 'A child lies in bed at night reading';
    assert(detectDangerousCombo(combo), 'detectDangerousCombo: child+bed+night hits');
    const { counters } = sanitizeImagePrompt(combo, { channel: 'openai', characterDesc: 'X' });
    // After replacements, "bed"/"night" get rewritten, so combo may or may not still hit.
    assert(typeof counters.comboDetected === 'boolean', 'counters.comboDetected is boolean');
  }

  {
    // FAL/Imagen channels skip combo detection
    const { counters } = sanitizeImagePrompt('A child in bed at night', { channel: 'fal', characterDesc: 'X' });
    assert(counters.comboDetected === false, 'fal channel never flags combos');
  }

  assert(roundCountForAge(3) === 5, 'roundCountForAge(3) = 5');
  assert(roundCountForAge(5) === 7, 'roundCountForAge(5) = 7');
  assert(roundCountForAge(8) === 7, 'roundCountForAge(8) = 7');

  assert(buildDialogueFirstQuestion('zh').includes('主角'), 'first question zh');
  assert(buildDialogueFirstQuestion('en').toLowerCase().includes('hero'), 'first question en');
  assert(buildDialogueFirstQuestion('pl').length > 0, 'first question pl');
  assert(buildDialogueFirstQuestion('ro').length > 0, 'first question ro');

  assert(buildStorySystemPrompt({ age: 5 }).includes('12-page'), 'story system prompt mentions 12-page');
  assert(buildStorySystemPrompt({ age: 5 }).includes('IMAGE PROMPT RULES'), 'story system prompt has IMAGE PROMPT RULES');

  // -----------------------------------------------------------------
  section('batch 4: contentSafety 3-level classifier');
  // -----------------------------------------------------------------
  {
    const ok = classifySafety('我想要一个公主在花园里', { locale: 'zh' });
    assert(ok.level === 'ok', `happy content → ok (got ${ok.level})`);

    const warn = classifySafety('I had a nightmare about ghosts', { locale: 'en' });
    assert(warn.level === 'warn', `"nightmare ghost" → warn (got ${warn.level})`);
    assert(typeof warn.replacement === 'string', 'warn provides replacement sentence');

    const blocked = classifySafety('I want to kill everyone', { locale: 'en' });
    assert(blocked.level === 'blocked', `hard keyword → blocked (got ${blocked.level})`);

    const empty = classifySafety('', { locale: 'en' });
    assert(empty.level === 'blocked', 'empty → blocked');

    const garbage = classifySafety('aaaaaaaaa', { locale: 'en' });
    assert(garbage.level === 'blocked', 'repeated char → blocked unintelligible');
  }

  // -----------------------------------------------------------------
  section('batch 4: POST /api/story/dialogue/start');
  // -----------------------------------------------------------------
  {
    const app = await buildBatch4App();
    const { deviceToken, childId } = await bootstrap(app);

    // Missing childId
    let r = await app.inject({
      method: 'POST', url: '/api/story/dialogue/start',
      headers: { authorization: `Bearer ${deviceToken}` },
      payload: {},
    });
    let b = r.json();
    assert(b.code === 90001, `dialogue/start: missing childId → 90001 (got ${b.code})`);

    // Happy path
    r = await app.inject({
      method: 'POST', url: '/api/story/dialogue/start',
      headers: { authorization: `Bearer ${deviceToken}` },
      payload: { childId },
    });
    b = r.json();
    assert(b.code === 0, `dialogue/start: success (got ${b.code})`);
    assert(typeof b.data?.dialogueId === 'string' && b.data.dialogueId.startsWith('dlg_'),
      'dialogueId looks like dlg_...');
    assert(b.data?.roundCount === 7, `5yo → 7 rounds (got ${b.data?.roundCount})`);
    assert(typeof b.data?.firstQuestion?.text === 'string' && b.data.firstQuestion.text.length > 0,
      'firstQuestion.text populated');
    assert(b.data?.firstQuestion?.textLearning && b.data.firstQuestion.textLearning.length > 0,
      'firstQuestion.textLearning populated when secondLang set');
    assert(typeof b.data?.firstQuestion?.ttsUrl === 'string' && b.data.firstQuestion.ttsUrl.startsWith('https://mock.wonderbear.app/tts/'),
      'firstQuestion.ttsUrl is mock TTS URL');

    // Quota exhausted path
    // Force device storiesLeft=0 and NOT subscribed
    const dev = await app.prisma.device.findFirst({ where: {} });
    await app.prisma.device.update({ where: { id: dev.id }, data: { storiesLeft: 0 } });
    r = await app.inject({
      method: 'POST', url: '/api/story/dialogue/start',
      headers: { authorization: `Bearer ${deviceToken}` },
      payload: { childId },
    });
    b = r.json();
    assert(b.code === 30004, `quota=0 → 30004 (got ${b.code})`);
    assert(b.details?.storiesLeft === 0, 'details.storiesLeft=0');
    assert(Array.isArray(b.actions) && b.actions[0]?.url === '/sub', 'actions include upgrade URL');

    await app.close();
  }

  // -----------------------------------------------------------------
  section('batch 4: POST /api/story/dialogue/:id/turn (text + audioBase64)');
  // -----------------------------------------------------------------
  {
    const app = await buildBatch4App();
    const { deviceToken, childId } = await bootstrap(app);

    const start = await app.inject({
      method: 'POST', url: '/api/story/dialogue/start',
      headers: { authorization: `Bearer ${deviceToken}` },
      payload: { childId },
    });
    const dialogueId = start.json().data.dialogueId;

    // Missing both userInput and audioBase64
    let r = await app.inject({
      method: 'POST', url: `/api/story/dialogue/${dialogueId}/turn`,
      headers: { authorization: `Bearer ${deviceToken}` },
      payload: { round: 1 },
    });
    let b = r.json();
    assert(b.code === 90001, `turn: missing both → 90001 (got ${b.code})`);

    // round > roundCount
    r = await app.inject({
      method: 'POST', url: `/api/story/dialogue/${dialogueId}/turn`,
      headers: { authorization: `Bearer ${deviceToken}` },
      payload: { round: 8, userInput: 'x' },
    });
    b = r.json();
    assert(b.code === 30012, `turn: round 8 → 30012 (got ${b.code})`);

    // Unknown dialogue
    r = await app.inject({
      method: 'POST', url: `/api/story/dialogue/dlg_nope/turn`,
      headers: { authorization: `Bearer ${deviceToken}` },
      payload: { round: 1, userInput: 'hello' },
    });
    b = r.json();
    assert(b.code === 30007, `turn: unknown dialogue → 30007 (got ${b.code})`);

    // Happy path — text input
    r = await app.inject({
      method: 'POST', url: `/api/story/dialogue/${dialogueId}/turn`,
      headers: { authorization: `Bearer ${deviceToken}` },
      payload: { round: 1, userInput: '一只小兔子' },
    });
    b = r.json();
    assert(b.code === 0, `turn 1: success (got ${b.code})`);
    assert(b.data?.done === false, 'turn 1: not done');
    assert(b.data?.nextQuestion?.round === 2, 'turn 1: nextQuestion.round=2');
    assert(b.data?.safetyLevel === 'ok', 'turn 1: safetyLevel=ok');
    assert(b.data?.recognizedText === undefined, 'turn 1 (text path): no recognizedText');

    // Content safety — blocked input
    r = await app.inject({
      method: 'POST', url: `/api/story/dialogue/${dialogueId}/turn`,
      headers: { authorization: `Bearer ${deviceToken}` },
      payload: { round: 2, userInput: 'I want to kill everyone' },
    });
    b = r.json();
    assert(b.code === 30006, `turn: blocked content → 30006 (got ${b.code})`);

    // audioBase64 path — provide a tiny buffer
    const audio = Buffer.from('this is mock audio bytes that is long enough to pass').toString('base64');
    r = await app.inject({
      method: 'POST', url: `/api/story/dialogue/${dialogueId}/turn`,
      headers: { authorization: `Bearer ${deviceToken}` },
      payload: { round: 2, audioBase64: audio, audioMimeType: 'audio/mpeg' },
    });
    b = r.json();
    assert(b.code === 0, `turn (audio): success (got ${b.code})`);
    assert(typeof b.data?.recognizedText === 'string' && b.data.recognizedText.length > 0,
      'turn (audio): recognizedText returned');

    // ASR failure — empty buffer
    const tinyAudio = Buffer.from('x').toString('base64');
    r = await app.inject({
      method: 'POST', url: `/api/story/dialogue/${dialogueId}/turn`,
      headers: { authorization: `Bearer ${deviceToken}` },
      payload: { round: 3, audioBase64: tinyAudio, audioMimeType: 'audio/mpeg' },
    });
    b = r.json();
    assert(b.code === 30011, `turn (tiny audio): ASR_FAILED → 30011 (got ${b.code})`);

    // Skip remaining at round 4 → done
    r = await app.inject({
      method: 'POST', url: `/api/story/dialogue/${dialogueId}/turn`,
      headers: { authorization: `Bearer ${deviceToken}` },
      payload: { round: 4, userInput: '结束吧', skipRemaining: true },
    });
    b = r.json();
    assert(b.code === 0, 'turn (skip): success');
    assert(b.data?.done === true, 'turn (skip): done=true');
    assert(b.data?.summary && typeof b.data.summary.mainCharacter === 'string',
      'turn (skip): summary.mainCharacter populated');

    await app.close();
  }

  // -----------------------------------------------------------------
  section('batch 4: POST /api/story/generate + status polling + GET detail');
  // -----------------------------------------------------------------
  {
    const app = await buildBatch4App();
    const { deviceToken, parentToken, childId } = await bootstrap(app);

    // Start + finish a dialogue first
    const s = await app.inject({
      method: 'POST', url: '/api/story/dialogue/start',
      headers: { authorization: `Bearer ${deviceToken}` },
      payload: { childId },
    });
    const dialogueId = s.json().data.dialogueId;

    // Run 7 rounds (fill history) then skip remaining at round 4
    for (let round = 1; round <= 4; round++) {
      await app.inject({
        method: 'POST', url: `/api/story/dialogue/${dialogueId}/turn`,
        headers: { authorization: `Bearer ${deviceToken}` },
        payload: { round, userInput: `answer ${round}`, skipRemaining: round === 4 },
      });
    }

    // Missing dialogueId
    let r = await app.inject({
      method: 'POST', url: '/api/story/generate',
      headers: { authorization: `Bearer ${deviceToken}` },
      payload: { childId },
    });
    let b = r.json();
    assert(b.code === 90001, `generate: missing dialogueId → 90001 (got ${b.code})`);

    // Happy path
    r = await app.inject({
      method: 'POST', url: '/api/story/generate',
      headers: { authorization: `Bearer ${deviceToken}` },
      payload: { dialogueId, childId },
    });
    b = r.json();
    assert(r.statusCode === 202, `generate: HTTP 202 (got ${r.statusCode})`);
    assert(b.code === 0, `generate: code 0 (got ${b.code})`);
    assert(typeof b.data?.storyId === 'string' && b.data.storyId.startsWith('sty_'),
      'generate: storyId sty_...');
    assert(b.data?.status === 'queued', 'generate: status queued');
    assert(b.data?.priority === 'normal', 'generate: priority normal (no subscription)');
    assert(typeof b.data?.estimatedDurationSec === 'number', 'generate: estimated duration');
    const storyId = b.data.storyId;

    // Drive the queue to completion (synchronous helper)
    await app.storyQueue.runNextUntilEmpty();

    // status should be completed
    r = await app.inject({
      method: 'GET', url: `/api/story/${storyId}/status`,
      headers: { authorization: `Bearer ${deviceToken}` },
    });
    b = r.json();
    assert(b.code === 0, 'status: success');
    assert(b.data?.status === 'completed', `status: completed (got ${b.data?.status})`);
    assert(b.data?.progress?.percent === 100, 'status: 100%');
    assert(b.data?.progress?.pagesGenerated === 12, 'status: 12 pages generated');
    assert(b.data?.progress?.stage === 'done', 'status: stage=done');
    assert(typeof b.data?.completedAt === 'string', 'status: completedAt ISO');

    // Storiesleft decremented (was 6, now 5)
    const dev = await app.prisma.device.findFirst({ where: {} });
    assert(dev.storiesLeft === 5, `storiesLeft: 6 → 5 after generate (got ${dev.storiesLeft})`);

    // GET /api/story/:id via device token
    r = await app.inject({
      method: 'GET', url: `/api/story/${storyId}`,
      headers: { authorization: `Bearer ${deviceToken}` },
    });
    b = r.json();
    assert(b.code === 0, 'GET story (device): success');
    assert(Array.isArray(b.data?.story?.pages) && b.data.story.pages.length === 12, '12 pages');
    assert(typeof b.data.story.pages[0].imageUrl === 'string' && b.data.story.pages[0].imageUrl.startsWith('https://mock.wonderbear.app/img/'),
      'page 1 imageUrl is mock');
    assert(typeof b.data.story.pages[0].ttsUrl === 'string' && b.data.story.pages[0].ttsUrl.startsWith('https://mock.wonderbear.app/tts/'),
      'page 1 ttsUrl is mock');
    assert(b.data.story.pages[0].textLearning && b.data.story.pages[0].textLearning.length > 0,
      'page 1 has textLearning (secondLang=en)');
    assert(typeof b.data.story.coverUrl === 'string' && b.data.story.coverUrl.length > 0, 'coverUrl set');
    assert(b.data.story.downloaded === false, 'device view returns downloaded flag');

    // GET /api/story/:id via parent token
    r = await app.inject({
      method: 'GET', url: `/api/story/${storyId}`,
      headers: { authorization: `Bearer ${parentToken}` },
    });
    b = r.json();
    assert(b.code === 0, 'GET story (parent): success');
    assert(b.data?.story?.downloaded === undefined, 'parent view: no downloaded flag');

    // Image log was written. Cover (page 1) now runs OpenAI first, pages 2-12
    // run FAL kontext (img2img) with the cover as reference.
    const logs = app.prisma._imageLogs();
    assert(logs.length >= 12, 'imageGenLog: ≥12 rows');
    const p1 = logs.find((l) => l.pageNum === 1);
    assert(p1 && p1.provider === 'openai', 'imageGenLog: page 1 first attempt was openai (cover)');
    const anyKontext = logs.find((l) => l.provider === 'fal-kontext');
    assert(anyKontext, 'imageGenLog: at least one page used fal-kontext (img2img)');

    await app.close();
  }

  // -----------------------------------------------------------------
  section('batch 4: /api/story/list + favorite + delete + play-stat');
  // -----------------------------------------------------------------
  {
    const app = await buildBatch4App();
    const { deviceToken, parentToken, childId } = await bootstrap(app);

    // Seed 3 completed stories via pipeline
    const storyIds = [];
    for (let i = 0; i < 3; i++) {
      const s = await app.inject({
        method: 'POST', url: '/api/story/dialogue/start',
        headers: { authorization: `Bearer ${deviceToken}` },
        payload: { childId },
      });
      const dialogueId = s.json().data.dialogueId;
      await app.inject({
        method: 'POST', url: `/api/story/dialogue/${dialogueId}/turn`,
        headers: { authorization: `Bearer ${deviceToken}` },
        payload: { round: 1, userInput: `h${i}`, skipRemaining: false },
      });
      // Reset daily limit for test (3rd story would trip it otherwise)
      await app.redis.del(`rate:story-gen:${(await app.prisma.device.findFirst({ where: {} })).id}:${new Date().toISOString().slice(0, 10)}`);
      // Skip at round 4
      for (let r = 2; r <= 4; r++) {
        await app.inject({
          method: 'POST', url: `/api/story/dialogue/${dialogueId}/turn`,
          headers: { authorization: `Bearer ${deviceToken}` },
          payload: { round: r, userInput: `x${r}`, skipRemaining: r === 4 },
        });
      }
      const g = await app.inject({
        method: 'POST', url: '/api/story/generate',
        headers: { authorization: `Bearer ${deviceToken}` },
        payload: { dialogueId, childId },
      });
      storyIds.push(g.json().data.storyId);
      await app.storyQueue.runNextUntilEmpty();
    }

    // List (device token)
    let r = await app.inject({
      method: 'GET', url: '/api/story/list',
      headers: { authorization: `Bearer ${deviceToken}` },
    });
    let b = r.json();
    assert(b.code === 0, 'list (device): success');
    assert(b.data?.total === 3, `list: total=3 (got ${b.data?.total})`);
    assert(b.data?.items.length === 3, 'list: 3 items');
    assert(typeof b.data.items[0].coverUrl === 'string', 'list: summary coverUrl');

    // List (parent token, needs childId)
    r = await app.inject({
      method: 'GET', url: `/api/story/list?childId=${childId}`,
      headers: { authorization: `Bearer ${parentToken}` },
    });
    b = r.json();
    assert(b.code === 0, 'list (parent): success');
    assert(b.data?.items.length === 3, 'list (parent): 3 items');

    // Parent without childId → 90001
    r = await app.inject({
      method: 'GET', url: '/api/story/list',
      headers: { authorization: `Bearer ${parentToken}` },
    });
    b = r.json();
    assert(b.code === 90001, `list (parent, no childId) → 90001 (got ${b.code})`);

    // Favorite
    r = await app.inject({
      method: 'POST', url: `/api/story/${storyIds[0]}/favorite`,
      headers: { authorization: `Bearer ${deviceToken}` },
      payload: { favorited: true },
    });
    b = r.json();
    assert(b.code === 0, 'favorite: success');
    assert(b.data?.favorited === true, 'favorite: true');

    // Favorite invalid type
    r = await app.inject({
      method: 'POST', url: `/api/story/${storyIds[0]}/favorite`,
      headers: { authorization: `Bearer ${deviceToken}` },
      payload: { favorited: 'yes' },
    });
    b = r.json();
    assert(b.code === 90002, `favorite: bad type → 90002 (got ${b.code})`);

    // onlyFavorited=true
    r = await app.inject({
      method: 'GET', url: `/api/story/list?childId=${childId}&onlyFavorited=true`,
      headers: { authorization: `Bearer ${parentToken}` },
    });
    b = r.json();
    assert(b.data?.items.length === 1, 'list favorited only: 1 item');
    assert(b.data?.items[0].favorited === true, 'list favorited only: favorited=true');

    // play-stat complete
    r = await app.inject({
      method: 'POST', url: `/api/story/${storyIds[0]}/play-stat`,
      headers: { authorization: `Bearer ${deviceToken}` },
      payload: { event: 'complete', timestamp: new Date().toISOString() },
    });
    b = r.json();
    assert(b.code === 0, 'play-stat complete: success');

    const after = await app.prisma.story.findUnique({ where: { id: storyIds[0] } });
    assert(after.playCount === 1, `playCount incremented to 1 (got ${after.playCount})`);

    // Bad event
    r = await app.inject({
      method: 'POST', url: `/api/story/${storyIds[0]}/play-stat`,
      headers: { authorization: `Bearer ${deviceToken}` },
      payload: { event: 'garbage' },
    });
    b = r.json();
    assert(b.code === 90002, `play-stat: bad event → 90002 (got ${b.code})`);

    // Delete
    r = await app.inject({
      method: 'DELETE', url: `/api/story/${storyIds[2]}`,
      headers: { authorization: `Bearer ${deviceToken}` },
    });
    b = r.json();
    assert(b.code === 0 && b.data?.deleted === true, 'delete story: success');

    r = await app.inject({
      method: 'GET', url: `/api/story/list?childId=${childId}`,
      headers: { authorization: `Bearer ${parentToken}` },
    });
    b = r.json();
    assert(b.data?.total === 2, 'list after delete: total=2');

    // Unauthorized delete (stranger parent)
    const other = await app.prisma.parent.create({ data: { email: 'stranger@example.com', locale: 'en' } });
    const { token: strangerToken } = await signParentToken(app, other.id);
    r = await app.inject({
      method: 'DELETE', url: `/api/story/${storyIds[0]}`,
      headers: { authorization: `Bearer ${strangerToken}` },
    });
    b = r.json();
    assert(b.code === 30007, `delete (stranger) → 30007 (got ${b.code})`);

    await app.close();
  }

  // -----------------------------------------------------------------
  section('batch 4: TTS /api/tts/synthesize + voices + rate limit');
  // -----------------------------------------------------------------
  {
    const app = await buildBatch4App();
    const { deviceToken } = await bootstrap(app);

    // Missing text
    let r = await app.inject({
      method: 'POST', url: '/api/tts/synthesize',
      headers: { authorization: `Bearer ${deviceToken}` },
      payload: { lang: 'en' },
    });
    let b = r.json();
    assert(b.code === 90001, `tts: missing text → 90001 (got ${b.code})`);

    // Too long
    r = await app.inject({
      method: 'POST', url: '/api/tts/synthesize',
      headers: { authorization: `Bearer ${deviceToken}` },
      payload: { text: 'x'.repeat(501), lang: 'en' },
    });
    b = r.json();
    assert(b.code === 90002, `tts: >500 chars → 90002 (got ${b.code})`);

    // Bad speed
    r = await app.inject({
      method: 'POST', url: '/api/tts/synthesize',
      headers: { authorization: `Bearer ${deviceToken}` },
      payload: { text: 'hello', lang: 'en', speed: 2.0 },
    });
    b = r.json();
    assert(b.code === 90002, `tts: speed=2 → 90002 (got ${b.code})`);

    // Happy path
    r = await app.inject({
      method: 'POST', url: '/api/tts/synthesize',
      headers: { authorization: `Bearer ${deviceToken}` },
      payload: { text: 'hello world', lang: 'en' },
    });
    b = r.json();
    assert(b.code === 0, `tts: success (got ${b.code})`);
    assert(typeof b.data?.audioUrl === 'string' && b.data.audioUrl.startsWith('https://mock.wonderbear.app/tts/'),
      'tts: mock audioUrl');
    assert(typeof b.data?.durationMs === 'number', 'tts: durationMs');
    assert(b.data?.cached === false, 'tts: first call cached=false');

    // Second call same text → cached
    r = await app.inject({
      method: 'POST', url: '/api/tts/synthesize',
      headers: { authorization: `Bearer ${deviceToken}` },
      payload: { text: 'hello world', lang: 'en' },
    });
    b = r.json();
    assert(b.data?.cached === true, 'tts: second call cached=true');

    // Voices
    r = await app.inject({
      method: 'GET', url: '/api/tts/voices',
      headers: { authorization: `Bearer ${deviceToken}` },
    });
    b = r.json();
    assert(b.code === 0, 'tts/voices: success');
    assert(Array.isArray(b.data?.voices) && b.data.voices.length === 4, 'tts/voices: 4 voices');
    assert(b.data.voices.some(v => v.lang === 'zh'), 'tts/voices: zh present');

    await app.close();
  }

  // -----------------------------------------------------------------
  section('batch 4: yearly subscriber → priority=high, no quota decrement');
  // -----------------------------------------------------------------
  {
    const app = await buildBatch4App();
    const { deviceToken, childId, parentId } = await bootstrap(app, {
      activationCode: 'WBYR99', deviceId: 'GP15-YEARLY-A1B2C3', email: 'yearly@example.com',
    });
    app.prisma._seedSubscription({ parentId, plan: 'yearly', status: 'active' });

    const s = await app.inject({
      method: 'POST', url: '/api/story/dialogue/start',
      headers: { authorization: `Bearer ${deviceToken}` },
      payload: { childId },
    });
    const dialogueId = s.json().data.dialogueId;
    for (let r = 1; r <= 4; r++) {
      await app.inject({
        method: 'POST', url: `/api/story/dialogue/${dialogueId}/turn`,
        headers: { authorization: `Bearer ${deviceToken}` },
        payload: { round: r, userInput: `y${r}`, skipRemaining: r === 4 },
      });
    }
    const g = await app.inject({
      method: 'POST', url: '/api/story/generate',
      headers: { authorization: `Bearer ${deviceToken}` },
      payload: { dialogueId, childId },
    });
    const gd = g.json();
    assert(gd.code === 0, 'yearly generate: success');
    assert(gd.data?.priority === 'high', `yearly → priority=high (got ${gd.data?.priority})`);

    await app.storyQueue.runNextUntilEmpty();

    const dev = await app.prisma.device.findFirst({ where: {} });
    assert(dev.storiesLeft === 6, `yearly: storiesLeft stays at 6 (got ${dev.storiesLeft})`);

    await app.close();
  }
}
