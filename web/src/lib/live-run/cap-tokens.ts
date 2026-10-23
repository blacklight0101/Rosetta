import type { RunState } from './run-state.js';

// P5-16 stub, replaced by the implementation commit.
export function capTokensOf(parts: {
  readonly input: number;
  readonly cached: number;
  readonly output: number;
}): number {
  return parts.input + parts.output;
}

export function tokenFiguresOf(state: RunState): { readonly raw: number; readonly toward: number } {
  return { raw: state.log.length, toward: 0 };
}
