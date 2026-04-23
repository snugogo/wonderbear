// tools/run_seeds.mjs — Generate 6 seed stories via the full dialogue pipeline.
// Usage: node tools/run_seeds.mjs
import { PrismaClient } from '@prisma/client';
import { createSigner } from 'fast-jwt';
import { readFileSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const SEED_FILE = process.env.SEED_FILE || '/tmp/seed_dialogues.json';
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET not set');

const seed = JSON.parse(readFileSync(SEED_FILE, 'utf8'));
const scenarios = seed.scenarios;

const prisma = new PrismaClient();
const device = await prisma.device.findFirst({
  where: { status: 'bound' },
  include: { parent: { include: { children: true } } },
});
if (!device) throw new Error('No bound device');
const child = device.parent.children[0];
if (!child) throw new Error('No child');
console.log(`Using device ${device.id} / child ${child.id} (${child.name}, age ${child.age})`);

// Bump storiesLeft + upsert an active subscription so quota + daily limit skip
await prisma.device.update({ where: { id: device.id }, data: { storiesLeft: 20 } });
await prisma.subscription.upsert({
  where: { parentId: device.parentId },
  create: {
    parentId: device.parentId,
    plan: 'yearly',
    status: 'active',
    provider: 'stripe',
    stripeCustomerId: 'cus_seedtest',
    stripeSubId: 'sub_seedtest',
    currentPeriodEnd: new Date(Date.now() + 365 * 86400 * 1000),
  },
  update: { plan: 'yearly', status: 'active', currentPeriodEnd: new Date(Date.now() + 365 * 86400 * 1000) },
});
console.log('Subscription set to active (yearly).');

// Sign a device token (HS256, 24h, same shape as @fastify/jwt)
const signer = createSigner({ key: JWT_SECRET, algorithm: 'HS256', expiresIn: 24 * 3600 * 1000 });
const token = signer({ sub: device.id, type: 'device' });
const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

async function post(path, body) {
  const r = await fetch(`${BASE}${path}`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = { raw: t }; }
  if (!r.ok && r.status !== 202) throw new Error(`${path} HTTP ${r.status}: ${t.slice(0, 400)}`);
  return j;
}
async function get(path) {
  const r = await fetch(`${BASE}${path}`, { headers: H });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = { raw: t }; }
  if (!r.ok) throw new Error(`${path} HTTP ${r.status}: ${t.slice(0, 400)}`);
  return j;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

const results = [];

// Pull already-completed stories if any (to skip re-gen by scenario id in metadata)
// (for now we just run all scenarios; skip is caller's job)

const SKIP_IDS = (process.env.SKIP_SCENARIOS || '').split(',').filter(Boolean);
for (const sc of scenarios) {
  if (SKIP_IDS.includes(sc.id)) {
    console.log(`\n===== ${sc.id} ===== SKIPPED by SKIP_SCENARIOS`);
    continue;
  }
  console.log(`\n===== ${sc.id} =====`);
  const rec = { id: sc.id, themeHint: sc.themeHint, storyId: null, coverProvider: null, allPagesOk: null, note: '' };
  try {
    // 1. dialogue/start
    const start = await post('/api/story/dialogue/start', {
      childId: child.id, targetLang: 'en', learningLang: 'none',
    });
    const dialogueId = start.data?.dialogueId || start.dialogueId;
    const roundCount = start.data?.roundCount || start.roundCount;
    console.log(`  dialogueId=${dialogueId} roundCount=${roundCount}`);

    // 2. turns
    const turns = sc.childTurns.slice(0, roundCount);
    for (let i = 0; i < turns.length; i++) {
      const resp = await post(`/api/story/dialogue/${dialogueId}/turn`, {
        round: i + 1,
        userInput: turns[i],
      });
      const body = resp.data || resp;
      process.stdout.write(`  turn ${i + 1}/${turns.length} done=${body.done}\n`);
      if (body.done) break;
    }

    // 3. generate
    const gen = await post('/api/story/generate', {
      dialogueId, childId: child.id,
    });
    const storyId = gen.data?.storyId || gen.storyId;
    rec.storyId = storyId;
    console.log(`  storyId=${storyId}, polling…`);

    // 4. poll
    let status, stage, elapsed = 0;
    while (elapsed < 300000) {
      await sleep(5000); elapsed += 5000;
      const st = await get(`/api/story/${storyId}/status`);
      const b = st.data || st;
      status = b.status; stage = b.stage;
      process.stdout.write(`    [${Math.round(elapsed / 1000)}s] stage=${stage} status=${status} pages=${b.pagesGenerated}/12\n`);
      if (status === 'completed' || status === 'failed') break;
    }

    // 5. inspect story pages + cover source
    const story = await prisma.story.findUnique({ where: { id: storyId } });
    const logs = await prisma.imageGenLog.findMany({
      where: { storyId, success: true },
      orderBy: { pageNum: 'asc' },
    });
    const cover = logs.find((l) => l.pageNum === 1);
    rec.coverProvider = cover?.provider || 'placeholder';
    rec.coverUrl = story?.coverUrl;
    const pages = story?.pages || [];
    rec.allPagesOk = Array.isArray(pages) && pages.length === 12 && pages.every((p) => p.imageUrl);
    rec.note = status === 'completed' ? 'ok' : `status=${status} failureCode=${story?.failureCode} msg=${story?.failureMessage?.slice(0, 100)}`;
  } catch (err) {
    rec.note = `EXCEPTION: ${err.message}`;
    console.error('  FAIL:', err.message);
  }
  results.push(rec);
  console.log('  →', JSON.stringify(rec));
}

console.log('\n\n========= SUMMARY =========');
console.log(JSON.stringify(results, null, 2));

// Write report
const tally = { openai: 0, nano_banana: 0, fal: 0, 'fal-kontext': 0, placeholder: 0, other: 0 };
for (const r of results) {
  const k = r.coverProvider;
  if (tally[k] != null) tally[k]++; else tally.other++;
}
const mdRows = results.map((r, i) => `| ${i + 1} | ${r.id} | ${r.storyId || '-'} | ${r.coverProvider || '-'} | ${r.allPagesOk ? '✅' : '❌'} | ${r.note} |`).join('\n');
const md = `# Seed 生成报告

| # | scenario | storyId | 封面来源 | 12页全部成功? | 备注 |
|---|---|---|---|---|---|
${mdRows}

## 统计
- OpenAI: ${tally.openai} / 6
- Nano Banana: ${tally.nano_banana} / 6
- FAL: ${tally.fal} / 6
- Placeholder: ${tally.placeholder} / 6
- 12 页全成: ${results.filter((r) => r.allPagesOk).length} / 6

## 封面 URL
${results.map((r) => `- **${r.id}** (${r.coverProvider}): ${r.coverUrl || '(none)'}`).join('\n')}
`;
await import('node:fs').then((fs) => fs.writeFileSync('tools/SEED_GENERATION_REPORT.md', md));
console.log('\nReport written to tools/SEED_GENERATION_REPORT.md');
await prisma.$disconnect();
