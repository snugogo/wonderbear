// Capture LeaderboardScreen screenshot for visual verification.
import { createRequire } from 'node:module';
async function resolvePw() {
  try { return createRequire(import.meta.url)('playwright'); } catch {}
  const { execSync } = await import('node:child_process');
  const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
  const p = `${root.replace(/\\/g, '/')}/playwright`;
  const m = await import(`file:///${p}/index.js`);
  return m.default || m;
}
const { chromium } = await resolvePw();

const ports = [5174, 5175, 5173];
async function findPort() {
  for (const p of ports) {
    try {
      const res = await fetch(`http://localhost:${p}/`);
      const body = await res.text();
      if (/wonderbear|WonderBear/i.test(body)) return p;
    } catch {}
  }
  return ports[0];
}

(async () => {
  const port = await findPort();
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();

  await page.goto(`http://localhost:${port}/?dev=1&autobind=1&gallery=1`);
  await page.waitForTimeout(2000);

  await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.sidebar .side-btn'));
    const tgt = items.find((b) => /Bear Stars/.test(b.textContent || ''));
    if (tgt) tgt.click();
  });
  // Wait for podium / ribbon / avatar webp images to fully decode.
  await page.waitForTimeout(3500);
  await page.evaluate(async () => {
    const imgs = Array.from(document.images);
    await Promise.all(imgs.map((img) => img.complete && img.naturalWidth > 0
      ? Promise.resolve()
      : new Promise((r) => {
          img.addEventListener('load', r, { once: true });
          img.addEventListener('error', r, { once: true });
          // Also handle stale completed images via decode().
          if (img.complete) img.decode().then(r).catch(r);
        })));
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'tools/_snap_leaderboard_writers.png', fullPage: false });
  console.log('saved tools/_snap_leaderboard_writers.png');

  // Hot tab
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(800);
  // After tab switch, the podium <img> srcs change — wait for the new
  // images (cover URLs) to fully decode before screenshotting.
  await page.evaluate(async () => {
    const imgs = Array.from(document.querySelectorAll('.podium-avatar'));
    await Promise.all(imgs.map((img) => img.complete && img.naturalWidth > 0
      ? Promise.resolve()
      : new Promise((r) => { img.onload = img.onerror = r; })));
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'tools/_snap_leaderboard_weekly.png' });
  console.log('saved tools/_snap_leaderboard_weekly.png');

  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
