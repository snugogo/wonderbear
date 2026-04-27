/**
 * Geometric neighbor inference.
 * Used as fallback when a focusable doesn't declare a static neighbor for a direction.
 *
 * Algorithm:
 *   1. Get rect of source element.
 *   2. For each candidate in the same scope, compute its rect.
 *   3. Filter to those in the requested direction (centroid-based).
 *   4. Score by: primary-axis distance + 0.5 × cross-axis offset.
 *   5. Return id of best candidate, or null.
 */

import type { Direction, FocusableEntry } from './types';
import { entriesInCurrentScope } from './store';

interface Centroid { x: number; y: number; w: number; h: number; }

function centroid(el: HTMLElement): Centroid {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
}

function isInDirection(from: Centroid, to: Centroid, dir: Direction): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const minDelta = 8; // Avoid considering same-row/col elements as neighbors
  // Strict axis-dominant check — preserves hierarchical navigation:
  // left/right only finds elements whose horizontal distance dominates;
  // up/down only finds elements whose vertical distance dominates.
  // This stops, e.g. a list-row's "right" press from snagging a tab
  // sitting above-and-to-the-right of it (off-axis bleed).
  switch (dir) {
    case 'up':    return dy < -minDelta && Math.abs(dy) > Math.abs(dx);
    case 'down':  return dy > minDelta && Math.abs(dy) > Math.abs(dx);
    case 'left':  return dx < -minDelta && Math.abs(dx) > Math.abs(dy);
    case 'right': return dx > minDelta && Math.abs(dx) > Math.abs(dy);
  }
}

function score(from: Centroid, to: Centroid, dir: Direction): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  switch (dir) {
    case 'up':
    case 'down':
      return Math.abs(dy) + 0.5 * Math.abs(dx);
    case 'left':
    case 'right':
      return Math.abs(dx) + 0.5 * Math.abs(dy);
  }
}

export function findGeometricNeighbor(
  fromEntry: FocusableEntry,
  dir: Direction,
): string | null {
  const from = centroid(fromEntry.el);
  let best: { id: string; score: number } | null = null;

  for (const candidate of entriesInCurrentScope()) {
    if (candidate.id === fromEntry.id) continue;
    const to = centroid(candidate.el);
    if (!isInDirection(from, to, dir)) continue;
    const s = score(from, to, dir);
    if (best === null || s < best.score) {
      best = { id: candidate.id, score: s };
    }
  }
  return best ? best.id : null;
}
