import type { JSX } from 'preact';
import { Amount, carriesExactFigure } from './CostFigure.js';

// RF-428, RNF-010, DEC-54, DEC-217, P8-91: an amount in a table of any page other than the cost page, written
// by the one money formatter with its exact figure in the tooltip of CostFigure. A table keeps one Tab stop
// among its amounts, the first that has a tooltip (`firstExactAt`); the arrow keys move between the others.

const asMicros = (micros: number | string): string =>
  typeof micros === 'number' ? String(Math.round(micros)) : micros;

/** The index of the first amount of a table that carries a tooltip, or -1 when none does. */
export function firstExactAt(amounts: readonly (number | string)[]): number {
  return amounts.findIndex((micros) => carriesExactFigure(asMicros(micros)));
}

export interface MoneyAmountProps {
  readonly micros: number | string;
  /** The currency code; dollars when left out. */
  readonly currency?: string;
  /** Whether the amount is the Tab stop of its table. */
  readonly tabStop?: boolean;
}

export function MoneyAmount({
  micros,
  currency = 'USD',
  tabStop = false,
}: MoneyAmountProps): JSX.Element {
  return <Amount currency={currency} micros={asMicros(micros)} tabStop={tabStop} />;
}
