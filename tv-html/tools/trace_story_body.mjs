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
const URL = 'http://localhost:5174/?dev=1&autobind=1&gallery=1';

const focusLabel = (page) => page.evaluate(() => {
  const el = document.querySelector('[data-focused]');
  return el?.getAttribute('aria-label') || el?.className?.split(' ')[0] || null;
});

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  await page.goto(URL);
  await page.waitForTimeout(800);

  // 6. Story Body — 3-button playback controls
  await page.getByText('6. Story Body').click();
  await page.waitForTimeout(800);
  console.log('[StoryBody] initial focus:', await focusLabel(page));
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(150);
  console.log('[StoryBody] after Right:', await focusLabel(page));
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(150);
  console.log('[StoryBody] after Left*2:', await focusLabel(page));

  // 3C dialogue — Ready for painting focusable
  await page.getByText('3C. Dialogue · Bear talks').click();
  await page.waitForTimeout(600);
  console.log('[3C] focus:', await focusLabel(page));
  const readyTxt = await page.locator('.ready-btn').textContent();
  const iconInPill = await page.locator('.hold-hint-pill-3c .hold-hint-icon').count();
  console.log('[3C] ready-btn text:', readyTxt?.trim());
  console.log('[3C] icon merged into pill:', iconInPill === 1);

  await browser.close();
})();
