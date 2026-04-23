#!/usr/bin/env node
/**
 * WCAG 2.1 contrast ratio checker.
 *
 * Usage:
 *   node tools/contrast.mjs <foreground-hex> <background-hex> [--size=large]
 *
 * Example:
 *   node tools/contrast.mjs "#FFF5E6" "#FFE4B5"
 *   node tools/contrast.mjs FFF5E6 FFE4B5 --size=large
 *
 * Output:
 *   Contrast ratio + AA/AAA pass/fail for both normal and large text.
 *
 * Spec references:
 *   - WCAG 2.1 SC 1.4.3 (AA normal text) — 4.5:1
 *   - WCAG 2.1 SC 1.4.3 (AA large text, >=18pt or >=14pt bold) — 3:1
 *   - WCAG 2.1 SC 1.4.6 (AAA normal) — 7:1
 *   - WCAG 2.1 SC 1.4.6 (AAA large) — 4.5:1
 *
 * On TV at 2-3m viewing distance, even "body" text is effectively "large"
 * per distance-corrected equivalents. We still report both thresholds so
 * the caller picks the stricter one when appropriate.
 */

function parseHex(hex) {
  const s = String(hex).trim().replace(/^#/, '');
  if (!/^[0-9a-f]{3}$|^[0-9a-f]{6}$/i.test(s)) {
    throw new Error(`Invalid hex color: "${hex}" — expected #RGB or #RRGGBB`);
  }
  const full = s.length === 3
    ? s.split('').map((c) => c + c).join('')
    : s;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/** WCAG 2.1 relative luminance. */
function luminance({ r, g, b }) {
  const toLinear = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** WCAG 2.1 contrast ratio, always >= 1.0. */
export function contrastRatio(hexA, hexB) {
  const la = luminance(parseHex(hexA));
  const lb = luminance(parseHex(hexB));
  const [lighter, darker] = la >= lb ? [la, lb] : [lb, la];
  return (lighter + 0.05) / (darker + 0.05);
}

function pad(s, w) { return String(s).padEnd(w); }
function check(ratio, threshold) { return ratio >= threshold ? 'PASS' : 'FAIL'; }

function main() {
  const args = process.argv.slice(2);
  if (args.length < 2 || args[0] === '-h' || args[0] === '--help') {
    console.log('Usage: node tools/contrast.mjs <fg-hex> <bg-hex>');
    console.log('Example: node tools/contrast.mjs "#FFF5E6" "#FFE4B5"');
    process.exit(args.length < 2 ? 1 : 0);
  }
  const fg = args[0];
  const bg = args[1];
  const ratio = contrastRatio(fg, bg);

  // Normalize hex for display
  const normFg = '#' + parseInt(Object.values(parseHex(fg)).map((n) => n.toString(16).padStart(2, '0')).join(''), 16).toString(16).padStart(6, '0').toUpperCase();
  const normBg = '#' + parseInt(Object.values(parseHex(bg)).map((n) => n.toString(16).padStart(2, '0')).join(''), 16).toString(16).padStart(6, '0').toUpperCase();

  console.log('');
  console.log(`  Foreground:  ${normFg}`);
  console.log(`  Background:  ${normBg}`);
  console.log(`  Contrast:    ${ratio.toFixed(2)} : 1`);
  console.log('');
  console.log(`  ${pad('Level', 14)} ${pad('Threshold', 12)} Result`);
  console.log(`  ${'-'.repeat(14)} ${'-'.repeat(12)} ${'-'.repeat(6)}`);
  console.log(`  ${pad('AA normal',   14)} ${pad('4.5 : 1', 12)} ${check(ratio, 4.5)}`);
  console.log(`  ${pad('AA large',    14)} ${pad('3.0 : 1', 12)} ${check(ratio, 3.0)}`);
  console.log(`  ${pad('AAA normal',  14)} ${pad('7.0 : 1', 12)} ${check(ratio, 7.0)}`);
  console.log(`  ${pad('AAA large',   14)} ${pad('4.5 : 1', 12)} ${check(ratio, 4.5)}`);
  console.log('');

  // Exit non-zero when AA normal fails, so CI / scripts can catch.
  process.exit(ratio >= 4.5 ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1].endsWith('contrast.mjs')) {
  main();
}
