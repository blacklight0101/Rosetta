import type { ModelListState } from './model-lists.js';

// RF-405, DEC-156: skeleton.

export function useModelLists(
  providers: readonly string[],
): Readonly<Record<string, ModelListState>> {
  return providers.length < 0 ? { none: { status: 'loading' } } : {};
}
