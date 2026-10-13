import { costLabel } from './format.js';
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
}

const WARN_FROM = 80;
const DANGER_FROM = 95;

/** The level of the exact share, so 79.9% is not shown as a warning because it rounds to 80. */
function levelOf(costMicros: number, capMicros: number): MeterLevel {
  if (!(capMicros > 0)) return 'ok';
  if (costMicros * 100 >= capMicros * DANGER_FROM) return 'danger';
  return costMicros * 100 >= capMicros * WARN_FROM ? 'warn' : 'ok';
}

// RF-1003
export function topBarMeterOf(costMicros: number, capMicros: number): TopBarMeter {
  const share = shareOf(costMicros, capMicros);
  const level = levelOf(costMicros, capMicros);
  const spent = costLabel(costMicros);
  const cap = costLabel(capMicros);
  const words = { ok: undefined, warn: 'approaching the cap', danger: 'at the cap' }[level];
  const note =
    words === undefined ? undefined : `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
  const valueText = `${spent} of ${cap} (${String(share)}%)`;
  return {
    share,
    level,
    spent,
    cap,
    note,
    valueText: words === undefined ? valueText : `${valueText}, ${words}`,
  };
}
