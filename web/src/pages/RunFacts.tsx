import type { ComponentChildren, JSX } from 'preact';
import { MoneyAmount } from '../components/MoneyAmount.js';
import { tokensLabel } from '../lib/live-run/format.js';
import type { EndFacts } from '../lib/live-run/end-facts.js';
import type { RunState } from '../lib/live-run/run-state.js';
import type { AreaReading } from '../lib/understanding/area-read.js';

// RF-1015, RF-1017 (P8-27): the five figures of an ended understand run, each shown once and from the
// one count of `endFactsOf`: Supported claims of those judged, Cards, Areas read, Cost and Tokens.

export function Fact(props: {
  readonly label: string;
  readonly value: ComponentChildren;
  /** What the figure is of, for example `of 72 judged`. */
  readonly detail?: string;
}): JSX.Element {
  return (
    <li class="rst-p170-fact">
      <b>{props.value}</b>
      <span>{props.label}</span>
      {props.detail === undefined ? null : <span>{props.detail}</span>}
    </li>
  );
}

/**
 * The artboard says "2 partly read"; a run that read every area says "all read". P8-93: an area read
 * below the coverage bar is partly read too (`reading`, from the coverage). While the coverage is
 * being read, or when it cannot be, the areas no reader started are all that is certain, and the
 * figure never claims "all read".
 */
function areasDetail(unread: number, reading: AreaReading, facts: EndFacts): string {
  const partly = reading.status === 'known' ? Math.max(unread, reading.partly.size) : unread;
  if (partly > 0) return `${String(partly)} partly read`;
  if (reading.status === 'checking') return 'checking coverage';
  if (reading.status === 'unknown') return 'coverage not known';
  return facts.areasRead === facts.areas ? 'all read' : `${String(facts.areasRead)} read`;
}

// RF-1015
export function RunFacts(props: {
  readonly facts: EndFacts;
  readonly costMicros: number;
  /** The run's state: a Deepen marks its cards, and the areas no reader started read "partly read". */
  readonly state: RunState;
  /** P8-93: what the run's coverage says of the areas; none given reads as still checking. */
  readonly reading?: AreaReading | undefined;
}): JSX.Element {
  const { facts } = props;
  return (
    <ul class="rst-p170-facts" aria-label="Run facts">
      <Fact
        label="Supported claims"
        value={String(facts.supportedClaims)}
        detail={`of ${String(facts.judgedClaims)} judged`}
      />
      <Fact
        label="Cards"
        value={String(facts.cards)}
        {...(props.state.deepen !== undefined ? { detail: 'written by this Deepen' } : {})}
      />
      <Fact
        label="Areas"
        value={String(facts.areas)}
        detail={areasDetail(
          props.state.ended?.unreadAreas ?? 0,
          props.reading ?? { status: 'checking' },
          facts,
        )}
      />
      <Fact label="Cost" value={<MoneyAmount micros={props.costMicros} tabStop />} />
      <Fact label="Tokens" value={tokensLabel(facts.tokens)} />
    </ul>
  );
}
