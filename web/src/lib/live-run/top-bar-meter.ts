import { costLabel, tokensLabel } from './format.js';
import type { MeterUnit } from './run-meter-reading.js';
import { shareOf } from './run-summary.js';

// RF-1003, RF-1010, DEC-49, design-system.md section 5 (cost meter): what the "This run" meter of the
// top bar shows: the cost so far against the run's cap and its share. From 80% it warns and from 95%
// it is in danger; the level is said in words as well, so colour is never the only signal.

type MeterLevel = 'ok' | 'warn' | 'danger';

export interface TopBarMeter {
  /** Whole percent of the cap spent, never above 100. */
  readonly share: number;
  readonly level: MeterLevel;
  readonly spent: string;
  readonly cap: string;
  /** The level in words, shown beside the meter from the warning level on. */
  readonly note: string | undefined;
  readonly valueText: string;
  /** P5-07: tokens for a run on local models, micro-dollars otherwise. */
  readonly unit: MeterUnit;
}

const WARN_FROM = 80;
const DANGER_FROM = 95;

/** The level of the exact share, so 79.9% is not shown as a warning because it rounds to 80. */
function levelOf(costMicros: number, capMicros: number): MeterLevel {
  if (!(capMicros > 0)) return 'ok';
  if (costMicros * 100 >= capMicros * DANGER_FROM) return 'danger';
  return costMicros * 100 >= capMicros * WARN_FROM ? 'warn' : 'ok';
}

/** P5-07: a run on local models only has tokens, so its meter names tokens and no dollars. */
const labelOf = (unit: MeterUnit, amount: number): string =>
  unit === 'tokens' ? `${tokensLabel(amount)} tokens` : costLabel(amount);

// RF-1003
export function topBarMeterOf(spent: number, cap: number, unit: MeterUnit = 'micros'): TopBarMeter {
  const share = shareOf(spent, cap);
  const level = levelOf(spent, cap);
  const spentText = labelOf(unit, spent);
  const capText = labelOf(unit, cap);
  const words = { ok: undefined, warn: 'approaching the cap', danger: 'at the cap' }[level];
  const note =
    words === undefined ? undefined : `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
  const valueText = `${spentText} of ${capText} (${String(share)}%)`;
  return {
    share,
    level,
    spent: spentText,
    cap: capText,
    note,
    unit,
    valueText: words === undefined ? valueText : `${valueText}, ${words}`,
  };
}
