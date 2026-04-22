# Handoff for next TV window — v0.3.1

> All 12 P0 screens done + contract realigned to git-authoritative API_CONTRACT.md
> + patch v3 integrated (dialogue audioBase64 + audioMimeType + recognizedText).
> Next window's job: bug fixes during integration with real backend, plus any P1 polish.

## What's done — v0.3.1

Vue3 + Vite + TS + Pinia + **all 12 P0 screens shipped** + **contract aligned to git authoritative spec** + **API_CONTRACT_PATCH_v3 integrated**.

**Verification (must pass before any commit):**
- `npm run typecheck` → 0 errors ✅
- `npm run build`     → **225.56 KB JS / 81.48 KB gzip** (under 400 KB ceiling, headroom 174 KB) ✅
- 5 Week 6 SFCs probed via Vite transform → all HTTP 200 ✅

### All 12 P0 screens

| # | Screen | File | Phase |
|---|---|---|---|
| 1 | Activation | `screens/ActivationScreen.vue` | v0.1 |
| 2 | Home | `screens/HomeScreen.vue` | v0.1 |
| 3 | Dialogue | `screens/DialogueScreen.vue` | v0.2 + v0.3 contract realign |
| 4 | Generating | `screens/GeneratingScreen.vue` | v0.2 + v0.3 contract realign |
| 5 | StoryCover | `screens/StoryCoverScreen.vue` | v0.2 |
| 6 | StoryBody | `screens/StoryBodyScreen.vue` | v0.2 + v0.3 contract realign |
| 7 | StoryEnd | `screens/StoryEndScreen.vue` | v0.2 |
| 8 | Library | `screens/LibraryScreen.vue` | v0.3 |
| 9 | Learning | `screens/LearningScreen.vue` | v0.3 |
| 10 | Profile | `screens/ProfileScreen.vue` | v0.3 |
| 11 | Offline | `screens/OfflineScreen.vue` | v0.3 |
| 12 | Error | `screens/ErrorScreen.vue` | v0.3 (handles all 12 tvAction values) |

### v0.3.1 changes

