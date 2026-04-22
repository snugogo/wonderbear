/**
 * Focus system type definitions.
 * Source: TV_HANDOFF.md §遥控器焦点管理
 */

export type Direction = 'up' | 'down' | 'left' | 'right';

export type FocusKey = Direction | 'ok' | 'back' | 'home';

export interface FocusableNeighbors {
  up?: string;
  down?: string;
  left?: string;
  right?: string;
}

export interface FocusableOptions {
  /** Unique focusable id within current scope */
  id: string;
  /** Scope this focusable belongs to. Default: 'root' */
  scope?: string;
  /** Static neighbor map. Missing directions fall back to geometric search. */
  neighbors?: FocusableNeighbors;
  /** Called when this element becomes focused */
  onFocus?: () => void;
  /** Called when focus leaves this element */
  onBlur?: () => void;
  /** Called when OK key pressed while focused */
  onEnter?: () => void;
  /** Called when Back key pressed while focused (if not handled by scope) */
  onBack?: () => boolean | void;
  /** Auto-focus on mount if no other focused element in scope. Default: false */
  autoFocus?: boolean;
  /** If true, skipped during navigation (e.g. disabled button). Default: false */
  disabled?: boolean;
}

export interface FocusableEntry {
  id: string;
  scope: string;
  el: HTMLElement;
  options: FocusableOptions;
}
