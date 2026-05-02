/**
 * WonderBear TV · HTTP API Client
 *
 * Source of truth: server-v7/docs/spec/API_CONTRACT.md (git authoritative).
 * Repo: https://github.com/snugogo/wonderbear/blob/main/server-v7/docs/spec/API_CONTRACT.md
 *
 * Handles:
 *   - Unified response envelope { code, data, requestId }
 *   - deviceToken attach + 30-day persistence in localStorage
 *   - X-Request-Id round-trip
 *   - Offline detection (synthetic NETWORK_OFFLINE code)
 *   - Idempotency-Key for sensitive POSTs
 *
 * All endpoint methods throw ApiError on non-zero code OR network failure.
 * Caller handles with try/catch and dispatches via errorCodes table.
 *
 * IMPORTANT: TV uses deviceToken only. Endpoints requiring parentToken (subscription/*,
 * parent/me, device/list, etc.) are intentionally NOT exposed here.
 */

import { ERR, NETWORK_OFFLINE, getErrorInfo, type Locale } from '@/utils/errorCodes';

// =============================================================================
// ApiError
// =============================================================================
export class ApiError extends Error {
  readonly code: number;
  readonly requestId: string | null;
  readonly details: unknown;
  readonly actions: unknown;

  constructor(
    code: number,
    message: string,
    requestId?: string | null,
    details?: unknown,
    actions?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.requestId = requestId ?? null;
    this.details = details ?? null;
    this.actions = actions ?? null;
  }

  isNetwork(): boolean { return this.code === NETWORK_OFFLINE; }
  isAuth(): boolean { return this.code === ERR.TOKEN_EXPIRED || this.code === ERR.TOKEN_REVOKED; }
  isQuota(): boolean { return this.code === ERR.QUOTA_EXHAUSTED || this.code === ERR.DAILY_LIMIT_REACHED; }
}

// =============================================================================
// Storage
// =============================================================================
const STORAGE_KEY_TOKEN = 'wb_device_token';
const STORAGE_KEY_BASE = 'wb_api_base';

function readStorage(key: string, fallback: string | null = null): string | null {
  try { return localStorage.getItem(key) ?? fallback; }
  catch { return fallback; }
}

function writeStorage(key: string, value: string | null): void {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* ignore quota / private mode */ }
}

function genRequestId(): string {
  const rand = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
  return 'cli_' + rand;
}

// =============================================================================
// Response envelope (per §1.2)
// =============================================================================
interface ApiResponse<T = unknown> {
  code: number;
  data?: T;
  message?: string;
  messageEn?: string;
  messagePl?: string;
  messageRo?: string;
  requestId?: string;
  details?: unknown;
  actions?: unknown;
}

interface RequestOptions {
  body?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
  headers?: Record<string, string>;
  idempotent?: boolean;
  skipAuth?: boolean;
  timeoutMs?: number;
  /**
   * WO-3.16 Part A — caller-supplied AbortSignal so the dialogue screen
   * can cancel an in-flight /dialogue/turn when the child interrupts
   * (presses mic mid-thinking). Aborted requests surface as DOMException
   * "AbortError" — DialogueScreen swallows that branch silently so the
   * user-initiated interrupt does NOT bubble into ErrorScreen.
   */
  signal?: AbortSignal;
}

// =============================================================================
// Shared types (per §13 — Type alias master table)
// DO NOT redefine these elsewhere. Import from here.
// =============================================================================

export type DeviceStatus =
  | 'registered'
  | 'activated_unbound'
  | 'bound'
  | 'unbound_transferable'
  | 'disabled';

export type SubscriptionPlan = 'free' | 'monthly' | 'yearly';

export type SubscriptionStatus =
  | 'free' | 'active' | 'canceled' | 'expired' | 'past_due';

export type StoryStatus = 'queued' | 'generating' | 'completed' | 'failed';

export type GenerationStage =
  | 'queue' | 'llm' | 'image' | 'tts' | 'assembly' | 'done';

export type ChildGender = 'male' | 'female' | 'prefer_not_say' | null;

