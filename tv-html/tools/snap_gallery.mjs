#!/usr/bin/env node
/**
 * Gallery-mode headless snapshot with sub-state injection.
 *
 * Usage:
 *   node tools/snap_gallery.mjs <screen> <out> [--demoPhase=3A|3B|3C]
 *     screen = home | dialogue | generating | ...
 *
 * Works by:
 *   1. Loading http://localhost:5173/?gallery=1
 *   2. Clicking the sidebar button whose name matches `screen`
 *   3. (optional) rebuilding URL with demoPhase=... and reload *in gallery iframe*
 *      is not supported; instead we directly mutate the mounted component via
 *      window.__WB_GALLERY_HOOK (installed by GalleryView in dev) if present,
 *      otherwise we force-seed pinia stores to the expected phase.
 *   4. Wait + screenshot.
 *
 * For demoPhase we fall back to forcing the dialogue store phase directly
 * (pinia is globally accessible via window.__WB if main.ts path ran, but
 * gallery has its own pinia — we expose it via window.__WB_GALLERY).
 */
import { createRequire } from 'node:module';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

function parseArgs(argv) {
  const args = argv.slice(2);
  const positional = [];
  let demoPhase = null;
  for (const a of args) {
    if (a.startsWith('--demoPhase=')) demoPhase = a.slice(12);
    else positional.push(a);
  }
  if (positional.length < 2) {
    console.error('Usage: node tools/snap_gallery.mjs <screen> <out.png> [--demoPhase=3A|3B|3C]');
    process.exit(1);
  }
  return { screen: positional[0], out: positional[1], demoPhase };
}

async function resolvePlaywright() {
  try {
    const req = createRequire(import.meta.url);
    return req('playwright');
  } catch {}
  const { execSync } = await import('node:child_process');
  const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
  const globalPath = `${root.replace(/\\/g, '/')}/playwright`;
  return (await import(`file:///${globalPath}/index.js`)).default
         || (await import(`file:///${globalPath}/index.js`));
}

async function main() {
  const { screen, out, demoPhase } = parseArgs(process.argv);
  const outPath = resolve(process.cwd(), out);
  const outDir = dirname(outPath);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const pw = await resolvePlaywright();
  const browser = await pw.chromium.launch();

  // Gallery stage is 1280×720 at scale 1 INSIDE the preview pane. To snap
  // just that area at 1280×720, we point the page viewport bigger and use
  // page.locator('.gallery-stage').screenshot.
  const context = await browser.newContext({
    viewport: { width: 1680, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));

  await page.goto('http://localhost:5173/?gallery=1', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Click sidebar button by partial text match (Home / Dialogue / Generating / ...)
  // Sidebar buttons are numbered: "1. Activation", "2. Home", "3. Dialogue", …
  const NAME_MAP = {
    home: 'Home', dialogue: 'Dialogue', generating: 'Generating',
    activation: 'Activation', library: 'Library', profile: 'Profile',
    'story-cover': 'Story Cover', 'story-body': 'Story Body',
    'story-end': 'Story End', learning: 'Learning',
    offline: 'Offline', error: 'Error',
  };
  const btnText = NAME_MAP[screen];
  if (!btnText) {
    console.error(`Unknown screen: ${screen}`);
    process.exit(1);
  }
  const btn = page.locator('.side-btn', { hasText: btnText }).first();
  await btn.click();
  await page.waitForTimeout(3500);

  // If demoPhase set, reach into pinia dialogue store inside the preview.
  // Gallery uses the same pinia as the whole view via app.use(createPinia())
  // but doesn't expose it on window. We set it via component tree traversal.
  if (demoPhase) {
    await page.evaluate((ph) => {
      // Walk the Vue app to find the DialogueScreen component instance.
      // Hacky but stable: each Vue 3 app has __vue_app__ on its root.
      const root = document.getElementById('app');
      // @ts-ignore
      const appCtx = root?.__vue_app__;
      if (!appCtx) return;
      const provides = appCtx._context.provides;
      // Pinia piggybacks on Vue provide; find it
      const piniaSym = Object.getOwnPropertySymbols(provides).find(
        (s) => s.toString().includes('pinia'),
      );
      if (!piniaSym) return;
      const pinia = provides[piniaSym];
      const dialogueStore = pinia._s.get('dialogue');
      if (!dialogueStore) return;
      // Map demoPhase → store.phase + seed a question text when needed.
      if (ph === '3A') dialogueStore.setPhase('waiting-for-child');
      if (ph === '3B') dialogueStore.setPhase('recording');
      if (ph === '3C') {
        dialogueStore.setPhase('bear-speaking');
        dialogueStore.applyStart({
          dialogueId: 'demo',
          roundCount: 7,
          firstQuestion: {
            round: 1,
            text: '我想听一只勇敢的小熊去森林冒险的故事!',
            textLearning: 'I want a story about a brave little bear adventuring in the forest!',
            ttsUrl: null,
          },
        });
      }
    }, demoPhase);
    await page.waitForTimeout(2500);
  }

  // Screenshot just the .gallery-stage element (1280×720 area).
  const stage = page.locator('.gallery-stage').first();
  await stage.screenshot({ path: outPath });
  await browser.close();
  console.log(JSON.stringify({ ok: true, path: outPath, screen, demoPhase }, null, 2));
}

main().catch((e) => {
  console.error('snap_gallery.mjs fatal:', e.message);
  process.exit(1);
});
