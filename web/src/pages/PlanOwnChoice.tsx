import type { JSX } from 'preact';
import { Field } from '../components/Field.js';
import { typeOwn } from '../lib/plan-setup/choices.js';
import type { Draft } from '../lib/plan-setup/draft.js';
import { OWN_ANSWER } from '../lib/plan-setup/question-options.js';
import { TYPED } from '../lib/plan-setup/own-answers.js';
import { PlanChoice } from './PlanChoice.js';

// RF-645, DEC-178, design-system.md section 14 (option cards): "Type your own answer" as the last
// radio card of a question; once chosen it opens a text field, and the text is saved in the brief.

export interface PlanOwnChoiceProps {
  readonly question: string;
  readonly group: string;
  readonly draft: Draft;
  readonly change: (next: Draft) => void;
  readonly problem?: string | undefined;
}

// RF-645
export function PlanOwnChoice(props: PlanOwnChoiceProps): JSX.Element {
  const { question, group, draft, change, problem } = props;
  const checked = draft.chosen[question] === TYPED;
  return (
    <>
      <PlanChoice
        id={`own-${question}`}
        group={group}
        title={OWN_ANSWER}
        checked={checked}
        onChoose={() => {
          change(typeOwn(draft, question, draft.typed[question] ?? ''));
        }}
      />
      {checked ? (
        <Field
          kind="text"
          id={`own-${question}-text`}
          label="Your own answer"
          value={draft.typed[question] ?? ''}
          error={problem === undefined ? undefined : { message: problem }}
          onInput={(text) => {
            change(typeOwn(draft, question, text));
          }}
        />
      ) : null}
    </>
  );
}
