// Trace keyboard nav across dialogue 3A/3B/3C action buttons.
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

const phases = ['3A', '3B', '3C'];
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();

  for (const ph of phases) {
    await page.goto(`http://localhost:5173/?dev=1&autobind=1&screen=dialogue&demoPhase=${ph}`);
    await page.waitForTimeout(800);
    const focusedLabel = async () => page.evaluate(() => {
      const el = document.querySelector('[data-focused]');
      return el ? (el.textContent || '').trim().slice(0, 30) : null;
    });
    console.log('--- ' + ph + ' ---');
    console.log('initial:', await focusedLabel());
    await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(120);
    console.log('Left:   ', await focusedLabel());
    await page.keyboard.press('ArrowRight'); await page.waitForTimeout(120);
    console.log('Right:  ', await focusedLabel());
    await page.keyboard.press('ArrowRight'); await page.waitForTimeout(120);
    console.log('Right:  ', await focusedLabel());
  }

  await browser.close();
})();
