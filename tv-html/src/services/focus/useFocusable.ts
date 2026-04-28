/**
 * useFocusable Composable.
 *
 * Usage:
 *   <template>
 *     <div ref="el" :data-focused-id="id">...</div>
 *   </template>
 *   <script setup>
 *   const el = ref<HTMLElement | null>(null);
 *   useFocusable(el, {
 *     id: 'home-card-create',
 *     neighbors: { right: 'home-card-stories' },
 *     onEnter: () => screen.go('dialogue'),
 *   });
 *   </script>
 */

import { onMounted, onBeforeUnmount, watch, type Ref } from 'vue';
import { register, unregister, currentScope, setFocus } from './store';
import type { FocusableOptions } from './types';

export function useFocusable(
  elRef: Ref<HTMLElement | null>,
  options: FocusableOptions,
): void {
  const scope = options.scope || currentScope();
  let mountedScope = scope;
  let registered = false;

  // 2026-04-28: dual-input listener tracking. Same element across
  // re-mounts gets a fresh handler each cycle so we don't leak.
  let attachedEl: HTMLElement | null = null;
  let lastFireAt = 0;

  function onMouseEnterHandler(): void {
    if (options.disabled) return;
    setFocus(options.id);
  }

  function onClickHandler(ev: MouseEvent): void {
    if (options.disabled) return;
    // 2026-04-28: dedupe burst clicks (e.g. when a screen template
    // also wires its own @click on the same element). 200ms window
    // covers the worst-case bubble + Vue dispatch spread. Without
    // this, a button with both @click="cb" AND useFocusable would
    // fire cb twice on a real mouse press.
    const now = Date.now();
    if (now - lastFireAt < 200) return;
    lastFireAt = now;
    setFocus(options.id);
    // Suppress synthetic clicks from screen-reader Enter on focused
    // buttons (they re-trigger keyRouter's onEnter and we'd dispatch
    // twice). 0,0 is the canonical "synthetic" coordinates Vue uses.
    if (ev.detail === 0) return;
    options.onEnter?.();
  }

  function attachMouse(el: HTMLElement): void {
    if (attachedEl === el) return;
    detachMouse();
    el.addEventListener('mouseenter', onMouseEnterHandler);
    el.addEventListener('click', onClickHandler);
    attachedEl = el;
  }

  function detachMouse(): void {
    if (!attachedEl) return;
    attachedEl.removeEventListener('mouseenter', onMouseEnterHandler);
    attachedEl.removeEventListener('click', onClickHandler);
    attachedEl = null;
  }

  function tryRegister(): void {
    if (registered || !elRef.value) return;
    mountedScope = options.scope || currentScope();
    register(elRef.value, { ...options, scope: mountedScope });
    attachMouse(elRef.value);
    registered = true;
  }

  function tryUnregister(): void {
    if (!registered) return;
    unregister(options.id, mountedScope);
    detachMouse();
    registered = false;
  }

  // Try at first mount — covers ~95% of focusables (always-on elements).
  onMounted(() => { tryRegister(); });

  // 2026-04-27: also watch elRef for v-if-gated focusables (ready-painter
  // shown only on the final dialogue round, end-overlay buttons, etc.)
  // that are absent at parent's onMounted but appear later. Without
  // this, `setFocus(id)` for those ids silently does nothing because
  // the entry was never registered, and the OK key has nothing to fire.
  // immediate:false avoids a redundant call alongside onMounted's run.
  watch(elRef, (el) => {
    if (el) tryRegister();
    else tryUnregister();
  }, { flush: 'post' });

  onBeforeUnmount(() => { tryUnregister(); });
}
