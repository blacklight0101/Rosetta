import type { JSX } from 'preact';
import { costLabel, tokensLabel } from '../lib/live-run/format.js';
import type { EndFacts } from '../lib/live-run/end-facts.js';
import type { RunState } from '../lib/live-run/run-state.js';

// RF-1015, RF-1017 (P8-27): the five figures of an ended understand run, each shown once and from the
// one count of `endFactsOf`: Supported claims of those judged, Cards, Areas read, Cost and Tokens.

export function Fact(props: {
  readonly label: string;
  readonly value: string;
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
 * below the coverage bar is partly read too (`partlyRead`, from the coverage); until the coverage is
 * known the areas no reader started are all that is said.
 */
function areasDetail(unread: number, partlyRead: number | undefined, facts: EndFacts): string {
  const partly = partlyRead ?? unread;
  if (partly > 0) return `${String(partly)} partly read`;
  return facts.areasRead === facts.areas ? 'all read' : `${String(facts.areasRead)} read`;
}

// RF-1015
export function RunFacts(props: {
  readonly facts: EndFacts;
  readonly costMicros: number;
  /** The run's state: a Deepen marks its cards, and the areas no reader started read "partly read". */
  readonly state: RunState;
  /** P8-93: the areas read below the coverage bar; undefined until the run's coverage is known. */
  readonly partlyRead?: number | undefined;
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
        detail={areasDetail(props.state.ended?.unreadAreas ?? 0, props.partlyRead, facts)}
      />
      <Fact label="Cost" value={costLabel(props.costMicros)} />
      <Fact label="Tokens" value={tokensLabel(facts.tokens)} />
    </ul>
  );
}