/** Per §13. Server returns this verbatim from /api/device/active-child and others. */
export interface Child {
  id: string;
  parentId: string;
  name: string;
  age: number;
  gender: ChildGender;
  avatar: string;
  primaryLang: Locale;
  secondLang: Locale | 'none';
  birthday: string | null;
  coins: number;
  voiceId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Per §11.1 + protocol patch v2 (h5BaseUrl). Server returns this from /api/oem/config. */
export interface OemConfig {
  oemId: string;
  brandName: { zh: string; en: string; pl?: string; ro?: string; ja?: string; de?: string; es?: string };
  logoUrl: string;
  colors: {
    primary: string;
    secondary: string;
    background: string;
    text: string;
  };
  menus?: Array<{ id: string; enabled: boolean }>;
  greetings?: { welcome?: string };
  support?: { whatsapp?: string; email?: string; phone?: string };
  assetBundleUrl?: string;
  assetBundleVersion?: string;
  /**
   * Per protocol patch v2: parent H5 base URL for TV QR binding links.
   * NO trailing slash. Default 'https://h5.wonderbear.app' for non-OEM devices.
   */
  h5BaseUrl: string;
}

// =============================================================================
// Device endpoints (per §5)
// =============================================================================

export interface DeviceRegisterReq {
  deviceId: string;
  activationCode: string;
  hwFingerprint?: string;
  model: 'GP15' | string;
  firmwareVer: string;
  osVersion: string;
  batchCode?: string | null;
}

export interface DeviceRegisterResp {
  deviceToken: string;
  device: {
    id: string;
    deviceId: string;
    status: DeviceStatus;
    boundAt: string | null;
    storiesLeft: number;
  };
  oemConfig: OemConfig | null;
  /** Per API_ACTUAL_FORMAT batch 3 §5.1 — ISO 8601 UTC. 30 days from issue. */
  tokenExpiresAt: string;
}

/** Per API_ACTUAL_FORMAT batch 3 §5.x (new in batch 3). */
export interface DeviceRefreshTokenResp {
  deviceToken: string;
  expiresAt: string;
}

export interface DeviceStatusResp {
  status: DeviceStatus;
  parent: { id: string; email: string; locale: Locale } | null;
  activeChild: Child | null;
}

export interface HeartbeatReq {
  currentScreen?: string;
  memoryUsageMb?: number;
  firmwareVer?: string;
  networkType?: 'wifi' | 'ethernet';
}

export interface PendingCommand {
  id: string;
  type: 'reboot' | 'clear_cache' | 'unbind' | 'ota_check';
  issuedAt: string;
  expiresAt: string;
  params?: Record<string, unknown>;
}

export interface HeartbeatResp {
  pendingCommands: PendingCommand[];
  serverTime: string;
}

export interface AckCommandReq {
  result: 'success' | 'failed';
  error?: string;
}

export interface ActiveChildResp {
  activeChild: Child | null;
  allChildren: Child[];
}

export interface SetActiveChildReq {
  deviceId: string;
  childId: string;
}

export interface SetActiveChildResp {
  activeChild: Child;
}

// =============================================================================
// Story endpoints (per §7)
// =============================================================================

export interface StartDialogueReq {
  childId: string;
  targetLang?: Locale;
  learningLang?: Locale | 'none';
}

export interface DialogueQuestion {
  text: string;
  textLearning?: string | null;
  ttsUrl?: string | null;
}

export interface StartDialogueResp {
  dialogueId: string;
  roundCount: 5 | 7;
  firstQuestion: DialogueQuestion;
}

/**
 * Per API_CONTRACT_PATCH_v3.md (2026-04-22):
 *   Either userInput (post-ASR text) OR audioBase64 (raw recording).
 *   Server runs ASR internally if audioBase64 is supplied.
 *   This saves one HTTP round-trip per turn (~200ms × 7 rounds).
 *
 * Rules (per patch):
 *   - Must supply userInput OR audioBase64. Both empty → 90001 PARAM_MISSING.
 *   - If both present, audioBase64 takes precedence (userInput is ignored).
 *   - If audioBase64 is present, audioMimeType is REQUIRED ('audio/mpeg' | 'audio/wav' | 'audio/ogg').
 *   - ASR failure → 30011 ASR_FAILED.
 */
export interface DialogueTurnReq {
  round: number;
  userInput?: string;
  audioBase64?: string;
  /** REQUIRED when audioBase64 is present. Typical values: 'audio/mpeg', 'audio/wav', 'audio/ogg'. */
  audioMimeType?: string;
  skipRemaining?: boolean;
  /** Server uses this to localize bear's response; falls back to child.primaryLang. */
  locale?: Locale;
}

export interface DialogueSummary {
  mainCharacter: string;
  scene: string;
  conflict: string;
  /** v7.2 — populated when server has produced storyOutline. */
  outline?: string[];
}

/** v7.2 story arc step keys (PROMPT_SPEC_v7_2 §2.3). */
export type DialogueArcStep =
  | 'setting' | 'character' | 'goal' | 'obstacle' | 'climax' | 'resolution';

/** v7.2 outline shown on StoryPreviewScreen before generating. */
export interface DialogueStoryOutline {
  paragraphs: string[];
}

export interface DialogueTurnResp {
  done: boolean;
  nextQuestion: (DialogueQuestion & { round: number }) | null;
  summary: DialogueSummary | null;
  safetyLevel: 'ok' | 'warn' | 'blocked';
  safetyReplacement?: string | null;
  /**
   * Per patch v3: present only when request used audioBase64 — the server's ASR result.
   * TV can optionally show "I heard: ___" to the child for confirmation.
   */
  recognizedText?: string;
  /** v7.2 — adaptive mode the LLM picked for this turn (informational). */
  mode?: 'cheerleader' | 'storyteller' | null;
  /** v7.2 — short summary of what the child contributed this turn (≤30 chars). */
  lastTurnSummary?: string | null;
  /** v7.2 — partial arc map update from this turn. */
  arcUpdate?: Partial<Record<DialogueArcStep, string>> | null;
  /** v7.2 — present when done=true; drives StoryPreviewScreen. */
  storyOutline?: DialogueStoryOutline | null;
  /**
   * WO-3.18 Phase 3 — bear has produced a coherent summary the child can
   * confirm. TV moves into `waiting_confirm` state and surfaces the
   * "开始画故事 / Start painting" CTA. Optional/back-compat: missing or
   * false keeps the legacy ASKING flow.
   */
  should_summarize?: boolean;
  /** WO-3.18 Phase 3 — the bear's summary line ("我们来一起画 X 的故事吧?"). */
  story_summary?: string | null;
  /** v7.2 — telemetry only ('mock' | 'gemini-v7_2' | 'default-bank' | ...). */
  _provider?: string | null;
}

/** v7.2 — POST /api/story/dialogue/:id/confirm response. */
export interface DialogueConfirmResp {
  storyId: string;
  status: 'queued';
  queuePosition?: number;
  estimatedDurationSec: number;
  priority: 'normal' | 'high';
}

export interface GenerateStoryReq {
  dialogueId: string;
  childId: string;
}

export interface GenerateStoryResp {
  storyId: string;
  status: 'queued';
  queuePosition?: number;
  estimatedDurationSec: number;
  priority: 'normal' | 'high';
}

export interface StoryStatusResp {
  storyId: string;
  status: StoryStatus;
  progress: {
    stage: GenerationStage;
    pagesGenerated: number;
    totalPages: 12;
    percent: number;
  };
  error?: { code: number; message: string; retriable: boolean } | null;
  completedAt?: string | null;
}

export interface StoryPage {
  pageNum: number;
  imageUrl: string;
  imageUrlHd: string;
  text: string;
  textLearning?: string | null;
  ttsUrl?: string | null;
  ttsUrlLearning?: string | null;
  durationMs?: number | null;
}

export interface Story {
  id: string;
  childId: string;
  /**
   * WO-3.12 — author display. Backend joins Child via Prisma include and
   * surfaces just the name (no PII beyond name). Optional because older
   * mock-mode payloads may omit it; UI must tolerate null.
   */
  childName?: string | null;
  title: string;
  titleLearning?: string | null;
  coverUrl: string;
  coverUrlHd?: string;
  pages: StoryPage[];
  /**
   * Per API_ACTUAL_FORMAT batch 4 §7.6 — `summary` is the structured
   * DialogueSummary object (mainCharacter / scene / conflict),
   * NOT a pre-flattened string. UI that wants a one-liner must compose
   * from these three fields.
   */
  dialogue: {
    summary: DialogueSummary;
    rounds: Array<{ q: string; a: string }>;
  };
  /**
   * Per API_ACTUAL_FORMAT batch 4 §7.6: `metadata` only reliably carries
   * primaryLang / learningLang / provider. `duration` and `createdAt` are
   * optional — not emitted by mock path; when present they reflect final
   * assembled audio duration and story-record creation time respectively.
   * `provider` includes 'mock' when dev-mode LLM/image/TTS keys are absent.
   */
  metadata: {
    primaryLang: Locale;
    learningLang: Locale | 'none';
    provider: 'openai' | 'gemini' | 'fal' | 'mixed' | 'mock';
    duration?: number;
    createdAt?: string;
  };
  status: 'completed';
  isPublic: boolean;
  favorited: boolean;
  playCount: number;
  downloaded?: boolean;
  /** Per API_ACTUAL_FORMAT batch 4 §7.6 — present at story top level. */
  createdAt: string;
  /** Per API_ACTUAL_FORMAT batch 4 §7.6 — set when status='completed'. */
  completedAt?: string | null;
}

export interface StoryDetailResp {
  story: Story;
}

export interface StorySummary {
  id: string;
  title: string;
  coverUrl: string;
  createdAt: string;
  playCount: number;
  favorited: boolean;
  primaryLang: Locale;
  downloaded?: boolean;
}

export interface StoryListQuery {
  childId?: string;
  cursor?: string;
  limit?: number;
  sort?: 'newest' | 'most_played' | 'favorited';
  onlyFavorited?: boolean;
}

export interface StoryListResp {
  items: StorySummary[];
  nextCursor: string | null;
  total: number;
}

export interface FavoriteReq {
  favorited: boolean;
}

export interface PlayStatReq {
  event: 'start' | 'page_end' | 'complete' | 'abort';
  pageNum?: number;
  timestamp: string;
  durationMs?: number;
}

// =============================================================================
// TTS (per §8)
// =============================================================================

/** §8.1 — request body for /api/tts/synthesize. */
export interface TtsSynthesizeReq {
  text: string;
  lang?: Locale;
  /** Optional override; server picks per-purpose default when omitted. */
  voiceId?: string;
  speed?: number;
  /**
   * WO-3.12: 'dialogue' is the bear-voice purpose used by StoryCoverScreen
   * for the "Created by …" announcement. Server route currently destructures
   * { text, lang, voiceId, speed } only — extra fields are ignored harmlessly,
   * leaving room for a follow-up workorder to forward purpose end-to-end.
   */
  purpose?: 'narration' | 'dialogue' | 'vocab';
}

/** §8.1 — response body. */
export interface TtsSynthesizeResp {
  audioUrl: string;
  durationMs: number;
  cached: boolean;
}

// =============================================================================
// OEM (per §11)
// =============================================================================

export interface OemConfigResp {
  oemConfig: OemConfig | null;
}

// =============================================================================
// Client
// =============================================================================
class ApiClient {
  private baseUrl: string;
  private deviceToken: string | null;
  private locale: Locale = 'en';
  private authErrorHandler: ((err?: ApiError) => void) | null = null;
  private requestIdObserver: ((id: string) => void) | null = null;

