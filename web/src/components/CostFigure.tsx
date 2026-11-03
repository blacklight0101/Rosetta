import type { ComponentChildren, JSX } from 'preact';
import type { UsageTotals } from '../api/cost-schemas.js';
import { unknownCallsText } from '../lib/cost-text.js';
import { formatMoney } from '../lib/money.js';

// RF-428, DEC-54: a cost on the cost page, written by the one money formatter, each amount with
// its exact figure in the tooltip. Dollars read `$3.11`; any other currency by its code. A cost the
// ledger does not know is named after the known one, never shown as zero (RF-427).

function Amount(props: { readonly currency: string; readonly micros: string }): JSX.Element {
  const { text, exact } = formatMoney(props.micros);
  const usd = props.currency === 'USD';
  const shown = usd ? text : `${text.slice(1)} ${props.currency}`;
  const title = usd ? exact : `${exact.slice(1)} ${props.currency}`;
  return <span title={title === shown ? undefined : title}>{shown}</span>;
}

export function CostFigure({ totals }: { readonly totals: UsageTotals }): JSX.Element {
  const known = totals.cost.length === 0 ? [{ currency: 'USD', costMicros: '0' }] : totals.cost;
  const parts: ComponentChildren[] = known.flatMap(({ currency, costMicros }, at) => [
    at === 0 ? null : ' + ',
    <Amount key={currency} currency={currency} micros={costMicros} />,
  ]);
  const unknown = totals.unknownCostCalls;
  return (
    <>
      {parts}
      {unknown === 0 ? null : ` + ${unknownCallsText(unknown)}`}
    </>
  );
}
