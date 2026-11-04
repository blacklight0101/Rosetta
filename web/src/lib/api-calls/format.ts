import { costLabel, tokensLabel } from '../live-run/format.js';

// RF-1011: how the API calls panel writes a duration, a cost, a token count and a time.

/** `420 ms` below a second, else seconds with one decimal; `-` for nothing to say. */
export function durationText(ms: number | null): string {
  if (ms === null) return '-';
  if (ms < 1000) return `${String(Math.round(ms))} ms`;
  return `${(Math.round(ms / 100) / 10).toFixed(1)} s`;
}

/** A call's cost by the one money formatter (DEC-54). */
export const costText = (micros: number): string => costLabel(micros);

export const tokenText = (tokens: number): string => tokensLabel(tokens);

/** `38 tok/s`; `-` when the provider reports no speed. */
export function speedText(tokensPerSecond: number | null): string {
  return tokensPerSecond === null ? '-' : `${String(Math.round(tokensPerSecond))} tok/s`;
}

/** The time of day of an ISO instant, in UTC, as the logs show it. */
export const clockText = (instant: string): string => instant.slice(11, 19);