**Patch v3 integrated** (`server-v7/docs/spec/API_CONTRACT_PATCH_v3.md`, pushed 2026-04-22):
- `DialogueTurnReq` adds `audioMimeType?: string` (REQUIRED when `audioBase64` present per patch)
- `DialogueTurnReq` adds `locale?: Locale` (server uses to localize bear's response)
- `DialogueTurnResp` adds `recognizedText?: string` (ASR result when audioBase64 path used)
- `DialogueScreen.submitTurn()` now sends both fields
- MIME type heuristic: mock bridge → `'audio/webm'` (Chromium MediaRecorder default); real bridge → `'audio/wav'` (GP15 Shell SCO → PCM WAV per §5.1). When real bridge lands, expose `bridge.getRecordedMimeType()` and read from there instead of this heuristic.

⚠️ **Potential discrepancy with server**: patch v3 lists allowed MIME as `'audio/mpeg' | 'audio/wav' | 'audio/ogg'`; browser mock produces `'audio/webm'`. If server rejects webm, either (a) convert client-side via `AudioContext` before base64 (adds ~50ms), or (b) ask server window to whitelist webm. Flag during first real integration.

### v0.3 changes

**Contract realignment** (per founder Q1=A decision):
- `services/api.ts` rewritten — all 18 endpoints match `server-v7/docs/spec/API_CONTRACT.md` field names exactly
- `stores/dialogue.ts` rewritten — `round` 1-based, `currentQuestion`, `safetyLevel`/`safetyReplacement`
- `stores/story.ts` rewritten — `Story` type, `pageNum` 1-based, `percent`/`stage`/`pagesGenerated`
- `stores/child.ts` rewritten — uses `Child` from api.ts, `ageToBucket()` helper
- `stores/device.ts` rewritten — `applyRegisterResponse()`, syncs activeChild to child store on `/device/status`
- `OemConfig.brandName` is now `{zh,en,pl?,ro?}` object — `device.brandName` getter uses current locale
- `OemConfig.h5BaseUrl` added per protocol patch v2

**ASR strategy** (per founder Q2=B decision):
- TV sends `audioBase64` field directly to `/dialogue/turn` (server runs ASR internally)
- Saves ~200ms × 7 rounds = ~1.4s perceived wait per session
- **Server window must implement this in batch 4** — confirmed protocol amendment

**Week 6 5 screens**:
- `LibraryScreen` — 3-col grid with focus nav; uses extracted `components/StoryCard.vue` (mirrors MenuCard pattern)
- `LearningScreen` — 60px subtitles + bear_pointing + replay button (per-char TTS deferred until server contract has it)
- `ProfileScreen` — child card + storiesLeft + BGM toggle + 4-locale switcher
- `OfflineScreen` — bear_no_network + retry button (App.vue auto-jumps here on `network-change=false`)
- `ErrorScreen` — dispatches all 12 `tvAction` enum values from errorCodes.ts

### Still on the don't-rewrite list

- `services/bridge/*` (5 files) — real+mock factory, never touch
- `services/focus/*` (5 files) — registry + scope + neighbors + key router
- `services/api.ts` — only modify if `api-actual.md` shows new server divergence
- `utils/buildBindingUrl.ts` — cross-end hard contract, breaking it kills H5 scan
- `utils/errorCodes.ts` — 36+ codes × 4 locales × bear/tvAction map
- `i18n/locales/{zh,en,pl,ro}.ts` — pl/ro auto-derive from zh
- `components/{MenuCard,DevConsole,StoryCard}.vue`
- All 12 screens (unless integration uncovers a real bug)

## What's next (P1 / integration work)

### Immediate (when server batches 2/3/4 land)
1. **Pull `server-v7/docs/spec/api-actual.md`** (per Q3=A workflow)
2. Diff actual response shapes against `tv-html/src/services/api.ts` types
3. Adjust types if any field name / nesting differs from current types
4. Run `npm run typecheck && npm run build` — must stay green
5. End-to-end test per `SETUP_LOCAL.md` §六

### Future (P1 polish)
1. **Per-character TTS in LearningScreen** — needs server endpoint `POST /api/tts/synthesize` per char
2. **Reading mode toggle key from real bridge** — currently this screen is reached only via dev console / future H5 setting; once Shell wires up "🔤" key (likely a custom KeyEvent code), bridge needs a new event type and StoryBodyScreen needs to listen for it
3. **`bear_welcome` animation on activation** — currently 800ms blank delay → home; CDN has `bear/bear_welcome.webp` (single frame, not animated); designer call needed
4. **Library pagination** — currently loads first 20 stories; with `nextCursor` server returns we should implement infinite scroll on focus reaching last row
5. **Profile child switcher** — `child.allChildren[]` is loaded via `deviceActiveChildGet()`, but no UI surface to pick a different child yet

## Decisions log (so you don't re-litigate)

| # | Decision | Status |
|---|---|---|
| 1 | CDN helper signature: `asset('bear/bear_paint.webp')` | locked v0.2 |
| 2 | 30011 ASR_FAILED → soft hint inline, no goError | locked v0.2 |
| 3 | 30012 ROUND_OVERFLOW → soft hint + force generate | locked v0.2 |
| 4 | OK key → invisible 1×1 focusable + `autoFocus:true` + `onEnter` | locked v0.2 |
| 5 | StoryBody single-page DOM via `<Transition mode="out-in">` | locked v0.2 |
| 6 | Generating: 2s poll, 120s timeout, no BGM, first poll immediate | locked v0.2 |
| 7 | TTS-end + OK race → `advanceGuard` flag | locked v0.2 |
| **Q1** | **Full contract realignment (no client-side mapping layer)** | **locked v0.3** |
| **Q2** | **`audioBase64` direct to `/dialogue/turn` (server-side ASR)** | **locked v0.3, protocol amendment to server window** |
| **Q3** | **Server window outputs `api-actual.md` per batch; TV diffs before integration** | **locked v0.3 workflow** |
| 8 | ErrorScreen handles all 12 tvAction values | locked v0.3 |
| 9 | LearningScreen does per-page TTS replay (not per-char) until server contract supports it | locked v0.3 |
| 10 | ProfileScreen shows storiesLeft + BGM toggle + locale; subscription is parent-token-only so deferred to H5 | locked v0.3 |

## Files to read first (in this order, for next window)

1. `README.md` — project overview
2. `HANDOFF_TO_NEXT_WINDOW.md` — this file
3. `SETUP_LOCAL.md` — local integration playbook (Docker + ngrok + push-to-git steps)
4. `src/services/api.ts` — 18 endpoints + 13 shared types, all annotated with §-references to API_CONTRACT.md
5. `src/screens/DialogueScreen.vue` + `GeneratingScreen.vue` + `StoryBodyScreen.vue` — patterns
6. `src/utils/errorCodes.ts` — required for any error mapping work
7. From git repo: `server-v7/docs/spec/API_CONTRACT.md` — authoritative
8. From git repo: `server-v7/docs/spec/api-actual.md` — diff target before integration

## Hard rules (still non-negotiable)

- Never `window.Android.*` directly — only via `import { bridge } from '@/services/bridge'`
- Never `<audio>` or `new Audio()` for TTS — use `bridge.playTts(url)`
- Never `alert()` / `confirm()` — error UX is via ErrorScreen + errorCodes table
- Bundle ≤ 400 KB excluding images (currently 226 KB, 174 KB headroom)
- Never show error code or English to children — always go through `getErrorInfo(code, locale)`
- 1280×720 viewport — never write px values for 1920 layout
- Single page image in DOM at a time during story playback (350 MB budget)
- `?dev=1` in URL enables dev console; production tree-shakes it

## Open questions for the founder (only if next window needs to escalate)

1. **CORS** — assumed open on server side. Confirm with server window before integration.
2. **Reading mode bridge event** — per PRD §4.4 there's a "🔤" key. What KeyEvent code? New bridge event name?
3. **Welcome animation asset** — single-frame `bear_welcome.webp` is on CDN; designer call needed for animated version (or accept single frame).
4. **Mock mode for demo** — if you need a `?demo=1` zero-backend mode for an investor demo, ping me; ~1 window's work.
