import type { JSX } from 'preact';
import type { OpenQuestionRow } from '../api/answers.js';
import { Field } from '../components/Field.js';
import { PlanChoice } from './PlanChoice.js';
import type { AnswerSave } from './use-answer-save.js';

// RF-645, RF-1007, DEC-178, design-system.md section 14 (option cards): the answer to one question.
// A question with suggested answers shows them as radio options, the recommended one first and marked,
// plus "Type your own answer", which opens the text field. A question saved before DEC-178 has no
// options and keeps its free text field. The option text comes from a model and is shown as text.

const HELP = "Saved on one line in the project's answers.md. Leave it empty to clear the answer.";
const REOPEN_HELP =
  ' This question is Answered: reopen it for the next re-run to use an edited answer.';

function TextAnswer(props: {
  readonly question: OpenQuestionRow;
  readonly save: AnswerSave;
  readonly id: string;
}): JSX.Element {
  const { question, save, id } = props;
  const answered = question.state === 'Answered';
  return (
    <Field
      kind="textarea"
      id={id}
      label={`Answer to ${question.cardId}`}
      rows={3}
      value={save.text}
      help={answered ? `${HELP}${REOPEN_HELP}` : HELP}
      onInput={save.type}
    />
  );
}

function Choices(props: {
  readonly question: OpenQuestionRow;
  readonly options: NonNullable<OpenQuestionRow['options']>;
  readonly save: AnswerSave;
}): JSX.Element {
  const { question, options, save } = props;
  const group = `choice-${question.cardId}`;
  // The first option takes the id the focus request of "Answer N questions" looks for.
  const idOf = (index: number): string =>
    index === 0 ? `answer-${question.cardId}` : `${group}-${String(index + 1)}`;
  return (
    <div role="radiogroup" aria-labelledby={`${group}-label`} class="rst-p139-choices">
      <p id={`${group}-label`} class="rst-p139-choices__label">
        Choose an answer for {question.cardId}
      </p>
      {options.map((option, index) => (
        <PlanChoice
          key={option.answer}
          id={idOf(index)}
          group={group}
          title={`${option.recommended ? '(Recommended) ' : ''}${option.answer}`}
          checked={save.choice === index + 1}
          onChoose={() => {
            save.choose(index + 1);
          }}
        >
          <p class="rst-p139-question__context">{option.description}</p>
        </PlanChoice>
      ))}
      <PlanChoice
        id={`${group}-typed`}
        group={group}
        title="Type your own answer"
        checked={save.choice === 'typed'}
        onChoose={() => {
          save.choose('typed');
        }}
      />
    </div>
  );
}

// RF-645
export function AnswerInput(props: {
  readonly question: OpenQuestionRow;
  readonly save: AnswerSave;
}): JSX.Element {
  const { question, save } = props;
  const { options } = question;
  if (options === undefined) {
    return <TextAnswer question={question} save={save} id={`answer-${question.cardId}`} />;
  }
  return (
    <>
      <Choices question={question} options={options} save={save} />
      {save.choice === 'typed' ? (
        <TextAnswer question={question} save={save} id={`answer-${question.cardId}-text`} />
      ) : null}
    </>
  );
}
