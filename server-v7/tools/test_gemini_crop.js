// ============================================================================
// tools/test_gemini_crop.js — unit test for cropAndResizeGeminiImage
//
// Reads the real Nano Banana sample dumped during Phase C
// (tools/reports/phase_c_gemini/page-01.png), runs it through the cropper,
// writes the output to tools/reports/test_crop_output.png, and asserts the
// dimensions are exactly 1536x1024.
//
// Usage: node tools/test_gemini_crop.js
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { cropAndResizeGeminiImage } from '../src/services/imageGen.js';

const INPUT = 'tools/reports/phase_c_gemini/page-01.png';
const OUTPUT_DIR = 'tools/reports';
const OUTPUT = path.join(OUTPUT_DIR, 'test_crop_output.png');

async function main() {
  if (!fs.existsSync(INPUT)) {
    console.error(`FAIL: input file missing: ${INPUT}`);
    process.exit(1);
  }
  const inBuf = fs.readFileSync(INPUT);
  const inMeta = await sharp(inBuf).metadata();
  console.log(`INPUT  ${INPUT}`);
  console.log(`  size=${inBuf.length} bytes  ${inMeta.width}x${inMeta.height}  format=${inMeta.format}`);

  const outBuf = await cropAndResizeGeminiImage(inBuf);
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT, outBuf);
  const outMeta = await sharp(outBuf).metadata();
  console.log(`OUTPUT ${OUTPUT}`);
  console.log(`  size=${outBuf.length} bytes  ${outMeta.width}x${outMeta.height}  format=${outMeta.format}`);

  let pass = 0;
  let fail = 0;
  const check = (cond, name) => {
    if (cond) { console.log(`  PASS: ${name}`); pass++; }
    else      { console.log(`  FAIL: ${name}`); fail++; }
  };
  check(outMeta.width === 1536, 'output width === 1536');
  check(outMeta.height === 1024, 'output height === 1024');
  check(outMeta.format === 'png', 'output format === png');
  check(outBuf.length > 100_000, 'output size > 100KB (sanity)');

  console.log(`\nResult: ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error('FAIL:', err);
  process.exit(1);
});
