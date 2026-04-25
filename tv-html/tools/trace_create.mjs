// Trace keyboard nav on CreateScreen (Dream Factory).
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

const URL = 'http://localhost:5173/?dev=1&autobind=1&screen=create';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  await page.goto(URL);
  await page.waitForTimeout(1500);

  const getFocused = () => page.evaluate(() => {
    const el = document.querySelector('[data-focused]');
    if (!el) return null;
    return el.className + ' :: ' + (el.textContent || '').trim().slice(0, 30);
  });

  console.log('initial:', await getFocused());

  for (const k of ['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowLeft']) {
    await page.keyboard.press(k);
    await page.waitForTimeout(150);
    console.log(k + ' :', await getFocused());
  }

  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  console.log('Enter, screen=', await page.evaluate(() => window.__WB?.screen?.current));

  await page.goto(URL);
  await page.waitForTimeout(800);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  console.log('Back from +, screen=', await page.evaluate(() => window.__WB?.screen?.current));

  await browser.close();
})();
