import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { Amount, carriesExactFigure } from './CostFigure.js';

// RF-428, RNF-010, DEC-54, DEC-217, P8-91: an amount of any page other than the cost page, written by the
// one money formatter with its exact figure in the tooltip of CostFigure. A table keeps one Tab stop among
// its amounts, on the one last reached (`useAmountTabStop`, which the cost tables use as well); an amount
// that stands alone is its own Tab stop. The arrow keys move between the amounts of a table.

const asMicros = (micros: number | string): string =>
  typeof micros === 'number' ? String(Math.round(micros)) : micros;

/** Whether an amount carries a tooltip, so it can take focus. */
export const hasTooltip = (micros: number | string): boolean =>
  carriesExactFigure(asMicros(micros));

/** What an amount of a table is told about the Tab stop of its table. */
export interface AmountStop {
  readonly tabStop: boolean;
  readonly onReach: () => void;
}

/**
 * The one Tab stop of the amounts of a table: the amount last reached, the first of them until one is,
 * among those that carry a tooltip (a plain amount cannot take focus). An amount that is gone or turned
 * plain hands the stop back to the first of the others.
 */
export function useAmountTabStop(
  amounts: readonly { readonly key: string; readonly exact: boolean }[],
): {
  readonly stopKey: string | undefined;
  readonly reach: (key: string) => void;
  /** What the amount of `key` takes as props. */
  readonly stopOf: (key: string) => AmountStop;
} {
  const [reached, setReached] = useState<string | null>(null);
  const stops = amounts.filter((amount) => amount.exact);
  const stopKey = stops.some((amount) => amount.key === reached) ? reached : stops[0]?.key;
  return {
    stopKey: stopKey ?? undefined,
    reach: setReached,
    stopOf: (key) => ({
      tabStop: key === stopKey,
      onReach: () => {
        setReached(key);
      },
    }),
  };
}

export interface MoneyAmountProps extends Partial<AmountStop> {
  readonly micros: number | string;
  /** The currency code; dollars when left out. */
  readonly currency?: string;
}

export function MoneyAmount({
  micros,
  currency = 'USD',
  tabStop = false,
  onReach,
}: MoneyAmountProps): JSX.Element {
  return (
    <Amount currency={currency} micros={asMicros(micros)} tabStop={tabStop} onReach={onReach} />
  );
}
