import type { JSX } from 'preact';
import type { Draft, HostedAnswer } from '../lib/plan-setup/draft.js';
import { PlanChoice } from './PlanChoice.js';

// P6-26, RF-611, RF-643, DEC-189: the optional question "Will the new application be hosted?". It
// has no recommended option (an exception to RF-645, like the build method) and nothing is chosen
// until the person answers. Hosted and not hosted write `context.deployment`; not stated leaves it
// out, so the package has no delivery-flow section.

const QUESTION = 'Will the new application be hosted?';

const ANSWERS: readonly {
  readonly value: Exclude<HostedAnswer, ''>;
  readonly title: string;
  readonly note: string;
}[] = [
  {
    value: 'hosted',
    title: 'Hosted',
    note: 'The package adds a recommended delivery flow (integration branch, staging, release) to orchestration.md.',
  },
  {
    value: 'not-hosted',
    title: 'Not hosted',
    note: 'The package has no delivery-flow section.',
  },
  {
    value: 'not-stated',
    title: 'Not stated',
    note: 'Nothing is assumed; the package has no delivery-flow section.',
  },
];

export interface PlanHostedQuestionProps {
  readonly draft: Draft;
  readonly change: (next: Draft) => void;
}

// RF-611
export function PlanHostedQuestion({ draft, change }: PlanHostedQuestionProps): JSX.Element {
  return (
    <div class="rst-plan-question">
      <fieldset role="radiogroup" class="rst-plan-group rst-plan-options">
        <legend>{QUESTION}</legend>
        {ANSWERS.map((answer) => (
          <PlanChoice
            key={answer.value}
            id={`context-deployment-${answer.value}`}
            group="context-deployment"
            title={answer.title}
            checked={draft.deployment === answer.value}
            onChoose={() => {
              change({ ...draft, deployment: answer.value });
            }}
          >
            <p class="rst-plan-note">{answer.note}</p>
          </PlanChoice>
        ))}
      </fieldset>
    </div>
  );
}