  constructor() {
    const envBase = (typeof import.meta !== 'undefined' ? import.meta.env?.VITE_API_BASE : '') || '';
    this.baseUrl = readStorage(STORAGE_KEY_BASE, envBase || '/api') || '/api';
    this.deviceToken = readStorage(STORAGE_KEY_TOKEN, null);
  }

  setBaseUrl(url: string): void {
    this.baseUrl = url.replace(/\/$/, '');
    writeStorage(STORAGE_KEY_BASE, this.baseUrl);
  }
  getBaseUrl(): string { return this.baseUrl; }

  setDeviceToken(token: string): void {
    this.deviceToken = token;
    writeStorage(STORAGE_KEY_TOKEN, token);
  }
  getDeviceToken(): string | null { return this.deviceToken; }
  clearDeviceToken(): void {
    this.deviceToken = null;
    writeStorage(STORAGE_KEY_TOKEN, null);
  }

  setLocale(locale: Locale): void { this.locale = locale; }

  onAuthError(fn: (err?: ApiError) => void): void { this.authErrorHandler = fn; }
  onRequestId(fn: (id: string) => void): void { this.requestIdObserver = fn; }

  // ---------------------------------------------------------------------------
  // Core request
  // ---------------------------------------------------------------------------
  async request<T = unknown>(
    method: string,
    path: string,
    opts: RequestOptions = {},
  ): Promise<{ data: T; requestId: string }> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new ApiError(NETWORK_OFFLINE, getErrorInfo(NETWORK_OFFLINE, this.locale).message);
    }

