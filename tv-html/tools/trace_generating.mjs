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
const URL = 'http://localhost:5173/?dev=1&autobind=1&gallery=1';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  await page.goto(URL);
  await page.waitForTimeout(800);
  // Click the "4. Generating" sidebar entry to switch into that screen.
  await page.getByText('4. Generating').click();
  await page.waitForTimeout(1200);

  const get = async () => page.evaluate(() => {
    const el = document.querySelector('[data-focused]');
    if (!el) return null;
    return (el.getAttribute('aria-label') || el.className || '').trim().slice(0, 60);
  });
  console.log('initial (gallery→4):', await get());

  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  console.log('Enter → screen=', await page.evaluate(() => window.__WB?.screen?.current));

  await page.goto(URL);
  await page.waitForTimeout(800);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  console.log('Back → screen=', await page.evaluate(() => window.__WB?.screen?.current));

  await browser.close();
})();
