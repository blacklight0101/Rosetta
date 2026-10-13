import { tokensLabel } from '../live-run/format.js';
import { microsToDollars } from '../usd.js';

// RF-1011: how the API calls panel writes a duration, a cost, a token count and a time.

/** `420 ms` below a second, else seconds with one decimal; `-` for nothing to say. */
export function durationText(ms: number | null): string {
  if (ms === null) return '-';
  if (ms < 1000) return `${String(Math.round(ms))} ms`;
  return `${(Math.round(ms / 100) / 10).toFixed(1)} s`;
}

/** Dollars with at least the cents; a fraction of a cent is kept (a small call costs less). */
export const costText = (micros: number): string =>
  `$${microsToDollars(String(Math.round(micros)))}`;

export const tokenText = (tokens: number): string => tokensLabel(tokens);

/** `38 tok/s`; `-` when the provider reports no speed. */
export function speedText(tokensPerSecond: number | null): string {
  return tokensPerSecond === null ? '-' : `${String(Math.round(tokensPerSecond))} tok/s`;
}

/** The time of day of an ISO instant, in UTC, as the logs show it. */
export const clockText = (instant: string): string => instant.slice(11, 19);
