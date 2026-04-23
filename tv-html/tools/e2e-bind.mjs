#!/usr/bin/env node
/**
 * End-to-end smoke for the H5 device-bind happy path.
 *
 * This test is self-contained: each run fabricates its own short-lived
 * activation code + synthetic TV device so it never interferes with
 * founder-facing demo codes like CRRTXMGL. The code is cleaned up at
 * the end (best-effort) via the same ssh helper script.
 *
 * Flow:
 *   0. Seed DB via ssh: create a fresh ActivationCode row (status=issued)
 *      with a random E2E<xxxx> code
 *   1. POST /api/device/register with that code + a synthetic deviceId
 *      (simulates what the TV would do on first boot) — code goes from
 *      'issued' -> 'activated', usedByDeviceId populated
 *   2. Open H5 /register with a throw-away email, click "Send code"
 *   3. Fetch the verification code directly from the VPS Redis
 *      (auth:verify:<email>:register) via ssh
 *   4. Fill code, accept terms, submit -> land on /home with parentToken
 *      in localStorage
 *   5. Navigate to /devices -> click "+ Add device" -> input the seeded
 *      activation code -> click "Bind"
 *   6. Wait for the success toast + screenshot to bind-success.png
 *   7. Assert server-side via GET /api/device/list that the device is
 *      now bound to this parent
 *   8. Cleanup: delete the seeded ActivationCode (ignore failures)
 *
 * Usage:
 *   node tools/e2e-bind.mjs
 *   node tools/e2e-bind.mjs --h5=http://localhost:5174 --ssh=wonderbear-vps \
 *                           --api=http://154.217.234.241:3000
 *
 * Exit codes: 0 = pass, 1 = any step failed
 *
 * Preconditions:
 *   - playwright globally installed (same as snap.mjs)
 *   - H5 dev server running at --h5 (default localhost:5174)
 *   - `ssh <alias>` works passwordless and the remote root has
 *     /opt/wonderbear/server-v7 with node_modules installed
 */

