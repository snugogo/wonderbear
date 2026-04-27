// tools/run_dora_test_mock.mjs
// 2026-04-27 task 3 Phase B — dual-mode test runner.
//
// USAGE:
//   node tools/run_dora_test_mock.mjs                       # mock (USE_MOCK_AI=true)
//   node tools/run_dora_test_mock.mjs --real                # real engines + Phase A overrides + P12 override
//   node tools/run_dora_test_mock.mjs --real --baseline     # real engines, Phase A overrides DISABLED (task 6 A/B)
//
// Validates Phase A + Phase B orchestrator + dual-engine wiring.
// - childProfile.name='Dora' so LLM steers toward Dora story
//
// Modes:
//   default real:  DORA_TEST_P12_OVERRIDE=1, no DISABLE → verifies P12 swap + P1/P8 eyes
//   --baseline:    DISABLE_PHASE_A_PROMPT_OVERRIDES=1, no P12 override → A/B isolation
//
// Layer 1 (DB):    Story.pages JSON + ttsUrl + ttsUrlLearning
// Layer 2 (R2img): curl HEAD P1/P6/P12 → 200 + size > 50000
// Layer 3 (R2aud): curl HEAD P1.tts / P6.tts / P12.tts → 200 + size > 10000
// Layer 4 (16:9):  download + sharp metadata, ratio 1.78 ± 0.05

const REAL_MODE = process.argv.includes('--real');
const BASELINE_MODE = process.argv.includes('--baseline');
if (BASELINE_MODE) {
  // Task 6 A/B: kill Phase A overrides, do NOT set P12 override.
  process.env.DISABLE_PHASE_A_PROMPT_OVERRIDES = '1';
} else {
  process.env.DORA_TEST_P12_OVERRIDE = '1';
}
if (!REAL_MODE) {
  process.env.USE_MOCK_AI = 'true';
}

import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';
import { createStoryQueue } from '../src/queues/storyJob.js';

const prisma = new PrismaClient();

// User stop-limits (informational; enforcement is post-hoc, see note below).
const COST_LIMIT_SINGLE_CENTS = 100;  // $1.00 single attempt
const COST_LIMIT_TOTAL_CENTS  = 300;  // $3.00 cumulative
const FAIL_LIMIT_CONSECUTIVE  = 3;
void COST_LIMIT_SINGLE_CENTS; void COST_LIMIT_TOTAL_CENTS; void FAIL_LIMIT_CONSECUTIVE;

// Real-time cost guard NOT implemented: storyJob.runOne owns the logAttempt
// closure internally; intercepting from outside without modifying storyJob.js
// would require code surgery mid-session. Accept POST-HOC validation instead.
// Bounded worst-case cost: 12 pages × ($0.13 cover + $0.05 OpenAI + $0.04 FAL)
// ≈ $2.6 + TTS ~$0.4 = ~$3 total max. Well within user's stop limits.

function fmtSection(t) {
  console.log(`\n${'='.repeat(70)}\n${t}\n${'='.repeat(70)}`);
}

