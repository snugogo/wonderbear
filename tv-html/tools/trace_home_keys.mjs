// Trace keyboard nav on HomeScreen under ?dev=1 deep-link.
// node tools/trace_home_keys.mjs
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

const URL = 'http://localhost:5173/?dev=1&autobind=1&screen=home';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('console', (m) => console.log('[console]', m.type(), m.text()));
  await page.goto(URL);
  await page.waitForTimeout(1500);

  const getFocused = () => page.evaluate(() => {
    const el = document.querySelector('[data-focused]');
    if (!el) return null;
    const lbl = el.querySelector('.card-label');
    return (lbl?.textContent || el.textContent || '').trim().slice(0, 30);
  });

  // Fallback: query focus store via window
  const getStoreFocus = () => page.evaluate(() => {
    // @ts-ignore
    const fs = window.__WB?.focus;
    return fs?.getCurrentFocusId?.() ?? null;
  });

  console.log('initial activeElement:', await page.evaluate(() => document.activeElement?.tagName));
  console.log('initial focused attr:', await getFocused());

  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(200);
  console.log('after Right:', await getFocused());

  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(200);
  console.log('after Down:', await getFocused());

  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(200);
  console.log('after Left:', await getFocused());

  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  console.log('after Enter, screen=', await page.evaluate(() => {
    // @ts-ignore
    return window.__WB?.screen?.current;
  }));

  await browser.close();
})();
