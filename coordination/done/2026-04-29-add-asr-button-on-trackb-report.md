# Add ASR Debug Floating Button on Track B (release/showroom-20260429)

**From**: Factory
**To**: Kristy / Claude
**Time**: 2026-04-29 16:50
**Branch**: release/showroom-20260429 (Track B v7.2 cherry-picked, server-side merged)
**Refs**: workorder 2026-04-29-add-asr-button-on-trackb

---

## TL;DR

Added a temporary floating "按住说话" debug button to `src/screens/DialogueScreen.vue`
that re-uses Track B's existing `onVoiceKeyDown` / `onVoiceKeyUp` handlers
(bridge `voice-key-down` / `voice-key-up` events), plus extensive `[debug-asr]`
console logs along the path bridge → MediaRecorder mimeType inference → blob
header → `POST /dialogue/turn` → response/error. Build clean, bundle self-check
PASS. **Not deployed, not committed, not pushed** per work order red lines.

---

## Phase 1 — Reconnaissance Results

**Conclusion**: Case **(a)** confirmed. Track B uses bridge `voice-key-down` /
`voice-key-up` events to drive `onVoiceKeyDown` / `onVoiceKeyUp` in
`DialogueScreen.vue`. No alternative recording entry point.

### Evidence

`src/screens/DialogueScreen.vue` — pre-edit length: **1713 lines**

Pre-edit grep for `voice-key|MediaRecorder|onVoiceKey|startRecord|stopRecord|audioBase64|submitTurn`:

| Line | Symbol |
|------|--------|
| 276  | `function onVoiceKeyDown(): void` (handler — case a) |
| 297  | `async function onVoiceKeyUp(): Promise<void>` (handler — case a) |
| 305  | `let audioBase64: string \| null = null;` (in onVoiceKeyUp) |
| 308  | `audioBase64 = result instanceof Promise ? await result : result;` |
| 320  | `await submitTurn({ audioBase64, skipRemaining: false });` |
| 359  | `async function submitTurn(payload:...)` |
| 414  | comment "Server runs ASR internally on audioBase64" |
| 421  | comment "audioMimeType is REQUIRED when audioBase64 is present" |
| 424  | `const audioMimeType = payload.audioBase64 ? (bridge.isMock ? 'audio/webm' : 'audio/wav') : undefined;` |
| 430  | `audioBase64: payload.audioBase64,` (sent to api.dialogueTurn) |
| 684  | `unsubVoiceDown = bridge.on('voice-key-down', onVoiceKeyDown);` |
| 685  | `unsubVoiceUp = bridge.on('voice-key-up', onVoiceKeyUp);` |

`src/services/bridge/*.ts` voice-key/MediaRecorder grep:

- `index.ts:8` — example: `bridge.on('voice-key-down', () => {...})`
- `pushBus.ts:47-48` — `window.onRemoteVoiceKeyDown/Up = () => emit('voice-key-down'|'voice-key-up')`
- `types.ts:34-45` — emits / payload typing for `voice-key-down|up`
- `mock.ts:50` — `let mediaRecorder: MediaRecorder | null = null;`
- `mock.ts:139` — `mediaRecorder = new MediaRecorder(mediaStream);`
- `mock.ts:195-196` — `simulateVoiceKeyDown/Up()` debug helpers

**Decision**: case (a) — proceed to Phase 2 wiring the new button straight
into `onVoiceKeyDown` / `onVoiceKeyUp` (no new recording path; no bridge
modifications).

---

## Phase 2 — Files Modified

| File | Pre-edit lines | Post-edit lines | Δ |
|------|---------------:|----------------:|--:|
| `src/screens/DialogueScreen.vue` | 1713 | 1847 | **+134** |

**Only file modified.** No bridge files touched, no other screen files, no
config, no package.json. All new code is annotated with
`// DEBUG-ASR-BUTTON: temporary` (or `/* DEBUG-ASR-BUTTON: temporary */` in CSS,
`<!-- DEBUG-ASR-BUTTON: temporary ... -->` in template) for easy removal later.

---

## Phase 2 — Code Snippets

### 2a. New press-state + button handlers (script, ~12 lines, around line 276)

```ts
// DEBUG-ASR-BUTTON: temporary — press-state for the floating debug mic button.
const debugAsrPressed = ref(false);
function onDebugAsrButtonDown(): void {
  if (debugAsrPressed.value) return;
  debugAsrPressed.value = true;
  onVoiceKeyDown();
}
function onDebugAsrButtonUp(): void {
  if (!debugAsrPressed.value) return;
  debugAsrPressed.value = false;
  void onVoiceKeyUp();
}
```

`debugAsrPressed.value` guards against double-fire when both `mouseup` and
`mouseleave` fire (and against `touchend` racing with synthesised `mouseup`
on touch devices). The handlers are pure call-throughs to the existing
`onVoiceKeyDown` / `onVoiceKeyUp` — no recording logic was duplicated.