import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { existsSync, mkdirSync, statSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

// ---------- args ----------
function parseArgs(argv) {
  const out = {
    h5: 'http://localhost:5174',
    ssh: 'wonderbear-vps',
    api: 'http://154.217.234.241:3000',
    headless: true,
    keepOpen: false,
  };
  for (const a of argv.slice(2)) {
    if (a.startsWith('--h5=')) out.h5 = a.slice(5).replace(/\/$/, '');
    else if (a.startsWith('--ssh=')) out.ssh = a.slice(6);
    else if (a.startsWith('--api=')) out.api = a.slice(6).replace(/\/$/, '');
    else if (a === '--headed') out.headless = false;
    else if (a === '--keep-open') out.keepOpen = true;
    else if (a === '-h' || a === '--help') {
      console.log(
        'Usage: node tools/e2e-bind.mjs [--h5=URL] [--ssh=alias] [--api=URL] [--headed] [--keep-open]',
      );
      process.exit(0);
    }
  }
  return out;
}

// ---------- fresh credentials per run ----------
function genActivationCode() {
  // 8 chars, A-Z/2-9 (no 0/1/I/O to avoid ambiguity), fits DEVICE code regex
  const alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = 'E2E';
  while (s.length < 8) s += alpha[Math.floor(Math.random() * alpha.length)];
  return s;
}
function genDeviceId() {
  return `e2e-dev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

// ---------- playwright resolve (same trick as snap.mjs) ----------
async function resolvePlaywright() {
  try {
    const req = createRequire(import.meta.url);
    return req('playwright');
  } catch {}
  const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
  const globalPath = `${root.replace(/\\/g, '/')}/playwright`;
  const mod = await import(`file:///${globalPath}/index.js`);
  return mod.default || mod;
}

// ---------- helpers ----------
const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const log = (msg) => console.log(`[${stamp()}] ${msg}`);

function sshWithRetry(cmd, attempts = 5) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return execSync(cmd, { encoding: 'utf8', timeout: 20_000 });
    } catch (e) {
      lastErr = e;
      const msg = (e.stderr || e.message || '').toString();
      // VPS rate-limits rapid ssh connection churn with a TCP RST at kex time.
      // Back off and retry — a 2s pause is almost always enough.
      if (/kex_exchange_identification|Connection closed/i.test(msg) && i < attempts - 1) {
        const waitMs = 1500 + i * 1000;
        execSync(
          process.platform === 'win32'
            ? `powershell -Command "Start-Sleep -Milliseconds ${waitMs}"`
            : `sleep ${waitMs / 1000}`,
          { stdio: 'ignore' },
        );
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

function fetchCodeFromRedis(sshAlias, email) {
  // Redis value is "code:attemptsLeft" (see server-v7 src/utils/verifyCode.js).
  // The VPS runs redis in a container; non-interactive ssh shells don't have
  // redis-cli on PATH, so go via docker exec.
  const key = `auth:verify:${email}:register`;
  const raw = sshWithRetry(
    `ssh ${sshAlias} "docker exec wonderbear_redis redis-cli GET ${key}"`,
  ).trim();
  if (!raw) throw new Error(`Redis returned empty for ${key}`);
  const [code] = raw.split(':');
  if (!/^\d{6}$/.test(code)) throw new Error(`Redis gave unexpected shape: "${raw}"`);
  return code;
}

// ---------- DB seed / cleanup via scp'd helper script ----------
//
// We write a tiny prisma-using .mjs to a local tmp file, scp it to the VPS,
// run it, parse its stdout, then delete both copies. No permanent files
// left anywhere. Uses the server-v7 node_modules (@prisma/client already
// installed there).

const SEED_SCRIPT = `
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const cmd = process.argv[2];
const code = process.argv[3];
try {
  if (cmd === 'seed') {
    const row = await p.activationCode.create({
      data: { code, batchId: 'e2e-bind-smoke', status: 'issued' },
    });
    console.log(JSON.stringify({ ok: true, id: row.id, code: row.code }));
  } else if (cmd === 'cleanup') {
    const row = await p.activationCode.findUnique({ where: { code } });
    if (row) {
      // Break FK references first: clear Device.activationCodeId if any.
      await p.device.updateMany({
        where: { activationCodeId: row.id },
        data: { activationCodeId: null },
      });
      await p.activationCode.delete({ where: { id: row.id } });
      console.log(JSON.stringify({ ok: true, deleted: row.id }));
    } else {
      console.log(JSON.stringify({ ok: true, deleted: null }));
    }
  } else if (cmd === 'wipeDevice') {
    // code arg here is actually deviceId
    await p.device.deleteMany({ where: { deviceId: code } });
    console.log(JSON.stringify({ ok: true, deletedDeviceId: code }));
  } else {
    throw new Error('unknown cmd: ' + cmd);
  }
} catch (err) {
  console.log(JSON.stringify({ ok: false, error: err.message }));
  process.exitCode = 1;
} finally {
  await p.$disconnect();
}
`;

// Remote helper is uploaded ONCE per run. Callers in the same run then
// invoke it multiple times (seed / cleanup / wipeDevice) without re-scp'ing.
let helperUploaded = false;
const REMOTE_HELPER = '/opt/wonderbear/server-v7/_e2e_helper.mjs';

function ensureHelperUploaded(sshAlias) {
  if (helperUploaded) return;
  const localTmp = resolve(tmpdir(), `wb-e2e-seed-${process.pid}.mjs`);
  writeFileSync(localTmp, SEED_SCRIPT, 'utf8');
  try {
    sshWithRetry(`scp "${localTmp}" ${sshAlias}:${REMOTE_HELPER}`);
    helperUploaded = true;
  } finally {
    try { unlinkSync(localTmp); } catch {}
  }
}

function runPrismaHelper(sshAlias, cmd, arg) {
  ensureHelperUploaded(sshAlias);
  const raw = sshWithRetry(
    `ssh ${sshAlias} "cd /opt/wonderbear/server-v7 && node ${REMOTE_HELPER} ${cmd} ${arg}"`,
  ).trim();
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const last = lines[lines.length - 1] || '{}';
  const parsed = JSON.parse(last);
  if (!parsed.ok) throw new Error(`helper ${cmd} failed: ${parsed.error}`);
  return parsed;
}

function removeHelperRemotely(sshAlias) {
  try {
    sshWithRetry(`ssh ${sshAlias} "rm -f ${REMOTE_HELPER}"`);
  } catch {}
}

async function tvRegister(api, deviceId, activationCode) {
  const r = await fetch(`${api}/api/device/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deviceId,
      activationCode,
      model: 'GP15-E2E',
      firmwareVer: 'e2e-test',
    }),
  });
  const body = await r.json();
  if (r.status !== 200 || body.code !== 0) {
    throw new Error(`TV /device/register failed: HTTP ${r.status} ${JSON.stringify(body)}`);
  }
  return body.data;
}

// ---------- main ----------
async function main() {
  const args = parseArgs(process.argv);
  const email = `e2e-${Date.now()}@wonderbear.test`;
  const code = genActivationCode();
  const deviceId = genDeviceId();
  const outPng = resolve(dirname(fileURLToPath(import.meta.url)), 'bind-success.png');
  if (!existsSync(dirname(outPng))) mkdirSync(dirname(outPng), { recursive: true });

  log(`Email: ${email}`);
  log(`Synthetic activation code: ${code}`);
  log(`Synthetic TV deviceId: ${deviceId}`);
  log(`H5: ${args.h5}  |  API: ${args.api}  |  SSH: ${args.ssh}`);

  // ---- Step 0a: seed DB with fresh activation code ----
  log('Step 0a: seed ActivationCode row in DB');
  runPrismaHelper(args.ssh, 'seed', code);

  // ---- Step 0b: simulate TV /api/device/register so code moves to 'activated' ----
  log('Step 0b: simulate TV /device/register (code -> activated, usedByDeviceId set)');
  await tvRegister(args.api, deviceId, code);

  const pw = await resolvePlaywright();
  const browser = await pw.chromium.launch({ headless: args.headless });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();

  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  const cleanup = async () => {
    try {
      log('Cleanup: drop Device + ActivationCode rows created for this run');
      runPrismaHelper(args.ssh, 'wipeDevice', deviceId);
      runPrismaHelper(args.ssh, 'cleanup', code);
      removeHelperRemotely(args.ssh);
    } catch (e) {
      log(`  cleanup skipped: ${e.message}`);
    }
  };

  try {
    // --- 1. open register ---
    log('Step 1: open /register');
    await page.goto(`${args.h5}/#/register`, { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await page.waitForTimeout(500);

    // --- 2. fill email + click send-code ---
    log('Step 2: fill email + send code');
    // Vant may not propagate type="email" to the native input; fall back to
    // the first van-field control on the page (email is always the first field).
    const emailInput = page
      .locator('input[type="email"], .van-field__control')
      .first();
    await emailInput.waitFor({ state: 'visible', timeout: 10_000 });
    await emailInput.fill(email);

    // Button label switches by i18n — target by role+text that fits either 'Send code' / '发送验证码'.
    const sendBtn = page
      .getByRole('button', { name: /send code|发送验证码|wyślij|trimite/i })
      .first();
    await sendBtn.click();
    await page.waitForTimeout(1500); // let /api/auth/send-code settle into redis

    // --- 3. fetch code from VPS redis ---
    log('Step 3: fetch verify code from VPS redis');
    const verifyCode = fetchCodeFromRedis(args.ssh, email);
    log(`  got verify code: ${verifyCode}`);

    // --- 4. fill code ---
    log('Step 4: fill verification code');
    // CodeInput is a single native input with maxlength=6
    const codeInput = page.locator('input[maxlength="6"]').first();
    await codeInput.fill(verifyCode);
    await page.waitForTimeout(200);

    // --- 5. accept terms + submit ---
    log('Step 5: accept terms + submit register');
    const termsCheckbox = page.locator('.van-checkbox').first();
    await termsCheckbox.click();

    const submitBtn = page.getByRole('button', { name: /create account|创建账号|注册/i }).first();
    await submitBtn.click();

    // Wait for landing on /home (or error)
    await page.waitForFunction(
      () => window.location.hash.includes('#/home') || window.location.hash.includes('#/onboard'),
      null,
      { timeout: 15_000 },
    );
    log(`  landed on ${await page.evaluate(() => window.location.hash)}`);

    // --- 6. capture parentToken from localStorage ---
    const parentToken = await page.evaluate(() =>
      localStorage.getItem('wb_parent_token') ||
      localStorage.getItem('wb_token') ||
      localStorage.getItem('parentToken'),
    );
    if (!parentToken) {
      const keys = await page.evaluate(() => Object.keys(localStorage));
      throw new Error(`parentToken not found in localStorage (keys: ${keys.join(',')})`);
    }
    log(`  parentToken captured (${parentToken.length} chars)`);

    // --- 7. navigate to /devices ---
    log('Step 7: navigate to /devices');
    await page.goto(`${args.h5}/#/devices`, { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await page.waitForTimeout(800);

    // --- 8. open add-device dialog ---
    log('Step 8: click "+ Add device"');
    const addBtn = page.getByRole('button', { name: /add device|添加设备|dodaj|adaugă/i }).first();
    await addBtn.click();
    await page.waitForTimeout(400);

    // --- 9. type activation code into CodeInput (alphanumeric, maxlength=8) ---
    log('Step 9: type activation code');
    const codeBox = page.locator('input[maxlength="8"]').first();
    await codeBox.fill(code);
    await page.waitForTimeout(200);

    // --- 10. click Bind ---
    log('Step 10: click Bind');
    const bindBtn = page.getByRole('button', { name: /^bind$|^绑定$|^powiąż$|^asociază$/i }).first();
    await bindBtn.click();

    // --- 11. wait for success toast ---
    log('Step 11: wait for success toast');
    await page.waitForSelector('.van-toast--success, .van-toast', { timeout: 10_000 });
    await page.waitForTimeout(500);

    // --- 12. screenshot ---
    log(`Step 12: screenshot -> ${outPng}`);
    await page.screenshot({ path: outPng, fullPage: false });
    const size = statSync(outPng).size;

    // --- 13. server-side assert via /api/device/list ---
    log('Step 13: GET /api/device/list to confirm binding');
    const list = await page.evaluate(
      async ({ api, token }) => {
        const r = await fetch(`${api}/api/device/list`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        return { status: r.status, body: await r.json() };
      },
      { api: args.api, token: parentToken },
    );
    const items = list?.body?.data?.items ?? [];
    log(`  /device/list -> HTTP ${list.status}, items=${items.length}`);
    if (list.status !== 200 || list.body?.code !== 0) {
      throw new Error(`/device/list failed: ${JSON.stringify(list.body)}`);
    }
    if (items.length === 0) {
      throw new Error('Bind toast showed but /device/list is still empty');
    }

    // ---------- report ----------
    const report = {
      ok: true,
      email,
      activationCode: code,
      tvDeviceId: deviceId,
      bound: items.map((d) => ({
        deviceId: d.deviceId,
        status: d.status,
        storiesLeft: d.storiesLeft,
      })),
      screenshot: outPng,
      screenshotBytes: size,
      pageErrors: errors,
    };
    console.log('\n' + JSON.stringify(report, null, 2));
    if (!args.keepOpen) await browser.close();
    await cleanup();
    process.exit(0);
  } catch (err) {
    const hash = await page.evaluate(() => location.hash).catch(() => '?');
    const failPng = outPng.replace(/\.png$/, '-FAIL.png');
    await page.screenshot({ path: failPng, fullPage: false }).catch(() => {});
    console.error(
      '\n' +
        JSON.stringify(
          {
            ok: false,
            email,
            activationCode: code,
            tvDeviceId: deviceId,
            error: err.message,
            hash,
            pageErrors: errors,
            failScreenshot: failPng,
          },
          null,
          2,
        ),
    );
    if (!args.keepOpen) await browser.close();
    await cleanup();
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('e2e-bind.mjs fatal:', e.stack || e.message);
  process.exit(1);
});
