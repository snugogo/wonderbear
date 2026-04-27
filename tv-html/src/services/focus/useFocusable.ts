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
import { register, unregister, currentScope } from './store';
import type { FocusableOptions } from './types';

export function useFocusable(
  elRef: Ref<HTMLElement | null>,
  options: FocusableOptions,
): void {
  const scope = options.scope || currentScope();
  let mountedScope = scope;
  let registered = false;

  function tryRegister(): void {
    if (registered || !elRef.value) return;
    mountedScope = options.scope || currentScope();
    register(elRef.value, { ...options, scope: mountedScope });
    registered = true;
  }

  function tryUnregister(): void {
    if (!registered) return;
    unregister(options.id, mountedScope);
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