### 2b. Floating button (template, ~16 lines, around line 1144)

Inserted just before the closing `</div></template>` of `.dialogue-screen`,
right after the existing `<div ref="okCaptureEl" ... />`:

```vue
<!-- DEBUG-ASR-BUTTON: temporary — floating push-to-talk button so we can
     drive the same onVoiceKeyDown/Up handlers (bridge voice-key events)
     from a browser without a remote, for ASR diagnosis. -->
<button
  class="debug-asr-button"
  :class="{ pressed: debugAsrPressed }"
  type="button"
  aria-label="debug-asr"
  @mousedown.prevent="onDebugAsrButtonDown"
  @mouseup.prevent="onDebugAsrButtonUp"
  @mouseleave="onDebugAsrButtonUp"
  @touchstart.prevent="onDebugAsrButtonDown"
  @touchend.prevent="onDebugAsrButtonUp"
  @touchcancel.prevent="onDebugAsrButtonUp"
>
  {{ debugAsrPressed ? '录音中...' : '按住说话' }}
</button>
```

### 2c. CSS (style block, ~28 lines, around line 1819)

```css
/* DEBUG-ASR-BUTTON: temporary */
.debug-asr-button {
  position: fixed;
  right: 30px;
  bottom: 30px;
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: #e63946;
  color: #ffffff;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.1;
  border: none;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
  cursor: pointer;
  z-index: 9999;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
  padding: 0;
}
.debug-asr-button.pressed {
  background: #a4161a;
}
.debug-asr-button:focus { outline: none; }
```

Idle state: red `#e63946`, 80×80 round, fixed at `right:30px / bottom:30px`,
`z-index:9999`. Pressed state: dark red `#a4161a`. Text swaps between
`按住说话` and `录音中...`.

---

## Phase 2 — `console.log` Locations

All logs are inside the **function bodies** (not just on button events), so
real-remote `voice-key-down/up` will produce identical traces, not just the
debug button. Total **12 `console.log` call sites**, all prefixed with
`[debug-asr]`.

| # | Function | Line | What it logs |
|---|----------|-----:|--------------|
| 1 | `onVoiceKeyDown` | 291 | `voice key down triggered` + `{ mounted, phase, inFlight, bridgeIsMock }` |
| 2 | `onVoiceKeyDown` | 306 | `startVoiceRecord called; inferred MediaRecorder mimeType = ...` (`audio/webm` if mock else `audio/wav`; bridge encapsulates the `MediaRecorder` instance, so we log the same value `submitTurn` later sends as `audioMimeType`) |
| 3 | `onVoiceKeyDown` | 311 | `start_record_failed` + err string (in async catch) |
| 4 | `onVoiceKeyDown` | 320 | `start_record_threw` + err string (in sync catch) |
| 5 | `onVoiceKeyUp` | 327 | `voice key up triggered` + `{ mounted, phase, inFlight }` |
| 6 | `onVoiceKeyUp` | 346 | `stop_record_failed` + err string |
| 7 | `onVoiceKeyUp` | 358 | `blob ready` + `{ type, approxBlobSize, base64Length, first16Hex }` (decodes first 24 base64 chars → 16 raw bytes → space-separated hex; identifies WebM EBML / WAV RIFF magic) |
| 8 | `onVoiceKeyUp` | 365 | `decode head failed` (atob threw) |
| 9 | `onVoiceKeyUp` | 368 | `no audioBase64 returned from bridge` |
| 10 | `submitTurn` | 487 | `POST /dialogue/turn` + `{ dialogueId, round, audioMimeType, hasAudio, base64Length, skipRemaining, locale }` |
| 11 | `submitTurn` | 506 | `/dialogue/turn response` + `{ done, hasNextQuestion, nextQuestionTextHead (≤40 chars), safetyLevel, hasSummary }` |
| 12 | `submitTurn` | 546 / 551 | `/dialogue/turn ApiError` (`{ code, message≤200 }`) **or** `/dialogue/turn threw non-ApiError` (≤200 chars) — both inside the `catch (e)` block |

Verification grep:

```
$ grep -c "console.log..debug-asr" src/screens/DialogueScreen.vue
12
```

> **Note re. `mediaRecorder.mimeType`**: The work order asked us to log
> `mediaRecorder.mimeType` at MediaRecorder creation. The MediaRecorder is
> instantiated inside `src/services/bridge/mock.ts:139`, which is on the red
> list (do NOT modify bridge). The bridge does not expose a `getRecordedMimeType()`
> hook. The closest available log is the inferred type used for the
> `audioMimeType` upload field — `bridge.isMock ? 'audio/webm' : 'audio/wav'` —
> which we log at log #2. If the real recording mime is suspected to differ
> from this inference, the next iteration should add a `getRecordedMimeType()`
> getter on the bridge interface (separate work order).

