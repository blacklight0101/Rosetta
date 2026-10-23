import type { ProviderKind } from '../ports/llm-provider.js';

// P3-113 (stub: the tests of the card fail on it first).
export function plannerWindowTokens(
  configured: number | 'auto' | undefined,
  kind: ProviderKind | undefined,
  modelContextTokens: number | undefined,
): number {
  return configured === undefined && kind === undefined && modelContextTokens === undefined ? 0 : 0;
}
