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

import { onMounted, onBeforeUnmount, type Ref } from 'vue';
import { register, unregister, currentScope } from './store';
import type { FocusableOptions } from './types';

export function useFocusable(
  elRef: Ref<HTMLElement | null>,
  options: FocusableOptions,
): void {
  const scope = options.scope || currentScope();
  // Capture scope at mount time so unregister hits the right scope
  let mountedScope = scope;

  onMounted(() => {
    if (!elRef.value) {
      console.warn('[useFocusable] ref not bound:', options.id);
      return;
    }
    mountedScope = options.scope || currentScope();
    register(elRef.value, { ...options, scope: mountedScope });
  });

  onBeforeUnmount(() => {
    unregister(options.id, mountedScope);
  });
}