---

## Phase 3 — Verification

### 3.1 `node_modules` status

```
$ ls -d /opt/wonderbear/tv-html/node_modules
/opt/wonderbear/tv-html/node_modules
```

Present. No `npm install` was run.

### 3.2 `npm run build` — last lines

```
> wonderbear-tv@0.3.1 build
> vue-tsc --noEmit && vite build

vite v5.4.21 building for production...
transforming...
✓ 206 modules transformed.
rendering chunks...
[plugin:vite:reporter]
(!) /opt/wonderbear/tv-html/src/stores/story.ts is dynamically imported by ...
    <pre-existing dynamic-import advisory, unrelated to this change>
computing gzip size...
dist/index.html                       1.17 kB │ gzip:   0.66 kB
dist/assets/GalleryView-CGeRkKiJ.css  2.94 kB │ gzip:   1.00 kB
dist/assets/index-DNwaVVZe.css        79.76 kB │ gzip:  13.69 kB
dist/assets/GalleryView-DCbtXXAj.js   6.51 kB │ gzip:   3.43 kB
dist/assets/index-pnyUeliu.js         318.01 kB │ gzip: 110.91 kB
✓ built in 6.73s
```

- `vue-tsc --noEmit` — **0 TypeScript errors**.
- The single `[plugin:vite:reporter]` advisory is the **pre-existing**
  `story.ts is dynamically imported by main.ts but also statically imported`
  notice (present on every Track B build prior to this change). Not blocking.
- Build exit code: 0.

### 3.3 `ls -la dist/`

```
total 20
drwxr-xr-x 4 root root 4096 Apr 29 16:48 .
drwxr-xr-x 7 root root 4096 Apr 29 16:48 ..
drwxr-xr-x 2 root root 4096 Apr 29 16:48 assets
drwxr-xr-x 2 root root 4096 Apr 29 16:48 fonts
-rw-r--r-- 1 root root 1174 Apr 29 16:48 index.html
```

Build artifact present at `/opt/wonderbear/tv-html/dist/`.

### 3.4 Bundle self-check (both must hit)

```
$ grep -l "按住说话" dist/assets/*.js
dist/assets/index-pnyUeliu.js
$ grep -l "debug-asr" dist/assets/*.js
dist/assets/index-pnyUeliu.js
```

✅ Both PASS — the button's Chinese label and the `debug-asr` logs/CSS class
are present in the production bundle.

---

## Compliance With Red Lines

| Red line | Status |
|----------|--------|
| Do NOT modify `src/services/bridge/*` | ✅ untouched |
| Do NOT remove existing keydown / voice-key handlers | ✅ existing keydown handlers and `bridge.on('voice-key-down'/'voice-key-up')` subscriptions intact (lines 684-685 of pre-edit / 720-721 of post-edit) |
| Do NOT modify any file other than `DialogueScreen.vue` | ✅ only `src/screens/DialogueScreen.vue` was edited |
| Do NOT git commit, do NOT git push | ✅ no git operations performed |
| Do NOT npm install | ✅ `node_modules` already present, no install ran |
| Do NOT deploy `dist` to `/var/www` | ✅ no deploy |
| Do NOT `pm2 restart` | ✅ not invoked |

`git status --porcelain` (current) shows only `coordination/...` untracked
files plus the modified `tv-html/src/screens/DialogueScreen.vue` (uncommitted,
on branch `release/showroom-20260429`, as required).

---

## Next Step Hint for Kristy

When you want to test the debug button on the VPS:

1. Deploy the freshly built bundle:
   ```bash
   rsync -av --delete /opt/wonderbear/tv-html/dist/ /var/www/wonderbear-tv/
   ```
   (Or whichever copy command the VPS deploy playbook uses — `cp -r` works too;
   no `pm2 restart` needed since this is static front-end only.)

2. Open the dialogue screen in a browser (real one, not `?dev=1`, otherwise
   the screen short-circuits to the painter-bear CTA via the dev guard at
   line ~745). Open DevTools console **before** pressing the button.

3. Press-and-hold the red 80×80 button at bottom-right.
   - Expect `[debug-asr] voice key down triggered` immediately.
   - Expect `[debug-asr] startVoiceRecord called; inferred MediaRecorder mimeType = audio/webm` (in browser, bridge.isMock=true).
   - Release → expect `voice key up triggered` → `blob ready` (with hex header — `1a 45 df a3` = WebM EBML, `52 49 46 46` = WAV RIFF) → `POST /dialogue/turn` → `/dialogue/turn response` (or `ApiError`).

4. After the diagnosis, removing the button is one `grep -n "DEBUG-ASR-BUTTON" src/screens/DialogueScreen.vue` away — every block is tagged.

---

**End of report.**
