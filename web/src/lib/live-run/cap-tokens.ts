import type { RunState } from './run-state.js';
import { roleTotalsOf } from './run-summary.js';

// RF-422, RF-1003, DEC-168, P5-16: the run's token cap counts cached input tokens at a fixed share, so
// the run page shows two totals: the raw tokens and the tokens that count toward the cap. The
// server weighs every call this way (`capWeightedTokens`); the page applies the same share to the
// totals the events give.

/** The share of a cached input token that counts toward the token cap, in percent (DEC-168). */
const CACHED_TOKEN_SHARE_PERCENT = 10;

/** Input not read from the cache, a tenth of the cached input (rounded down) and the output. */
export function capTokensOf(parts: {
  readonly input: number;
  readonly cached: number;
  readonly output: number;
}): number {
  const cached = Math.min(parts.cached, parts.input);
  const share = Math.floor((cached * CACHED_TOKEN_SHARE_PERCENT) / 100);
  return parts.input - cached + share + parts.output;
}

export interface TokenFigures {
  /** Input (cached included) plus output, as the providers report them. */
  readonly raw: number;
  /** The tokens that count toward the run token cap. */
  readonly toward: number;
}

export function tokenFiguresOf(state: RunState): TokenFigures {
  const roles = roleTotalsOf(state);
  const sum = (pick: (role: (typeof roles)[number]) => number): number =>
    roles.reduce((total, role) => total + pick(role), 0);
  const input = sum((role) => role.inputTokens);
  const output = sum((role) => role.outputTokens);
  const cached = sum((role) => role.cachedInputTokens);
  return { raw: input + output, toward: capTokensOf({ input, cached, output }) };
}

/** The wording that sets the raw total beside the total toward the cap; undefined when they are equal. */
export function capTokensNote(
  figures: TokenFigures,
  cap: number,
  label: (tokens: number) => string,
): string | undefined {
  if (figures.raw === figures.toward) return undefined;
  return `${label(figures.raw)} tokens (${label(figures.toward)} toward the ${label(cap)} cap: cached input counts ${String(CACHED_TOKEN_SHARE_PERCENT)}%)`;
}
