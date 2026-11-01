import type { JSX } from 'preact';
import { chooseOption } from '../lib/plan-setup/choices.js';
import type { Draft } from '../lib/plan-setup/draft.js';
import { TYPED } from '../lib/plan-setup/own-answers.js';
import { optionTitle } from '../lib/plan-setup/question-options.js';
import { WORKBOOK_QUESTIONS, workbookOptions } from '../lib/plan-setup/workbook-questions.js';
import { PlanChoice } from './PlanChoice.js';
import { PlanOwnChoice } from './PlanOwnChoice.js';

// RF-648, RF-649, RF-650, RF-645, DEC-150: the three questions of a project of Excel workbooks: how
// people sign in, where the secrets go and whether each register gets screens. Each has three
// options with the recommended one first (it applies when the question is skipped) and "Type your
// own answer"; a question left alone sends nothing and the package lists its default.

export interface PlanWorkbookQuestionsProps {
  readonly draft: Draft;
  readonly change: (next: Draft) => void;
  readonly problems: Readonly<Record<string, string>>;
}

// RF-648
export function PlanWorkbookQuestions(props: PlanWorkbookQuestionsProps): JSX.Element {
  const { draft, change, problems } = props;
  const hosting = draft.stack['hosting']?.choice ?? '';
  return (
    <>
      {WORKBOOK_QUESTIONS.map(({ id, label }) => {
        const options = workbookOptions(id, hosting);
        const group = `choice-${id}`;
        const shown = draft.chosen[id] ?? options.find((option) => option.recommended)?.id;
        return (
          <div key={id} class="rst-plan-question">
            <div role="radiogroup" aria-labelledby={`${group}-label`} class="rst-plan-options">
              <p id={`${group}-label`} class="rst-plan-label">
                {label}
              </p>
              {options.map((option) => (
                <PlanChoice
                  key={option.id}
                  id={`${group}-${option.id}`}
                  group={group}
                  title={optionTitle(option)}
                  checked={shown === option.id && shown !== TYPED}
                  onChoose={() => {
                    change(chooseOption(draft, id, option.id));
                  }}
                >
                  <p class="rst-plan-note">{option.description}</p>
                </PlanChoice>
              ))}
              <PlanOwnChoice
                question={id}
                group={group}
                draft={draft}
                change={change}
                problem={problems[`typed.${id}`]}
              />
            </div>
          </div>
        );
      })}
    </>
  );
}
