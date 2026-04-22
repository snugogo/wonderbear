# WonderBear TV (Vue 3 + Vite + TS + Pinia)

**v0.3 — all 12 P0 screens shipped, contract aligned to v7 git authoritative.**

TV-side HTML running inside the GP15 projector WebView.
Spec source: git repo `server-v7/docs/spec/API_CONTRACT.md` + `tv-kickoff-prompt.md` + v7 docs.

> **For local end-to-end integration with Docker server + real phone scan:**
> see [`SETUP_LOCAL.md`](./SETUP_LOCAL.md) for the complete playbook.

## Quick start

```bash
npm install
npm run dev
# open http://localhost:5173/?dev=1
```

The `?dev=1` query param shows the floating dev console (bottom-right). Click it to expand.
The dev console gives you:

- **Bridge / Focus / Memory / Screen** live readout
- **Native simulation**: 🎤 down/up · Offline · Online · Mark activated
- **Jump screen**: any of the 12 screens
- **Trigger error**: 6 representative error codes

### Locale
Append `?locale=en|pl|ro` to see translation coverage.
Polish/Romanian are auto-prefixed with `[TODO_pl]` / `[TODO_ro]` so you can spot untranslated strings instantly.

### Other commands
```bash
npm run typecheck   # vue-tsc strict mode, must be zero errors
npm run build       # production bundle to dist/
npm run preview     # preview the built bundle
```

## Architecture map

```
src/
├── main.ts                       boot sequence (bridge ready → status check → mount)
├── App.vue                       screen router (12 screens) + dev console mount
├── env.d.ts                      window.Android types + Vite env vars
│
├── services/
│   ├── bridge/                   JS Bridge — REAL/MOCK factory (5 files)
│   │   ├── index.ts              façade — `import { bridge } from '@/services/bridge'`
│   │   ├── types.ts              13 native methods + 7 push events fully typed
│   │   ├── pushBus.ts            window.onXxx → emit() (single source)
│   │   ├── real.ts               GP15 device — thin window.Android wrapper
│   │   └── mock.ts               browser dev — getUserMedia + Audio + _mock helpers
│   ├── api.ts                    HTTP client — 18 endpoints typed, ApiError class
│   └── focus/                    remote control focus system (5 files)
│       ├── index.ts              façade
│       ├── types.ts
│       ├── store.ts              registry + scope stack + push/pop
│       ├── neighbors.ts          geometric neighbor inference (fallback)
│       ├── keyRouter.ts          window keydown → focus moves (120ms throttle)
│       └── useFocusable.ts       Vue Composable
│
├── stores/                       Pinia (6 stores)
│   ├── screen.ts                 current screen + nav + go/back/goError
│   ├── device.ts                 deviceInfo + OEM + activation status
│   ├── child.ts                  active child profile
│   ├── dialogue.ts               7-round conversation state machine
│   ├── story.ts                  generation polling + playback state
│   └── bgm.ts                    scene-based BGM (delegates to bridge)
│
├── i18n/                         vue-i18n
│   ├── index.ts                  i18n instance + setLocale/getLocale
│   └── locales/
│       ├── zh.ts                 source of truth — fully translated
│       ├── en.ts                 first-pass — needs native polish (search [TODO_en])
│       ├── pl.ts                 placeholder, all keys auto-prefixed [TODO_pl]
│       └── ro.ts                 placeholder, all keys auto-prefixed [TODO_ro]
│
├── components/
│   ├── DevConsole.vue            floating dev panel (tree-shaken in production)
│   └── MenuCard.vue              focusable menu card (used by HomeScreen)
│
├── screens/
│   ├── ActivationScreen.vue      ✅ first-boot QR + 3s polling
│   ├── HomeScreen.vue            ✅ 6-card menu with focus navigation
│   └── PlaceholderScreens.ts     🚧 10 stubs (replace one-by-one)
│
├── styles/
│   ├── tokens.css                color/typography/spacing/motion tokens
│   └── global.css                resets + focus outline + screen transitions
│
└── utils/
    ├── errorCodes.ts             30+ codes × 4 locales × bear/tvAction map
    └── buildBindingUrl.ts        TO_TV_hash_route.md compliant URL builder
```

## Hard rules — verified

| Rule | Where enforced | Status |
|---|---|---|
| Never touch `window.Android` directly | `services/bridge/real.ts` is the only file | ✅ grep clean |
| Never use `<audio>` or `new Audio()` for TTS | bridge.playTts goes to native | ✅ grep clean (only mock.ts uses Audio for browser dev) |
| Bundle ≤ 400KB excluding images | Vite chunkSizeWarningLimit | ✅ 194KB JS / 75KB gzip |
| No `alert()` / `confirm()` shown to children | DevConsole only (dev) | ✅ grep clean |
| Locale 4-language scaffold Day 1 | i18n/locales/{zh,en,pl,ro}.ts | ✅ |
| QR URL strict per TO_TV_hash_route.md | `utils/buildBindingUrl.ts` + 4 unit tests | ✅ all 5 acceptance checks pass |

## Done / In progress / Next

### ✅ Done (v0.3 — all 12 P0 screens shipped)
- Vue3 + Vite + TS strict + Pinia + vue-i18n skeleton
- Bridge service (real + mock + push bus)
- API client (18 endpoints, fully aligned to git-authoritative `server-v7/docs/spec/API_CONTRACT.md`)
- Error code table (30+ codes × 4 locales × bear mapping)
- Focus system (registry + scope stack + geometric fallback + 120ms throttle)
- 6 Pinia stores
- 4-locale i18n with TODO markers
- Dev console (8 debug actions)
- ActivationScreen + HomeScreen
- DialogueScreen + GeneratingScreen + StoryCoverScreen + StoryBodyScreen + StoryEndScreen
- LibraryScreen + LearningScreen + ProfileScreen + OfflineScreen + ErrorScreen

### 🚧 Integration work (when server batches 2/3/4 land)
1. Diff `server-v7/docs/spec/api-actual.md` against `src/services/api.ts` types
2. Pull H5 project once it's pushed and run end-to-end activation test
3. See `SETUP_LOCAL.md` for the complete playbook

### 📋 P1 / future polish
1. Per-character TTS in LearningScreen (needs server endpoint)
2. Real bridge event for reading-mode "🔤" key
3. `bear_welcome` animation (currently single frame)
4. Library pagination (cursor-based infinite scroll)
5. Profile child switcher UI

## Open questions for the founder

1. **Server CORS** — what's the dev server URL? Currently defaults to `/api` (relative).
   Set `VITE_API_BASE` in `.env.development.local` to override.
2. **Welcome animation on activation** — currently 800ms delay before jumping to home.
   Need bear_welcome animation asset.
3. **Empty asr endpoint** — `dialogueTurn` accepts `childAudioBase64` directly. Confirm with
   server window that no separate `/asr/upload` multipart endpoint is required.

## Try in browser right now

```bash
npm run dev
# 1. Open http://localhost:5173/?dev=1
# 2. You see Activation screen with a QR code containing the hash URL
# 3. Click 🛠 button bottom-right → Dev Panel opens
# 4. Click "Mark activated" → app jumps to Home
# 5. Use arrow keys to navigate the 6 menu cards (focus = amber outline + bear floats)
# 6. Try ?locale=en or ?locale=pl to see translation switching
```