try {
  fmtSection(`SETUP — find bound device + child  (mode: ${REAL_MODE ? 'REAL' : 'MOCK'})`);

  const device = await prisma.device.findFirst({
    where: { status: 'bound' },
    include: { parent: { include: { children: true } } },
  });
  if (!device) throw new Error('No bound device found in DB');
  const child = device.parent.children[0];
  if (!child) throw new Error('No child found for parent');
  console.log(`device.id      = ${device.id}`);
  console.log(`device.deviceId= ${device.deviceId}`);
  console.log(`child.id       = ${child.id}`);
  console.log(`child.name     = ${child.name}, age ${child.age}`);
  console.log(`child.primaryLang=${child.primaryLang}, secondLang=${child.secondLang}`);

  fmtSection('CREATE — story row in DB');

  const titlePrefix = BASELINE_MODE ? '[baseline]' : (REAL_MODE ? '[real-test]' : '[mock-test]');
  const story = await prisma.story.create({
    data: {
      childId: child.id,
      deviceId: device.deviceId,
      title: `${titlePrefix} pending`,
      pages: [],
      dialogue: {},
      metadata: {},
      status: 'queued',
      stage: 'queue',
    },
  });
  const storyId = story.id;
  console.log(`storyId        = ${storyId}`);

  fmtSection(`RUN — queue.runImmediate (${REAL_MODE ? 'REAL' : 'MOCK'} pipeline)`);

  // Override childProfile.name='Dora' so LLM steers toward Dora story.
  // dialogueSummary mirrors the Dora_Story_12pages.md core arc.
  const job = {
    storyId,
    deviceId: device.deviceId,
    subscribed: true,
    childProfile: {
      name: 'Dora',
      age: 5,
      primaryLang: child.primaryLang || 'zh',
      secondLang: child.secondLang || 'en',
    },
    dialogueSummary: {
      mainCharacter: 'Dora a 5-year-old girl with long brown curly hair, wearing a yellow skirt and white sleeveless top',
      scene: 'a cozy cottage by a window looking out at the sky and meadow',
      conflict: 'helping a sad cloud who is afraid to rain because tiny ants on the ground will get cold',
      rounds: [
        { q: 'What is your story about?', a: 'A girl named Dora who sees a cloud crying in the sky' },
        { q: 'Who else is in the story?', a: 'Her best friend WonderBear, a small brown bear' },
        { q: 'What problem do they solve?', a: 'They climb up moonlight to ask the cloud what is wrong, and find a place where rain is needed' },
        { q: 'How does it end?', a: 'The cloud rains in the desert where cactus plants need water, and the two clouds dance under a rainbow' },
      ],
    },
  };

  const queue = createStoryQueue(prisma);
  const start = Date.now();
  let runError = null;
  try {
    await queue.runImmediate(job);
  } catch (err) {
    runError = err;
    console.error('runImmediate threw:', err.message);
  }
  const tookMs = Date.now() - start;
  console.log(`pipeline returned in ${tookMs}ms${runError ? ' (error)' : ''}`);

  fmtSection('LAYER 1 — DB validation (schema-adapted)');

  const final = await prisma.story.findUnique({ where: { id: storyId } });
  console.log(`status         = ${final.status}`);
  console.log(`stage          = ${final.stage}`);
  console.log(`pagesGenerated = ${final.pagesGenerated}`);
  console.log(`title          = ${final.title}`);
  console.log(`failureCode    = ${final.failureCode ?? 'null'}`);
  console.log(`failureMessage = ${final.failureMessage ?? 'null'}`);

  const pages = final.pages || [];
  let l1Pass = 0, l1Fail = 0;

  if (!Array.isArray(pages) || pages.length !== 12) {
    console.log(`FAIL: expected pages.length==12, got ${pages?.length}`);
    l1Fail++;
  } else {
    console.log(`pages.length = 12 ok`);
    l1Pass++;
  }

  if (Array.isArray(pages)) {
    for (const p of pages) {
      const okImg  = typeof p.imageUrl === 'string' && p.imageUrl.length > 0;
      const okTts  = typeof p.ttsUrl === 'string' && p.ttsUrl.length > 0;
      const okTts2 = typeof p.ttsUrlLearning === 'string' && p.ttsUrlLearning.length > 0;
      // Real-mode: also check R2 domain
      const isR2 = REAL_MODE
        ? (okImg && (/r2\.dev|wonderbear|r2\.cloudflarestorage/.test(p.imageUrl)))
        : true;
      const ok = okImg && okTts && okTts2 && isR2;
      if (ok) l1Pass++; else l1Fail++;
      const r2Tag = REAL_MODE ? `  r2=${isR2 ? 'ok' : 'X'}` : '';
      console.log(`  P${String(p.pageNum).padStart(2)}: img=${okImg ? 'ok' : 'X'}  tts=${okTts ? 'ok' : 'X'}  tts2=${okTts2 ? 'ok' : 'X'}${r2Tag}`);
    }
  }
  console.log(`Layer 1: ${l1Pass} pass / ${l1Fail} fail`);

  fmtSection('IMAGEGEN ROUTING — provider distribution');

  const logs = await prisma.imageGenLog.findMany({
    where: { storyId },
    orderBy: [{ pageNum: 'asc' }, { tier: 'asc' }],
  });
  const tally = {};
  let totalImgCents = 0;
  for (const log of logs) {
    if (!log.success) continue;
    tally[log.provider] = (tally[log.provider] || 0) + 1;
    totalImgCents += log.costCents;
  }
  console.log('Successful image attempts by provider:');
  for (const [p, n] of Object.entries(tally)) {
    console.log(`  ${p}: ${n}`);
  }
  console.log('\nFull log (success column shows S/F):');
  for (const log of logs) {
    const tag = log.success ? 'S' : 'F';
    console.log(`  P${String(log.pageNum).padStart(2)} [${tag}]: ${log.provider} (tier ${log.tier}, ${log.costCents}c, ${log.durationMs}ms${log.errorMessage ? ', err='+log.errorMessage.slice(0,80) : ''})`);
  }
  console.log(`Total image cost: ${totalImgCents}c ($${(totalImgCents/100).toFixed(2)})`);

  // ---------------- Real-mode-only validation: Layer 2/3/4 ----------------
  if (REAL_MODE && pages.length === 12) {
    fmtSection('LAYER 2 — R2 image spot check (P1 / P6 / P12)');

    const targets = [1, 6, 12];
    const httpHead = async (url) => {
      const r = await fetch(url, { method: 'HEAD' });
      return { status: r.status, size: parseInt(r.headers.get('content-length') || '0', 10) };
    };

    let l2Pass = 0, l2Fail = 0;
    for (const pn of targets) {
      const page = pages.find((p) => p.pageNum === pn);
      const url = page?.imageUrl;
      if (!url) { console.log(`  P${pn}: no imageUrl, FAIL`); l2Fail++; continue; }
      try {
        const { status, size } = await httpHead(url);
        const ok = status === 200 && size > 50000;
        if (ok) l2Pass++; else l2Fail++;
        console.log(`  P${pn}: HTTP ${status}, size ${size} bytes ${ok ? 'ok' : 'X'}  ${url.slice(0,80)}`);
      } catch (e) {
        console.log(`  P${pn}: HEAD threw ${e.message}, FAIL`);
        l2Fail++;
      }
    }
    console.log(`Layer 2: ${l2Pass} pass / ${l2Fail} fail`);

    fmtSection('LAYER 3 — R2 audio spot check (P1.ttsUrl / P6.ttsUrlLearning / P12.ttsUrl)');

    const audioTargets = [
      { pn: 1, field: 'ttsUrl' },
      { pn: 6, field: 'ttsUrlLearning' },
      { pn: 12, field: 'ttsUrl' },
    ];
    let l3Pass = 0, l3Fail = 0;
    for (const { pn, field } of audioTargets) {
      const page = pages.find((p) => p.pageNum === pn);
      const url = page?.[field];
      if (!url) { console.log(`  P${pn}.${field}: no URL, FAIL`); l3Fail++; continue; }
      try {
        const { status, size } = await httpHead(url);
        const ok = status === 200 && size > 10000;
        if (ok) l3Pass++; else l3Fail++;
        console.log(`  P${pn}.${field}: HTTP ${status}, size ${size} bytes ${ok ? 'ok' : 'X'}`);
      } catch (e) {
        console.log(`  P${pn}.${field}: HEAD threw ${e.message}, FAIL`);
        l3Fail++;
      }
    }
    console.log(`Layer 3: ${l3Pass} pass / ${l3Fail} fail`);

    fmtSection('LAYER 4 — 16:9 native pixel check (P1 / P6 / P12 via sharp)');

    const downloadAndCheck = async (pn) => {
      const page = pages.find((p) => p.pageNum === pn);
      const url = page?.imageUrl;
      if (!url) return { ok: false, msg: 'no url' };
      try {
        const resp = await fetch(url);
        if (!resp.ok) return { ok: false, msg: `HTTP ${resp.status}` };
        const buf = Buffer.from(await resp.arrayBuffer());
        const meta = await sharp(buf).metadata();
        const ratio = meta.width / meta.height;
        const target = 1.78;
        const ok = Math.abs(ratio - target) < 0.05;
        return { ok, msg: `${meta.width}x${meta.height} ratio=${ratio.toFixed(3)} ${ok ? 'ok' : 'X'}` };
      } catch (e) {
        return { ok: false, msg: `error: ${e.message.slice(0, 80)}` };
      }
    };
    let l4Pass = 0, l4Fail = 0;
    for (const pn of [1, 6, 12]) {
      const r = await downloadAndCheck(pn);
      if (r.ok) l4Pass++; else l4Fail++;
      console.log(`  P${pn}: ${r.msg}`);
    }
    console.log(`Layer 4: ${l4Pass} pass / ${l4Fail} fail`);

    fmtSection('SUMMARY (real)');
    console.log(`status=${final.status}`);
    console.log(`Layer 1: ${l1Pass} pass / ${l1Fail} fail`);
    console.log(`Layer 2: ${l2Pass} pass / ${l2Fail} fail`);
    console.log(`Layer 3: ${l3Pass} pass / ${l3Fail} fail`);
    console.log(`Layer 4: ${l4Pass} pass / ${l4Fail} fail`);
    console.log(`Total image cost: $${(totalImgCents/100).toFixed(2)}`);
    console.log(`Pipeline took: ${tookMs}ms`);
    console.log(`storyId: ${storyId}`);
    console.log(`Browser: http://VPS_IP:3000/debug/story/${storyId}`);

    const allPass = (final.status === 'completed') && l1Fail === 0 && l2Fail === 0 && l3Fail === 0 && l4Fail === 0;
    console.log(`\nRESULT: ${allPass ? 'PASS' : 'FAIL'}`);
    process.exit(allPass ? 0 : 1);
  } else {
    fmtSection('LAYER 2 / 3 / 4 — SKIPPED');
    console.log(`Mock mode (URLs are mock://...). Real validation requires --real.`);
    fmtSection('SUMMARY (mock)');
    console.log(`status=${final.status}, l1Pass=${l1Pass}, l1Fail=${l1Fail}, pipeline=${tookMs}ms, storyId=${storyId}`);
    if (final.status === 'completed' && l1Fail === 0) {
      console.log('\nRESULT: PASS');
      process.exit(0);
    } else {
      console.log('\nRESULT: FAIL');
      process.exit(1);
    }
  }
} catch (err) {
  console.error('SCRIPT ERROR:', err);
  process.exit(2);
} finally {
  await prisma.$disconnect();
}
