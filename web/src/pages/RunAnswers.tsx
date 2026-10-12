import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { saveAnswer, type OpenQuestionRow } from '../api/answers.js';
import type { ApiFailure } from '../api/client.js';
import { useApp } from '../app/app-context.js';
import { Button } from '../components/Button.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { Field } from '../components/Field.js';
import { RenderedText } from '../components/RenderedText.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { useRunAnswers } from './use-run-answers.js';

// RF-1007, RF-240, RF-507: the open questions of an understand run on its live page, each with a
// field for the answer. Saving writes the answer into the project's answers.md (the other answers
// stay); a question is marked answered only when its area is analysed again with the answers
// (RF-241), so every question here reads Open. Question and context come from a model and are
// shown as text. All the styles are under `.rst-p139-`.

export interface RunAnswersProps {
  /** The run's id (the UUID). */
  readonly runId: string;
  readonly ended: boolean;
}

interface AnswerSave {
  readonly text: string;
  readonly busy: boolean;
  readonly failure: ApiFailure | undefined;
  readonly message: string;
  readonly type: (value: string) => void;
  readonly submit: () => Promise<void>;
}

function useAnswerSave(runId: string, question: OpenQuestionRow): AnswerSave {
  const { client } = useApp();
  const [text, setText] = useState(question.answer);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | undefined>();
  const [message, setMessage] = useState('');
  const submit = async (): Promise<void> => {
    setBusy(true);
    setFailure(undefined);
    setMessage('');
    const result = await saveAnswer(client, runId, { cardId: question.cardId, answer: text });
    setBusy(false);
    if (!result.ok) {
      setFailure(result.error);
      return;
    }
    const saved = result.value.find((each) => each.cardId === question.cardId)?.answer ?? '';
    setText(saved);
    setMessage(saved === '' ? 'Answer cleared in answers.md.' : 'Answer saved in answers.md.');
  };
  const type = (value: string): void => {
    setText(value);
    setMessage('');
  };
  return { text, busy, failure, message, type, submit };
}

function QuestionItem(props: {
  readonly runId: string;
  readonly question: OpenQuestionRow;
}): JSX.Element {
  const { question } = props;
  const save = useAnswerSave(props.runId, question);
  return (
    <li class="rst-p139-question" data-testid="open-question">
      <div class="rst-p139-question__head">
        <span class="rst-mono rst-p139-question__id">{question.cardId}</span>
        <StatusBadge list="OpenQuestionState" value="Open" />
      </div>
      <p class="rst-p139-question__text">
        <RenderedText text={question.question} />
      </p>
      <p class="rst-p139-question__context">
        <RenderedText text={question.context} />
      </p>
      <form
        class="rst-p139-question__form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void save.submit();
        }}
      >
        {save.failure === undefined ? null : <ErrorBanner error={save.failure} />}
        <Field
          kind="textarea"
          id={`answer-${question.cardId}`}
          label={`Answer to ${question.cardId}`}
          rows={3}
          value={save.text}
          help="Saved on one line in the project's answers.md. Leave it empty to clear the answer."
          onInput={save.type}
        />
        <div class="rst-p139-question__actions">
          <Button type="submit" variant="secondary" busy={save.busy}>
            Save answer
          </Button>
          <p class="rst-settings__note" role="status">
            {save.message}
          </p>
        </div>
      </form>
    </li>
  );
}

function Body({ runId, ended }: RunAnswersProps): JSX.Element {
  const load = useRunAnswers(runId, ended);
  if (load.status === 'waiting') {
    return <p class="rst-settings__note">The open questions appear here when the run ends.</p>;
  }
  if (load.status === 'loading') {
    return (
      <p class="rst-loading" role="status">
        Loading the open questions
      </p>
    );
  }
  if (load.status === 'failed') return <ErrorBanner error={load.error} />;
  if (load.questions.length === 0) {
    return <p class="rst-settings__note">This run added no open questions.</p>;
  }
  return (
    <ol class="rst-p139-answers__list">
      {load.questions.map((question) => (
        <QuestionItem key={question.cardId} runId={runId} question={question} />
      ))}
    </ol>
  );
}

// RF-1007
export function RunAnswers(props: RunAnswersProps): JSX.Element {
  return (
    <section class="rst-card rst-p139-answers" aria-label="Open questions">
      <h2 class="rst-live-section__title">Open questions</h2>
      <Body {...props} />
    </section>
  );
}
