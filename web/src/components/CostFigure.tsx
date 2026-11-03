import type { ComponentChildren, JSX } from 'preact';
import { useId } from 'preact/hooks';
import type { UsageTotals } from '../api/cost-schemas.js';
import { unknownCallsText } from '../lib/cost-text.js';
import { formatMoney } from '../lib/money.js';

// RF-428, RNF-010, DEC-54, DEC-217: a cost on the cost page, written by the one money formatter, each
// amount with its exact figure in a tooltip. The amount takes focus (Tab, or a tap), which shows the
// figure beside it and has a screen reader read it with the amount; Escape closes it. Dollars read
// `$3.11`; any other currency by its code. A cost the ledger does not know is named after the known
// one, never shown as zero (RF-427).

const inCurrency = (money: string, currency: string): string =>
  currency === 'USD' ? money : `${money.replace('$', '')} ${currency}`;

function Amount(props: { readonly currency: string; readonly micros: string }): JSX.Element {
  const tipId = useId();
  const { text, exact } = formatMoney(props.micros);
  const shown = inCurrency(text, props.currency);
  const full = inCurrency(exact, props.currency);
  if (full === shown) return <span>{shown}</span>;
  return (
    <span
      class="rst-p136-amount"
      tabIndex={0}
      aria-describedby={tipId}
      onKeyDown={(event) => {
        if (event.key === 'Escape') event.currentTarget.blur();
      }}
    >
      {shown}
      <span id={tipId} role="tooltip" class="rst-p136-amount__exact">
        {full}
      </span>
    </span>
  );
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
