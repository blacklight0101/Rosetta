import { ranges } from '../pages/setting-limits.js';

// RF-002, DEC-117, P5-07: the run token cap as a person types it on the start page.

/** A whole number of tokens inside the range of the setting (commas allowed), else undefined. */
export function tokensOf(text: string): number | undefined {
  const trimmed = text.trim();
  const value = Number(trimmed.replaceAll(',', ''));
  const inRange = value >= ranges.runTokens.min && value <= ranges.runTokens.max;
  return trimmed !== '' && Number.isInteger(value) && inRange ? value : undefined;
}