    let url = this.baseUrl + path;
    if (opts.query && Object.keys(opts.query).length) {
      const qs = new URLSearchParams();
      Object.entries(opts.query).forEach(([k, v]) => {
        if (v !== null && v !== undefined) qs.append(k, String(v));
      });
      url += '?' + qs.toString();
    }

    const reqId = genRequestId();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Request-Id': reqId,
      'Accept-Language': this.locale,
      ...(opts.headers || {}),
    };

    if (!opts.skipAuth && this.deviceToken) {
      headers['Authorization'] = 'Bearer ' + this.deviceToken;
    }

    if (opts.idempotent) {
      headers['Idempotency-Key'] = reqId;
    }

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), opts.timeoutMs ?? 15000);
    // WO-3.16 Part A — bridge caller-supplied signal into our internal
    // controller so a cancellation either via timeout or via caller still
    // surfaces a single AbortError on `fetch`. Re-throw AbortError as-is
    // (do NOT remap to NETWORK_OFFLINE) so DialogueScreen can detect a
    // user-initiated cancel and stay silent.
    let unhookExternalAbort: (() => void) | null = null;
    if (opts.signal) {
      if (opts.signal.aborted) {
        ac.abort();
      } else {
        const onAbort = (): void => { ac.abort(); };
        opts.signal.addEventListener('abort', onAbort);
        unhookExternalAbort = (): void => {
          opts.signal?.removeEventListener('abort', onAbort);
        };
      }
    }

    let resp: Response;
    try {
      resp = await fetch(url, {
        method,
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: ac.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      unhookExternalAbort?.();
      // WO-3.16 Part A — re-throw AbortError verbatim so the caller can
      // distinguish user cancel from real network failure.
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err;
      }
      throw new ApiError(
        NETWORK_OFFLINE,
        getErrorInfo(NETWORK_OFFLINE, this.locale).message,
        reqId,
      );
    }
    clearTimeout(timer);
    unhookExternalAbort?.();

    if (resp.status === 401) {
      const info = getErrorInfo(ERR.TOKEN_EXPIRED, this.locale);
      if (this.authErrorHandler) this.authErrorHandler();
      throw new ApiError(ERR.TOKEN_EXPIRED, info.message, reqId);
    }

    let payload: ApiResponse<T>;
    try {
      payload = await resp.json() as ApiResponse<T>;
    } catch {
      throw new ApiError(ERR.INTERNAL_ERROR, 'Response not JSON', reqId);
    }

    const serverReqId = payload.requestId || resp.headers.get('X-Request-Id') || reqId;
    if (this.requestIdObserver) this.requestIdObserver(serverReqId);

    if (payload.code !== 0) {
      const localMsg = getErrorInfo(payload.code, this.locale).message;
      const localizedKey = this.locale === 'zh'
        ? 'message'
        : ('message' + this.locale[0].toUpperCase() + this.locale.slice(1)) as keyof ApiResponse;
      const serverMsg = (payload[localizedKey] as string | undefined) || payload.message || localMsg;

      const err = new ApiError(payload.code, serverMsg, serverReqId, payload.details, payload.actions);
      if (err.isAuth() && this.authErrorHandler) this.authErrorHandler(err);
      throw err;
    }

    return { data: payload.data as T, requestId: serverReqId };
  }

  get<T = unknown>(path: string, query?: RequestOptions['query'], opts?: Omit<RequestOptions, 'query' | 'body'>): Promise<{ data: T; requestId: string }> {
    return this.request<T>('GET', path, { ...opts, query });
  }
  post<T = unknown>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'body'>): Promise<{ data: T; requestId: string }> {
    return this.request<T>('POST', path, { ...opts, body });
  }
  patch<T = unknown>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'body'>): Promise<{ data: T; requestId: string }> {
    return this.request<T>('PATCH', path, { ...opts, body });
  }
  delete<T = unknown>(path: string, opts?: RequestOptions): Promise<{ data: T; requestId: string }> {
    return this.request<T>('DELETE', path, opts);
  }

  // ---------------------------------------------------------------------------
  // Typed endpoints — each comment cites the API_CONTRACT section
  // ---------------------------------------------------------------------------

  // §3 health
  health() { return this.get<unknown>('/health', undefined, { skipAuth: true }); }

  // §5 device
  /** §5.1 — first boot, no token yet */
  deviceRegister(req: DeviceRegisterReq) {
    return this.post<DeviceRegisterResp>('/device/register', req, { skipAuth: true, idempotent: true });
  }
  /** §5.2 — TV polls every 3s on activation, every 60s on home */
  deviceStatus() { return this.get<DeviceStatusResp>('/device/status'); }
  /** §5.5 — every 5min, returns pending commands */
  deviceHeartbeat(req: HeartbeatReq) {
    return this.post<HeartbeatResp>('/device/heartbeat', req);
  }
  /** §5.6 — ack a pending command */
  deviceAckCommand(commandId: string, req: AckCommandReq) {
    return this.post<null>(`/device/ack-command/${commandId}`, req);
  }
  /** §5.7 — get active child + all children for switch dialog */
  deviceActiveChildGet() { return this.get<ActiveChildResp>('/device/active-child'); }
  /** §5.8 — TV-side switch active child */
  deviceActiveChildSet(req: SetActiveChildReq) {
    return this.post<SetActiveChildResp>('/device/active-child', req);
  }
  /**
   * §5.x (batch 3) — refresh an existing device token. Call when 10001
   * TOKEN_EXPIRED is caught from any device-scoped endpoint; if this also
   * fails, fall back to /device/register with stored activationCode.
   */
  deviceRefreshToken() {
    return this.post<DeviceRefreshTokenResp>('/device/refresh-token', undefined);
  }

  // §7 story
  /** §7.2 — start a new dialogue */
  dialogueStart(req: StartDialogueReq) {
    return this.post<StartDialogueResp>('/story/dialogue/start', req);
  }
  /**
   * §7.3 — advance one round. Pass either userInput (text) or audioBase64 (raw recording).
   *
   * WO-3.16 Part A — accepts an optional `{ signal }` so DialogueScreen
   * can cancel an in-flight turn when the child interrupts mid-thinking.
   * The signal threads through to fetch via RequestOptions.signal; aborts
   * propagate as DOMException 'AbortError' for the caller to swallow.
   */
  dialogueTurn(
    dialogueId: string,
    req: DialogueTurnReq,
    opts?: { signal?: AbortSignal },
  ) {
    return this.post<DialogueTurnResp>(`/story/dialogue/${dialogueId}/turn`, req, {
      signal: opts?.signal,
    });
  }
  /** §7.4 — kick off async generation, returns 202 */
  storyGenerate(req: GenerateStoryReq) {
    return this.post<GenerateStoryResp>('/story/generate', req, { idempotent: true });
  }
  /**
   * v7.2 — confirm dialogue's storyOutline and trigger generation.
   * Called by StoryPreviewScreen after the child presses Enter on the 3-5
   * paragraph outline. Equivalent to /story/generate but starts from the
   * accumulated dialogue session (no need to re-pass dialogueId/childId).
   */
  dialogueConfirm(dialogueId: string) {
    return this.post<DialogueConfirmResp>(`/story/dialogue/${dialogueId}/confirm`, {}, { idempotent: true });
  }
  /** §7.5 — poll every 2s */
  storyStatus(storyId: string) {
    return this.get<StoryStatusResp>(`/story/${storyId}/status`);
  }
  /** §7.6 — full story incl. 12 pages */
  storyDetail(storyId: string) {
    return this.get<StoryDetailResp>(`/story/${storyId}`);
  }
  /** §7.7 — list stories for active child */
  storyList(query?: StoryListQuery) {
    return this.get<StoryListResp>('/story/list', query as Record<string, string | number | boolean | null | undefined>);
  }
  /** §7.8 — toggle favorite */
  storyFavorite(storyId: string, req: FavoriteReq) {
    return this.post<{ storyId: string; favorited: boolean }>(`/story/${storyId}/favorite`, req);
  }
  /** §7.9 — delete story */
  storyDelete(storyId: string) {
    return this.delete<{ deleted: boolean }>(`/story/${storyId}`);
  }
  /** §7.10 — play telemetry, fire-and-forget */
  storyPlayStat(storyId: string, req: PlayStatReq) {
    return this.post<null>(`/story/${storyId}/play-stat`, req);
  }

  // §8 TTS
  /** §8.1 — synthesize a short utterance. WO-3.12 author announcement. */
  ttsSynthesize(req: TtsSynthesizeReq) {
    return this.post<TtsSynthesizeResp>('/tts/synthesize', req);
  }

  // §11 OEM
  oemConfig() { return this.get<OemConfigResp>('/oem/config'); }

  // §11.4 telemetry
  telemetryReport(events: object[]) {
    return this.post<null>('/telemetry/report', { events });
  }
}

export const api = new ApiClient();

if (typeof window !== 'undefined') {
  // For browser console debugging
  (window as unknown as { __api: ApiClient }).__api = api;
}
