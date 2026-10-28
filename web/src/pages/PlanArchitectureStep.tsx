import type { JSX } from 'preact';
import type { Catalogue, PlanOptions, StyleOption } from '../api/plan-schemas.js';
import { chooseStyle, proposedOf, shownStyle, stylesOf } from '../lib/plan-setup/choices.js';
import { isAnswered } from '../lib/plan-setup/draft.js';
import { TYPED } from '../lib/plan-setup/own-answers.js';
import { PlanChoice } from './PlanChoice.js';
import { PlanOwnChoice } from './PlanOwnChoice.js';
import { PlanOptionsNotice } from './PlanOptionsNotice.js';
import { PlanStepCard } from './PlanStepCard.js';
import type { StepProps } from './PlanPrinciplesStep.js';
import type { OptionsLoad } from './use-plan-options.js';

// RF-608, design-system.md section 14 (Plan setup): the architecture styles the planner proposes
// from the code map and the verified cards, each with its trade-offs and the card ids behind it, one
// marked (Recommended); the other styles of the catalogue follow.

export interface ArchitectureProps extends StepProps {
  readonly load: OptionsLoad;
  readonly waitingForConsent: boolean;
  readonly askAgain: () => void;
}

const titleOf = (catalogue: Catalogue, id: string): string =>
  catalogue.entries.find((entry) => entry.id === id)?.title ?? id;

function List({ items, label }: { readonly items: readonly string[]; readonly label: string }) {
  return items.length === 0 ? null : (
    <>
      <p class="rst-plan-label">{label}</p>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </>
  );
}

function Evidence({ cards }: { readonly cards: readonly string[] }): JSX.Element | null {
  return cards.length === 0 ? null : (
    <p class="rst-plan-evidence">
      Evidence{' '}
      {cards.map((card) => (
        <span key={card} class="rst-chip rst-mono">
          {card}
        </span>
      ))}
    </p>
  );
}

/** RF-645: the style the planner recommends is listed first. */
const recommendedFirst = (options: PlanOptions): readonly StyleOption[] => [
  ...options.architecture.options.filter((o) => o.style === options.architecture.recommended),
  ...options.architecture.options.filter((o) => o.style !== options.architecture.recommended),
];

function Proposed(props: ArchitectureProps & { readonly options: PlanOptions }): JSX.Element {
  const { draft, catalogue, change, options } = props;
  const shown = shownStyle(draft, options, isAnswered(draft, 'architecture'));
  return (
    <div class="rst-plan-options">
      {recommendedFirst(options).map((option: StyleOption) => (
        <PlanChoice
          key={option.style}
          id={`style-${option.style}`}
          group="architecture"
          title={`${titleOf(catalogue, option.style)}${option.style === options.architecture.recommended ? ' (Recommended)' : ''}`}
          checked={shown === option.style && draft.chosen.architecture !== TYPED}
          onChoose={() => {
            change(chooseStyle(draft, options, option.style));
          }}
        >
          <List items={option.strengths} label="Strengths" />
          <List items={option.costs} label="Costs" />
          <Evidence cards={option.evidence} />
        </PlanChoice>
      ))}
    </div>
  );
}

function Others(props: ArchitectureProps & { readonly options: PlanOptions | undefined }) {
  const { draft, catalogue, change, options } = props;
  const proposed = proposedOf(options);
  const others = stylesOf(catalogue).filter((entry) => !proposed.includes(entry.id));
  const shown = shownStyle(draft, options, isAnswered(draft, 'architecture'));
  return others.length === 0 ? null : (
    <fieldset class="rst-plan-group">
      <legend>{`Other styles (${String(others.length)})`}</legend>
      {others.map((entry) => (
        <PlanChoice
          key={entry.id}
          id={`style-${entry.id}`}
          group="architecture"
          title={entry.title}
          checked={shown === entry.id && draft.chosen.architecture !== TYPED}
          onChoose={() => {
            change(chooseStyle(draft, options, entry.id));
          }}
        >
          <p class="rst-plan-note">{entry.rule}</p>
        </PlanChoice>
      ))}
    </fieldset>
  );
}

// RF-608
export function PlanArchitectureStep(props: ArchitectureProps): JSX.Element {
  const options = props.load.status === 'ready' ? props.load.options : undefined;
  return (
    <PlanStepCard step="architecture" defaultText="Default: the style Rosetta recommends.">
      <PlanOptionsNotice
        load={props.load}
        waitingForConsent={props.waitingForConsent}
        askAgain={props.askAgain}
      />
      {options === undefined ? null : <Proposed {...props} options={options} />}
      {props.load.status === 'loading' ? null : <Others {...props} options={options} />}
      <PlanOwnChoice
        question="architecture"
        group="architecture"
        draft={props.draft}
        change={props.change}
        problem={props.problems['typed.architecture']}
      />
    </PlanStepCard>
  );
}
