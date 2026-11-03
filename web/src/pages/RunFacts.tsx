import type { JSX } from 'preact';
import { costLabel, tokensLabel } from '../lib/live-run/format.js';
import type { EndFacts } from '../lib/live-run/end-facts.js';

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

// RF-1015
export function RunFacts(props: {
  readonly facts: EndFacts;
  readonly costMicros: number;
  readonly deepen: boolean;
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
        {...(props.deepen ? { detail: 'written by this Deepen' } : {})}
      />
      <Fact label="Areas read" value={`${String(facts.areasRead)} / ${String(facts.areas)}`} />
      <Fact label="Cost" value={costLabel(props.costMicros)} />
      <Fact label="Tokens" value={tokensLabel(facts.tokens)} />
    </ul>
  );
}
