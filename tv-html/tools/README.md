# TV-window self-verification tools

These three tools let the TV droid window verify its own UI changes without
relying on the founder to manually refresh a browser and send screenshots.

- `snap.mjs`      — headless Chromium screenshot of any TV route
- `contrast.mjs`  — WCAG 2.1 contrast ratio checker for text vs background
- SSH alias       — `ssh wonderbear-vps` tails the live server log on VPS

---

## Why these exist

The relay-document rule says **any "done" claim must be verified via `git pull` +
commit hash**. But TV UI changes go further than code — they need **visual
confirmation** that CDN assets paint, colors contrast correctly, and the
layout doesn't regress. These tools close that loop locally.

Default workflow after any TV UI edit:

1. Run `npm run typecheck` — must be 0 errors.
2. Run `node tools/snap.mjs ...` — screenshot the affected route(s).
3. If touching text colors, run `node tools/contrast.mjs <fg> <bg>` — must pass AA.
4. `git add / commit / push`.
5. Tail VPS log: `ssh wonderbear-vps "tail -20 /var/log/wonderbear-server.log"` —
   confirm no error storm after changes land on the live server.
6. Only then report "done" with commit hash + screenshot attached.

---

## 1. `snap.mjs` — Screenshot

### Install (one-time)

```powershell
npm install -g playwright
npx playwright install chromium        # ~110 MB download
```

### Use

```powershell
node tools/snap.mjs <url> <output-png> [--width=1280] [--height=720] [--wait=1000]
```

### Examples

```powershell
# First screen, default locale
node tools/snap.mjs "http://localhost:5173/?dev=1" .snaps/activation-zh.png

# Force English
node tools/snap.mjs "http://localhost:5173/?dev=1&locale=en" .snaps/activation-en.png

# 4K preview (viewport 3840x2160)
node tools/snap.mjs "http://localhost:5173/?dev=1" .snaps/activation-4k.png --width=3840 --height=2160

# Let animations settle longer
node tools/snap.mjs "http://localhost:5173/?dev=1" .snaps/ready.png --wait=3500
```

### Output

Writes the PNG to the given path and prints JSON:

```json
{
  "ok": true,
  "path": "E:\\...\\.snaps\\activation-zh.png",
  "width": 1280,
  "height": 720,
  "bytes": 1160027,
  "consoleLines": [
    "[log] [activation] {event: qr_url_built, url: https://h5.wonderbear.app/#/register?...}"
  ]
}
```

`consoleLines` captures the last 5 messages from the page's JS console —
useful for spotting async errors that might not appear in static markup.

### Viewport defaults

1280×720 = GP15 projector native. Override with `--width` / `--height` when
verifying 4K or phone-landscape.

### Screenshots go to `.snaps/`

`.snaps/` is gitignored. Never commit screenshot blobs.

---

## 2. `contrast.mjs` — WCAG check

### Install

None — pure math, no dependencies.

### Use

```powershell
node tools/contrast.mjs <fg-hex> <bg-hex>
```

### Examples

```powershell
# Current home-screen hero text over bright watercolor spot
node tools/contrast.mjs "#FFF5E6" "#FFE4B5"
# -> 1.14:1, FAIL AA/AAA both normal and large (bad — text invisible here)

# Hero text over dark canvas
node tools/contrast.mjs "#FFF5E6" "#2B1A0F"
# -> ~14:1, passes everything

# Amber accent on card bg
node tools/contrast.mjs "#FF8A3D" "#FFF8F0"
```

### Output

```text
  Foreground:  #FFF5E6
  Background:  #FFE4B5
  Contrast:    1.14 : 1

  Level          Threshold    Result
  -------------- ------------ ------
  AA normal      4.5 : 1      FAIL
  AA large       3.0 : 1      FAIL
  AAA normal     7.0 : 1      FAIL
  AAA large     4.5 : 1      FAIL
```

Exit code 0 if AA normal passes, 1 if it fails. Useful as a CI gate on
any PR that changes text colors.

### Thresholds (WCAG 2.1)

| Level       | Normal text       | Large text (>=18pt / >=14pt bold) |
|-------------|-------------------|-------------------------------------|
| AA          | 4.5:1             | 3:1                                 |
| AAA         | 7:1               | 4.5:1                               |

For TV at 2-3 m viewing distance, ALL text is effectively "large" per
distance-corrected equivalents — but we still report both thresholds so
the stricter one can be chosen where appropriate.

---

## 3. SSH to VPS — `wonderbear-vps`

### Config

Already written to `C:\Users\Administrator\.ssh\config`:

```sshconfig
Host wonderbear-vps
  HostName 154.217.234.241
  User root
  IdentityFile ~/.ssh/wonderbear_vps
  StrictHostKeyChecking accept-new
  ServerAliveInterval 60
```

Key pair at `~/.ssh/wonderbear_vps` (ed25519). Public key is already in the
VPS `authorized_keys`.

### Use

```powershell
# Health check
ssh wonderbear-vps "uptime"

# Tail live server log
ssh wonderbear-vps "tail -20 /var/log/wonderbear-server.log"

# Follow live log (ctrl-C to stop)
ssh wonderbear-vps "tail -f /var/log/wonderbear-server.log"

# Free disk / RAM
ssh wonderbear-vps "free -h; df -h /"

# Which node processes
ssh wonderbear-vps "ps -ef | grep node | grep -v grep"
```

### Never do on VPS

- `sudo reboot` — unless founder explicitly asks
- Edit server-v7 code directly on VPS — always go through git pull
- Kill production Fastify without founder's go-ahead
- Write any API secret to disk from this session

---

## Typical after-edit loop

### Scenario: bumped button padding in HomeScreen

```powershell
# 1. Code edit
#    (use Edit tool)

# 2. Static checks
cd tv-html
npm run typecheck

# 3. Screenshot — make sure dev server is running at 5173
node tools/snap.mjs "http://localhost:5173/?dev=1" .snaps/home-after-padding.png

# 4. Compare mentally (or diff with previous .snaps/home-before-padding.png)

# 5. Commit + push
cd ..
git add tv-html/src/screens/HomeScreen.vue
git commit -m "fix(tv-html): home button padding 12 -> 16"
git push origin main

# 6. Confirm VPS got any downstream ripples (rare for pure CSS, routine for API)
ssh wonderbear-vps "tail -30 /var/log/wonderbear-server.log | grep -i 'err\\|warn' || echo '[clean]'"

# 7. Report
#    - commit hash
#    - path to screenshot(s)
#    - any warnings from VPS log
#    - honest list of unverified bits
```

### Scenario: bumped body text to new color

```powershell
# Verify contrast BEFORE push
node tools/contrast.mjs "#NEW_COLOR" "#BG_IT_SITS_ON"
# Must exit 0 (AA pass) before committing.

# Screenshot
node tools/snap.mjs "http://localhost:5173/?dev=1" .snaps/text-after.png
```

---

## Known limits

- **`snap.mjs` doesn't capture animations** — takes a single frame after
  `networkidle + wait ms`. For animation QA you still need a live browser.
- **`snap.mjs` renders text via headless Chromium's font stack** — Windows
  Chinese text shows using Microsoft YaHei; on the VPS it would use a
  different fallback, and on the real GP15 projector yet another. Use the
  screenshot only for **layout / color / asset-loading** verification, not
  as a final typography approval.
- **Bridge is always `MOCK` in headless browser** — there's no `window.Android`
  so the bridge creates a mock. This matches `?dev=1` behavior.
- **Contrast.mjs does not factor in font size / weight** — caller must
  manually decide whether "large text" threshold applies.
