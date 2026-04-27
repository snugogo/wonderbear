// Verify LibraryScreen renders 12 mock tiles in gallery mode.
// node tools/trace_library.mjs
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
      if (/wonderbear|WonderBear/i.test(body)) return p;
    } catch { /* try next */ }
  }
  return ports[0];
}

(async () => {
  const port = await findPort();
  const URL = `http://localhost:${port}/?dev=1&autobind=1&gallery=1`;
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    const t = m.text();
    if (!/_pinia|sourcemap|vite|mock bridge/i.test(t)) console.log('[console]', m.type(), t);
  });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));

  await page.goto(URL);
  await page.waitForTimeout(2000);

  // Sidebar -> Library.
  const ok = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.sidebar .side-btn'));
    const tgt = items.find((b) => /Library/.test(b.textContent || ''));
    if (tgt) { tgt.click(); return true; }
    return false;
  });
  console.log('[Library] sidebar clicked:', ok);
  await page.waitForTimeout(1000);

  // Verify rail visibility — all 7 chips inside the visible bounds.
  const railStats = await page.evaluate(() => {
    const rail = document.querySelector('.cat-rail');
    if (!rail) return null;
    const rb = rail.getBoundingClientRect();
    const chips = Array.from(rail.querySelectorAll('.cat-btn'));
    return {
      railTop: rb.top, railBottom: rb.bottom, railHeight: rb.height,
      chips: chips.map((c) => {
        const r = c.getBoundingClientRect();
        return {
          label: c.textContent.trim(),
          top: r.top, bottom: r.bottom,
          insideRail: r.top >= rb.top - 1 && r.bottom <= rb.bottom + 1,
        };
      }),
    };
  });
  console.log('[Library] rail:', JSON.stringify(railStats, null, 2));

  const stats = await page.evaluate(() => {
    const cells = document.querySelectorAll('.grid > *');
    const titleEl = document.querySelector('.title');
    const empty = document.querySelector('.empty');
    const cap = document.querySelector('.capacity');
    return {
      cellCount: cells.length,
      title: titleEl ? titleEl.textContent.trim() : null,
      hasEmpty: Boolean(empty),
      capacity: cap ? cap.textContent.trim() : null,
      firstCellTitle: cells[0]
        ? (cells[0].querySelector('.title-text') || cells[0].querySelector('.cell-title'))?.textContent?.trim()
        : null,
    };
  });
  console.log('[Library] stats:', stats);

  // Press right twice to enter the grid.
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(150);
  const focusedAfterRight = await page.evaluate(() => {
    const el = document.querySelector('[data-focused]');
    return el ? (el.getAttribute('data-focus-id') || el.id || el.className) : null;
  });
  console.log('[Library] focus after Right:', focusedAfterRight);

  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
