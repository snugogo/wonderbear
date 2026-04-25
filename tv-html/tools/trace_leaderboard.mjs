// Trace LeaderboardScreen + CreateInviteScreen + Flashcard overlay.
// node tools/trace_leaderboard.mjs
import { createRequire } from 'node:module';
async function resolvePw() {
  try { return createRequire(import.meta.url)('playwright'); } catch {}
  const { execSync } = await import('node:child_process');
  const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
  const p = `${root.replace(/\\/g, '/')}/playwright`;
  const m = await import(`file:///${p}/index.js`);
  return m.default || m;
}
const pw = await resolvePw();
const { chromium } = pw;

const ports = [5174, 5175, 5173];
async function findPort() {
  for (const p of ports) {
    try {
      const res = await fetch(`http://localhost:${p}/`);
      const body = await res.text();
      // Match the WonderBear bootstrap signature in index.html.
      if (/wonderbear|WonderBear/i.test(body)) return p;
    } catch { /* try next */ }
  }
  return ports[0];
}

(async () => {
  const port = await findPort();
  console.log('[debug] using port:', port);
  const URL = `http://localhost:${port}/?dev=1&autobind=1&gallery=1`;
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    const t = m.text();
    if (!/_pinia|sourcemap/i.test(t)) console.log('[console]', m.type(), t);
  });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));

  await page.goto(URL);
  await page.waitForTimeout(2500);

  const sidebarLabels = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.sidebar .side-btn')).map((b) => b.textContent.trim())
  );
  console.log('[debug] sidebar labels:', sidebarLabels);

  const sidebarClick = async (regex) =>
    page.evaluate((re) => {
      const items = Array.from(document.querySelectorAll('.sidebar .side-btn'));
      const tgt = items.find((b) => new RegExp(re).test(b.textContent || ''));
      if (tgt) { tgt.click(); return true; }
      return false;
    }, regex.source);

  console.log('[Leaderboard] sidebar clicked:', await sidebarClick(/Bear Stars/));
  await page.waitForTimeout(800);

  const title = await page.evaluate(() => {
    const el = document.querySelector('.title-zh');
    return el ? el.textContent.trim() : null;
  });
  console.log('[Leaderboard] title:', title);

  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(150);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(150);
  const activeTab = await page.evaluate(() => {
    const t = document.querySelector('.tab.is-active');
    return t ? t.textContent.trim() : null;
  });
  console.log('[Leaderboard] active tab after 2x Right:', activeTab);

  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(200);
  const focusedRow = await page.evaluate(() => {
    const fid = document.querySelector('[data-focused]');
    return fid ? fid.className.split(/\s+/).filter((c) => c.includes('row')).join(' ') : null;
  });
  console.log('[Leaderboard] focused row class:', focusedRow);

  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(150);
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(150);
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(150);
  const writersTab = await page.evaluate(() => {
    const t = document.querySelector('.tab.is-active');
    return t ? t.textContent.trim() : null;
  });
  console.log('[Leaderboard] back to writers:', writersTab);

  const selfText = await page.evaluate(() => {
    const el = document.querySelector('.self-text');
    return el ? el.textContent.trim() : null;
  });
  console.log('[Leaderboard] self bar:', selfText);

  console.log('[CreateInvite] sidebar clicked:', await sidebarClick(/Create Invite/));
  await page.waitForTimeout(600);
  const headline = await page.evaluate(() => {
    const el = document.querySelector('.headline');
    return el ? el.textContent.trim() : null;
  });
  console.log('[CreateInvite] headline:', headline);

  console.log('[StoryBody] sidebar clicked:', await sidebarClick(/Story Body/));
  await page.waitForTimeout(800);
  for (let i = 0; i < 5; i += 1) {
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(120);
  }
  const ctrlFocus = await page.evaluate(() => {
    const el = document.querySelector('[data-focused]');
    return el ? el.className.split(/\s+/).join(' ') : null;
  });
  console.log('[StoryBody] focused control:', ctrlFocus);

  if (ctrlFocus && /ctrl-btn--learn/.test(ctrlFocus)) {
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    const overlayOpen = await page.evaluate(() => Boolean(document.querySelector('.flashcard-overlay')));
    console.log('[Flashcard] overlay open:', overlayOpen);
  }

  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
