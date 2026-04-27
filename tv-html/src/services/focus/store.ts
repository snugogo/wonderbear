/**
 * Focus registry and scope stack.
 * Internal state — apps interact via index.ts and useFocusable.
 */

import type { FocusableEntry, FocusableOptions } from './types';

const entries = new Map<string, FocusableEntry>(); // id → entry (current scope only)
// Note: ids are scoped by current top-of-stack scope. Same id can exist in different scopes
// but is keyed here as `${scope}:${id}` internally.

const scopeStack: string[] = ['root'];
let currentFocusId: string | null = null;
const savedFocusByScope = new Map<string, string | null>();

const focusChangeListeners: Array<(id: string | null) => void> = [];

function key(scope: string, id: string): string {
  return scope + ':' + id;
}

export function currentScope(): string {
  return scopeStack[scopeStack.length - 1] || 'root';
}

export function register(el: HTMLElement, options: FocusableOptions): void {
  const scope = options.scope || currentScope();
  const k = key(scope, options.id);
  if (entries.has(k)) {
    console.warn('[focus] duplicate id in scope:', scope, options.id);
  }
  entries.set(k, { id: options.id, scope, el, options });

  if (scope === currentScope() && options.autoFocus && currentFocusId === null) {
    setFocus(options.id);
  }
}

export function unregister(id: string, scope?: string): void {
  const sc = scope || currentScope();
  const k = key(sc, id);
  entries.delete(k);
  if (currentFocusId === id) {
    currentFocusId = null;
    // Try to find replacement in same scope
    const replacement = findFirstFocusable(sc);
    if (replacement) setFocus(replacement);
  }
}

export function getEntry(id: string, scope?: string): FocusableEntry | undefined {
  const sc = scope || currentScope();
  return entries.get(key(sc, id));
}

export function getCurrentEntry(): FocusableEntry | undefined {
  if (!currentFocusId) return undefined;
  return getEntry(currentFocusId);
}

export function getCurrentFocusId(): string | null { return currentFocusId; }

export function entriesInCurrentScope(): FocusableEntry[] {
  const sc = currentScope();
  const out: FocusableEntry[] = [];
  entries.forEach((entry) => {
    if (entry.scope === sc && !entry.options.disabled) out.push(entry);
  });
  return out;
}

export function setFocus(id: string | null): void {
  if (currentFocusId === id) return;

  // Blur previous
  if (currentFocusId) {
    const prev = getEntry(currentFocusId);
    if (prev) {
      prev.el.removeAttribute('data-focused');
      prev.options.onBlur?.();
    }
  }

  currentFocusId = id;

  // Focus new
  if (id) {
    const next = getEntry(id);
    if (next) {
      next.el.setAttribute('data-focused', 'true');
      next.options.onFocus?.();
      // Ensure visible
      try {
        next.el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
      } catch {
        next.el.scrollIntoView();
      }
    }
  }

  focusChangeListeners.slice().forEach((fn) => {
    try { fn(currentFocusId); } catch (e) { console.error('[focus] listener:', e); }
  });
}

export function pushScope(scope: string): void {
  // Save current focus before switching
  savedFocusByScope.set(currentScope(), currentFocusId);
  // Blur current
  if (currentFocusId) {
    const prev = getEntry(currentFocusId);
    if (prev) prev.el.removeAttribute('data-focused');
  }
  currentFocusId = null;
  scopeStack.push(scope);
}

export function popScope(): void {
  if (scopeStack.length <= 1) return; // never pop root
  // Blur current scope's focus
  if (currentFocusId) {
    const prev = getEntry(currentFocusId);
    if (prev) prev.el.removeAttribute('data-focused');
  }
  currentFocusId = null;

  scopeStack.pop();
  // Restore previous scope's focus
  const prevScope = currentScope();
  const restored = savedFocusByScope.get(prevScope) ?? null;
  if (restored && getEntry(restored)) {
    setFocus(restored);
  } else {
    const fallback = findFirstFocusable(prevScope);
    if (fallback) setFocus(fallback);
  }
}

function findFirstFocusable(scope: string): string | null {
  for (const entry of entries.values()) {
    if (entry.scope === scope && !entry.options.disabled) return entry.id;
  }
  return null;
}

export function onFocusChange(fn: (id: string | null) => void): () => void {
  focusChangeListeners.push(fn);
  return () => {
    const i = focusChangeListeners.indexOf(fn);
    if (i >= 0) focusChangeListeners.splice(i, 1);
  };
}

/** Reset focus state — used when switching screens via screen store */
export function resetForScreenChange(): void {
  if (currentFocusId) {
    const prev = getEntry(currentFocusId);
    if (prev) prev.el.removeAttribute('data-focused');
  }
  currentFocusId = null;
  // 2026-04-27: notify listeners so dev badges / focus-tracking refs see
  // the cleared state. Previously this skipped the broadcast, leaving
  // stale id values in onFocusChange subscribers across screen changes.
  focusChangeListeners.slice().forEach((fn) => {
    try { fn(null); } catch (e) { console.error('[focus] listener:', e); }
  });
  // Scope stack stays — popups within new screen will push their own
}
