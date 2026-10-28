import type { JSX } from 'preact';
import { chooseOption, chosen } from '../lib/plan-setup/choices.js';
import { withAnswered, type Draft } from '../lib/plan-setup/draft.js';
import { TYPED } from '../lib/plan-setup/own-answers.js';
import { OWN_ANSWER, optionTitle, questionOptions } from '../lib/plan-setup/question-options.js';
import type { Catalogue } from '../api/plan-schemas.js';
import type { ContextField } from '../lib/plan-setup/steps.js';
import { PlanChoice } from './PlanChoice.js';

// RF-645, RF-611, DEC-178: the options of one project-context question as radio cards: leave it
// open (the recommended default), a few answers and "Type your own answer". Choosing an answer
// fills the field below; typing in the field is the own answer.

export interface PlanContextChoicesProps {
  readonly field: ContextField;
  readonly label: string;
  readonly draft: Draft;
  readonly catalogue: Catalogue;
  readonly change: (next: Draft) => void;
}

/** The id of the option shown as chosen: the default while unanswered, else the saved choice. */
function shownOption(draft: Draft, field: ContextField): string {
  const question = `context.${field}`;
  if (!draft.answered.includes(question)) return 'open';
  return draft.chosen[question] ?? (draft.context[field].trim() === '' ? 'open' : TYPED);
}

// RF-645
export function PlanContextChoices(props: PlanContextChoicesProps): JSX.Element {
  const { field, label, draft, catalogue, change } = props;
  const question = `context.${field}`;
  const options = questionOptions(question, { catalogue, options: undefined });
  const shown = shownOption(draft, field);
  const group = `choice-${question}`;
  return (
    <div role="radiogroup" aria-labelledby={`${group}-label`} class="rst-plan-options">
      <p id={`${group}-label`} class="rst-plan-label">
        {`Choose an answer for ${label.toLowerCase()}`}
      </p>
      {options.map((option) => (
        <PlanChoice
          key={option.id}
          id={`${group}-${option.id}`}
          group={group}
          title={optionTitle(option)}
          checked={shown === option.id}
          onChoose={() => {
            const value = option.value ?? '';
            change(
              chooseOption(
                { ...draft, context: { ...draft.context, [field]: value } },
                question,
                option.id,
              ),
            );
          }}
        >
          <p class="rst-plan-note">{option.description}</p>
        </PlanChoice>
      ))}
      <PlanChoice
        id={`${group}-typed`}
        group={group}
        title={OWN_ANSWER}
        checked={shown === TYPED}
        onChoose={() => {
          change(withAnswered(chosen(draft, question, TYPED), [question]));
        }}
      />
    </div>
  );
}
