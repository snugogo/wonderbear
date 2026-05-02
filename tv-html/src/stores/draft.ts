/**
 * Story-draft persistence — WO-3.18 Phase 4.
 *
 * Surface chosen: **localStorage** (option 4.2b in the work order).
 *
 * Why not the Prisma-backed option (4.2a) even though `deviceId` exists
 * server-side?
 *   1. AGENTS.md §1.1: Prisma schema migrations are an explicit "must
 *      first get Kristy approval" item — exec-mode droids must NOT run
 *      `prisma migrate dev` autonomously.
 *   2. WO §risk Risk 5: a botched migration leaves the server crashing
 *      because the Prisma client expects new fields the DB doesn't have.
 *      The recovery procedure (stop pm2, delete migration dir, regen
 *      client, restart) is unsafe for an automated agent.
 *   3. localStorage gives the kid a real "your story is saved" experience
 *      on the same device — which is the actual user goal. Cross-device
 *      draft sync was never a stated requirement (memory #21 is purely
 *      about not losing in-progress conversations).
 *
 * Data shape:
 *   - `conversationHistory` mirrors the dialogue store's history array so
 *     the restore path can drop it back into pinia without translation.
 *   - `outlineSummary` captures the bear's most recent should_summarize
 *     line — needed so Phase 3's WAITING_CONFIRM state can resume with
 *     the same button text the kid saw earlier.
 *   - `expiresAt` enforces the 24h TTL spec'd in WO §execution Phase 4
 *     Step 4.2b. Loaders auto-purge expired drafts.
 *
 * NOT a pinia store — these are pure module-level functions because the
 * draft is "shadow state" that lives ALONGSIDE pinia's dialogue store
 * (the dialogue store represents an ACTIVE conversation; the draft
 * represents a SUSPENDED one, ready to be promoted back into pinia when
 * the kid re-enters the create flow).
 */

const DRAFT_KEY = 'wonderbear:draft';
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export interface DraftConversationEntry {
  /** 'user' = child speaking, 'assistant' = bear speaking. */
  role: 'user' | 'assistant';
  text: string;
  round: number;
}

export interface DraftData {
  /** Optional dialogue id — restored as-is if the server session is still alive. */
  dialogueId: string | null;
  /** Mirror of dialogue.history — drives transcript restore. */
  conversationHistory: DraftConversationEntry[];
  /** Bear's most recent should_summarize / done summary line, if any. */
  outlineSummary: string;
  /** Bear's name proposed for the protagonist, if WO-3.19 hooks it later. */
  protagonistName: string;
  /** Number of turns completed (matches dialogue.round at save time). */
  turnCount: number;
  /** UNIX ms — drafts older than this are auto-purged on load. */
  expiresAt: number;
  /** UNIX ms — informational only. */
  savedAt: number;
}

/**
 * Persist a draft. Overwrites any prior draft for this device — Phase 4
 * Step 4.2a unique([deviceId, status]) constraint says one active draft
 * per device, and localStorage's keyed write is the natural moral
 * equivalent.
 */
export function saveDraft(
  data: Omit<DraftData, 'expiresAt' | 'savedAt'>,
): void {
  if (typeof localStorage === 'undefined') return;
  const now = Date.now();
  const payload: DraftData = {
    ...data,
    expiresAt: now + DRAFT_TTL_MS,
    savedAt: now,
  };
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
  } catch {
    // localStorage may be disabled (Safari private mode, quota full,
    // etc). We swallow rather than throw — losing a draft is bad, but
    // crashing the screen-back handler is worse.
  }
}

/**
 * Load the active draft, or `null` if absent / expired / corrupt.
 * Auto-purges expired entries so the next `loadDraft()` is consistent.
 */
export function loadDraft(): DraftData | null {
  if (typeof localStorage === 'undefined') return null;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(DRAFT_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed: DraftData | null = null;
  try {
    parsed = JSON.parse(raw) as DraftData;
  } catch {
    // Corrupt JSON — clean up so subsequent loads start fresh.
    clearDraft();
    return null;
  }
  if (
    !parsed ||
    typeof parsed.expiresAt !== 'number' ||
    Date.now() > parsed.expiresAt
  ) {
    clearDraft();
    return null;
  }
  // Defensive normalization — older drafts may be missing newer fields.
  if (!Array.isArray(parsed.conversationHistory)) {
    parsed.conversationHistory = [];
  }
  if (typeof parsed.outlineSummary !== 'string') parsed.outlineSummary = '';
  if (typeof parsed.protagonistName !== 'string') parsed.protagonistName = '';
  if (typeof parsed.turnCount !== 'number') parsed.turnCount = 0;
  if (parsed.dialogueId !== null && typeof parsed.dialogueId !== 'string') {
    parsed.dialogueId = null;
  }
  return parsed;
}

/**
 * Drop the active draft. Called when:
 *   - the child taps "新故事 / New story" on the recover prompt
 *   - the bear successfully kicks off generation (saveDraft → clearDraft
 *     handoff so we don't recover a draft for a story that already started
 *     painting)
 *   - the child taps "取消" on the back-key save prompt (deliberate discard)
 */
export function clearDraft(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* same rationale as saveDraft */
  }
}

/** Helper for tests / debug — answers "is there a draft right now?" without parsing. */
export function hasDraft(): boolean {
  return loadDraft() !== null;
}
