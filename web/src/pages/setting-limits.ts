// RF-002, DEC-116, DEC-117: the allowed range of each numeric project setting that has a slider on
// the settings page, and the value templates/project-settings.json gives it. The form shows dollars
// in dollars and every other number as it is stored. tests/unit/web/settings-limits.test.ts keeps
// these in step with the template and with the ranges the server accepts.

export interface Range {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

export type LimitUnit = 'count' | 'dollars';

export const ranges = {
  maxOutputTokens: { min: 256, max: 128_000, step: 256 },
  maxTurns: { min: 1, max: 50, step: 1 },
  runCost: { min: 0, max: 100, step: 0.01 },
  confirmAbove: { min: 0, max: 100, step: 0.01 },
  runTokens: { min: 0, max: 50_000_000, step: 1_000 },
  maxFileBytes: { min: 1_000, max: 5_000_000, step: 1_000 },
  areaTokenBudget: { min: 4_000, max: 200_000, step: 1_000 },
  excerptMaxLines: { min: 20, max: 2_000, step: 1 },
  parallelism: { min: 1, max: 8, step: 1 },
};

/** The value the template gives each setting, in the units the form shows (dollars for amounts). */
export const templateDefaults = {
  maxOutputTokens: { reader: 4_096, verifier: 2_048, planner: 16_384, summariser: 2_048 },
  maxTurns: 12,
  runCost: 0.5,
  runTokens: 2_000_000,
  confirmAbove: 0.25,
  maxFileBytes: 1_000_000,
  areaTokenBudget: 60_000,
  excerptMaxLines: 400,
  parallelism: 4,
};

/** The number a field's text stands for, or undefined when the text is empty or not a number. */
export function numberOf(text: string): number | undefined {
  const trimmed = text.trim();
  const value = Number(trimmed);
  return trimmed === '' || !Number.isFinite(value) ? undefined : value;
}

/** The most the confirm threshold may be: the run cost cap, kept inside its own range (DEC-117). */
export function confirmCeiling(runCost: string): number {
  const cap = numberOf(runCost);
  if (cap === undefined) return ranges.confirmAbove.max;
  return Math.min(Math.max(cap, ranges.confirmAbove.min), ranges.confirmAbove.max);
}

/** Whether the run cost cap, as typed, is a number outside its own range (P2-29: the confirm hint waits). */
export function runCostOutOfRange(runCost: string): boolean {
  const cap = numberOf(runCost);
  return cap !== undefined && (cap < ranges.runCost.min || cap > ranges.runCost.max);
}

/** A number for a person to read: grouped thousands, and dollars with cents unless whole. */
export function formatValue(value: number, unit: LimitUnit): string {
  if (unit === 'dollars') return `$${value.toFixed(Number.isInteger(value) ? 0 : 2)}`;
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/gu, ',');
}

/**
 * An amount for a sentence that compares two of them: dollars to at least cents (more when the
 * amount has them, so 1.004 stays 1.004), a minus sign before the dollar sign, counts as formatValue.
 */
export function formatAmount(value: number, unit: LimitUnit): string {
  if (unit === 'count') return formatValue(value, 'count');
  const sign = value < 0 ? '-' : '';
  const [whole = '0', fraction = ''] = Math.abs(value).toFixed(6).replace(/0+$/u, '').split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/gu, ',');
  return `${sign}$${grouped}.${fraction.padEnd(2, '0')}`;
}
