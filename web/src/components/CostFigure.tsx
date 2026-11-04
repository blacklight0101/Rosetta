import type { ComponentChildren, JSX } from 'preact';
import { useId, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { UsageTotals } from '../api/cost-schemas.js';
import { unknownCallsText } from '../lib/cost-text.js';
import { formatMoney } from '../lib/money.js';

// RF-428, RNF-010, DEC-54, DEC-217: a cost on the cost page, written by the one money formatter, each
// amount with its exact figure in a tooltip. The amount takes focus (Tab, or a tap), which shows the
// figure beside it and has a screen reader read it with the amount. Escape closes the figure while the
// pointer rests on the amount or the amount has focus, wherever the focus is (WCAG 1.4.13: a browser sends no
// key to an amount that is only hovered, so the listener sits on the document while the figure is open),
// until the pointer leaves or the focus moves. In a table the amounts take one tab stop, which follows the
// amount last focused, and the arrow keys, Home and End move between them. The figure sits beside the
// focusable amount, not inside it, so the amount's name is the amount alone. Dollars read
// `$3.11`; any other currency by its code. A cost the ledger does not know is named after the known
// one, never shown as zero (RF-427).

const inCurrency = (money: string, currency: string): string =>
  currency === 'USD' ? money : `${money.replace('$', '')} ${currency}`;

/** The amount as shown and as exact, in its currency; they differ when the amount carries a tooltip. */
function writtenAmount(currency: string, micros: string): { shown: string; full: string } {
  const { text, exact } = formatMoney(micros);
  return { shown: inCurrency(text, currency), full: inCurrency(exact, currency) };
}

const knownCosts = (totals: UsageTotals): UsageTotals['cost'] =>
  totals.cost.length === 0 ? [{ currency: 'USD', costMicros: '0' }] : totals.cost;

/** Whether one amount carries a tooltip (its exact figure differs from the one shown), so it can take focus. */
export function carriesExactFigure(micros: string): boolean {
  const { text, exact } = formatMoney(micros);
  return text !== exact;
}

/** Whether an amount of the totals carries a tooltip, so it can take focus. */
export function hasExactFigure(totals: UsageTotals): boolean {
  return knownCosts(totals).some(({ currency, costMicros }) => {
    const { shown, full } = writtenAmount(currency, costMicros);
    return shown !== full;
  });
}

const AMOUNT_ATTRIBUTE = 'data-rst-amount';

/** The amount the key moves to among those of the table, or `null` for a key that moves nowhere. */
function neighbour(amounts: readonly Element[], from: Element, key: string): Element | null {
  const at = amounts.indexOf(from);
  if (at < 0) return null;
  const last = amounts.length - 1;
  const target = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: last }[key];
  return target === undefined ? null : (amounts[Math.min(Math.max(target, 0), last)] ?? null);
}

function moveBetweenAmounts(event: KeyboardEvent): void {
  const from = event.currentTarget;
  const table = from instanceof Element ? from.closest('table') : null;
  if (table === null || !(from instanceof Element)) return;
  const to = neighbour([...table.querySelectorAll(`[${AMOUNT_ATTRIBUTE}]`)], from, event.key);
  if (to instanceof HTMLElement) {
    event.preventDefault();
    to.focus();
  }
}

/**
 * Whether the figure of an amount is closed with Escape, and the four events that open and end it. The
 * document listener is there from the start of an amount with a tooltip and reads refs, so an Escape pressed
 * the moment the figure shows is never missed.
 */
function useDismissal() {
  const [dismissed, setDismissed] = useState(false);
  const over = useRef({ hovered: false, focused: false });
  useLayoutEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && (over.current.hovered || over.current.focused)) {
        setDismissed(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, []);
  return {
    dismissed,
    enter: () => {
      over.current.hovered = true;
    },
    leave: () => {
      over.current.hovered = false;
      if (!over.current.focused) setDismissed(false);
    },
    focus: () => {
      over.current.focused = true;
      setDismissed(false);
    },
    blur: () => {
      over.current.focused = false;
      setDismissed(false);
    },
  };
}

export interface AmountProps {
  readonly currency: string;
  readonly micros: string;
  /** Whether the amount is in the Tab order; a table keeps one of its amounts there. */
  readonly tabStop: boolean;
  /** Called when the amount takes focus. */
  readonly onReach?: (() => void) | undefined;
}

function ExactAmount(props: AmountProps & { readonly shown: string; readonly full: string }) {
  const tipId = useId();
  const figure = useDismissal();
  return (
    <span
      class="rst-p136-amount"
      data-dismissed={figure.dismissed ? '' : undefined}
      onMouseEnter={figure.enter}
      onMouseLeave={figure.leave}
    >
      <span
        class="rst-p136-amount__value"
        {...{ [AMOUNT_ATTRIBUTE]: '' }}
        tabIndex={props.tabStop ? 0 : -1}
        aria-describedby={tipId}
        onFocus={() => {
          figure.focus();
          props.onReach?.();
        }}
        onBlur={figure.blur}
        onKeyDown={moveBetweenAmounts}
      >
        {props.shown}
      </span>
      <span id={tipId} role="tooltip" class="rst-p136-amount__exact">
        {props.full}
      </span>
    </span>
  );
}

export function Amount(props: AmountProps): JSX.Element {
  const { shown, full } = writtenAmount(props.currency, props.micros);
  if (full === shown) return <span>{shown}</span>;
  return <ExactAmount {...props} shown={shown} full={full} />;
}

export interface CostFigureProps {
  readonly totals: UsageTotals;
  /** False when another row of the table holds the Tab stop; the arrow keys still reach this one. */
  readonly tabStop?: boolean;
  readonly onReach?: () => void;
}

export function CostFigure({ totals, tabStop = true, onReach }: CostFigureProps): JSX.Element {
  const parts: ComponentChildren[] = knownCosts(totals).flatMap(({ currency, costMicros }, at) => [
    at === 0 ? null : ' + ',
    <Amount
      key={currency}
      currency={currency}
      micros={costMicros}
      tabStop={tabStop}
      onReach={onReach}
    />,
  ]);
  const unknown = totals.unknownCostCalls;
  return (
    <>
      {parts}
      {unknown === 0 ? null : ` + ${unknownCallsText(unknown)}`}
    </>
  );
}
