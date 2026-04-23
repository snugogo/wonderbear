#!/usr/bin/env node
/**
 * Headless screenshot of a TV route.
 *
 * Usage:
 *   node tools/snap.mjs <url> <output-png> [--width=1280] [--height=720] [--wait=1000]
 *
 * Example:
 *   node tools/snap.mjs "http://localhost:5173/?dev=1" tv-home.png
 *   node tools/snap.mjs "http://localhost:5173/?dev=1&locale=en" out.png --wait=2000
 *
 * Viewport defaults: 1280×720 (GP15 native resolution).
 *
 * Exit codes:
 *   0 = success (file written)
 *   1 = bad args / unreachable URL / playwright failure
 *
 * Dependency: the globally-installed `playwright` package (npm install -g playwright)
 * plus its chromium browser binary (npx playwright install chromium).
 */

import { createRequire } from 'node:module';
import { readFileSync, statSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

function parseArgs(argv) {
  const args = argv.slice(2);
  const positional = [];
  const opts = { width: 1280, height: 720, wait: 1000 };
  for (const a of args) {
    if (a.startsWith('--width=')) opts.width = parseInt(a.slice(8), 10);
    else if (a.startsWith('--height=')) opts.height = parseInt(a.slice(9), 10);
    else if (a.startsWith('--wait=')) opts.wait = parseInt(a.slice(7), 10);
    else if (a === '-h' || a === '--help') {
      usage();
      process.exit(0);
    } else {
      positional.push(a);
    }
  }
  if (positional.length < 2) {
    usage();
    process.exit(1);
  }
  return { url: positional[0], out: positional[1], ...opts };
}

function usage() {
  console.log('Usage: node tools/snap.mjs <url> <output-png> [--width=N] [--height=N] [--wait=ms]');
  console.log('Defaults: 1280x720 viewport, wait 1000 ms after networkidle.');
}

async function resolvePlaywright() {
  // Try local first (if someone added it as devDep in tv-html later), then global.
  try {
    const req = createRequire(import.meta.url);
    return req('playwright');
  } catch {}
  // Global install: resolve via npm root -g
  const { execSync } = await import('node:child_process');
  const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
  const globalPath = `${root.replace(/\\/g, '/')}/playwright`;
  return (await import(`file:///${globalPath}/index.js`)).default || (await import(`file:///${globalPath}/index.js`));
}

async function main() {
  const { url, out, width, height, wait } = parseArgs(process.argv);
  const outPath = resolve(process.cwd(), out);
  const outDir = dirname(outPath);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const pw = await resolvePlaywright();
  const browser = await pw.chromium.launch();
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  const consoleMessages = [];
  page.on('console', (msg) => consoleMessages.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => consoleMessages.push(`[pageerror] ${err.message}`));

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
  } catch (e) {
    console.error(`goto failed: ${e.message}`);
    await browser.close();
    process.exit(1);
  }

  if (wait > 0) await page.waitForTimeout(wait);

  await page.screenshot({ path: outPath, fullPage: false });
  const stat = statSync(outPath);
  await browser.close();

  console.log(JSON.stringify({
    ok: true,
    path: outPath,
    width,
    height,
    bytes: stat.size,
    consoleLines: consoleMessages.slice(-5),
  }, null, 2));
}

main().catch((e) => {
  console.error('snap.mjs fatal:', e.message);
  process.exit(1);
});
