import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { sectionTitles } from '../api/overview.js';
import { reopenQuestion, saveAnswer, type OpenQuestionRow } from '../api/answers.js';
import type { ApiFailure, ApiResult } from '../api/client.js';
import { useApp } from '../app/app-context.js';
import { Button } from '../components/Button.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { Field } from '../components/Field.js';
import { RenderedText } from '../components/RenderedText.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { sectionAnchor } from './AppOverview.js';
import { useRunAnswers } from './use-run-answers.js';
import type { OverviewLoad } from './use-run-overview.js';

// RF-1007, RF-240, RF-507: the open questions of an understand run on its live page, each with a
// field for the answer. Saving writes the answer into the project's answers.md (the other answers
// stay); a question is marked answered only when its area is analysed again with the answers
// (RF-241), so a question reads Open until a re-run used its answer, then Answered. A re-run skips
// an Answered question, so one whose answer was edited is reopened first (RF-241). Question and
// context come from a model and are shown as text. All the styles are under `.rst-p139-`.

export interface RunAnswersProps {
  /** The run's id (the UUID). */
  readonly runId: string;
  readonly ended: boolean;
  /** RF-264: the overview each question links to, when the run has one. */
  readonly overview?: OverviewLoad;
}

type Questions = readonly OpenQuestionRow[];

interface AnswerSave {
  readonly text: string;
  readonly busy: boolean;
  readonly failure: ApiFailure | undefined;
  readonly message: string;
  readonly type: (value: string) => void;
  readonly submit: () => Promise<void>;
  readonly reopen: () => Promise<void>;
}

interface QuestionRequest {
  readonly busy: boolean;
  readonly failure: ApiFailure | undefined;
  readonly message: string;
  readonly setMessage: (message: string) => void;
  /** Sends the request; the questions it answered, or undefined when it failed. */
  readonly run: (
    send: () => Promise<ApiResult<Questions>>,
    done: (questions: Questions) => string,
  ) => Promise<Questions | undefined>;
}

/** What a request about one question does with its answer: the busy mark, the failure, a message. */
function useQuestionRequest(): QuestionRequest {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | undefined>();
  const [message, setMessage] = useState('');
  const run = async (
    send: () => Promise<ApiResult<Questions>>,
    done: (questions: Questions) => string,
  ): Promise<Questions | undefined> => {
    setBusy(true);
    setFailure(undefined);
    setMessage('');
    const result = await send();
    setBusy(false);
    if (!result.ok) {
      setFailure(result.error);
      return undefined;
    }
    setMessage(done(result.value));
    return result.value;
  };
  return { busy, failure, message, setMessage, run };
}

function useAnswerSave(
  runId: string,
  question: OpenQuestionRow,
  apply: (questions: Questions) => void,
): AnswerSave {
  const { client } = useApp();
  const [text, setText] = useState(question.answer);
  const request = useQuestionRequest();
  const { cardId } = question;
  const savedOf = (questions: Questions): string =>
    questions.find((each) => each.cardId === cardId)?.answer ?? '';
  const submit = async (): Promise<void> => {
    const send = () => saveAnswer(client, runId, { cardId, answer: text });
    const saved = await request.run(send, (questions) =>
      savedOf(questions) === '' ? 'Answer cleared in answers.md.' : 'Answer saved in answers.md.',
    );
    if (saved === undefined) return;
    setText(savedOf(saved));
    apply(saved);
  };
  const reopen = async (): Promise<void> => {
    const send = () => reopenQuestion(client, runId, cardId);
    const reopened = await request.run(
      send,
      () => 'Question reopened. The next re-run with answers uses the answer.',
    );
    if (reopened !== undefined) apply(reopened);
  };
  const type = (value: string): void => {
    setText(value);
    request.setMessage('');
  };
  const { busy, failure, message } = request;
  return { text, busy, failure, message, type, submit, reopen };
}

const SAVE_HELP =
  "Saved on one line in the project's answers.md. Leave it empty to clear the answer.";
const REOPEN_HELP =
  ' This question is Answered: reopen it for the next re-run to use an edited answer.';

function ReopenButton(props: { readonly save: AnswerSave }): JSX.Element {
  const { save } = props;
  return (
    <Button
      type="button"
      variant="secondary"
      busy={save.busy}
      onClick={() => {
        void save.reopen();
      }}
    >
      Reopen question
    </Button>
  );
}

function AnswerForm(props: {
  readonly question: OpenQuestionRow;
  readonly save: AnswerSave;
}): JSX.Element {
  const { question, save } = props;
  const answered = question.state === 'Answered';
  return (
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
        help={answered ? `${SAVE_HELP}${REOPEN_HELP}` : SAVE_HELP}
        onInput={save.type}
      />
      <div class="rst-p139-question__actions">
        <Button type="submit" variant="secondary" busy={save.busy}>
          Save answer
        </Button>
        {answered ? <ReopenButton save={save} /> : null}
        <p class="rst-settings__note" role="status">
          {save.message}
        </p>
      </div>
    </form>
  );
}

/** RF-264: the overview section a question concerns, as a link to it. */
function Concerns(props: { readonly section: keyof typeof sectionTitles }): JSX.Element {
  return (
    <p class="rst-p168-concerns">
      Concerns the overview section{' '}
      <a href={`#${sectionAnchor(props.section)}`}>{sectionTitles[props.section]}</a>
    </p>
  );
}

function QuestionItem(props: {
  readonly runId: string;
  readonly question: OpenQuestionRow;
  readonly apply: (questions: Questions) => void;
  readonly section?: keyof typeof sectionTitles | undefined;
}): JSX.Element {
  const { question } = props;
  const save = useAnswerSave(props.runId, question, props.apply);
  return (
    <li class="rst-p139-question" data-testid="open-question">
      <div class="rst-p139-question__head">
        <span class="rst-mono rst-p139-question__id">{question.cardId}</span>
        <StatusBadge list="OpenQuestionState" value={question.state} />
      </div>
      <p class="rst-p139-question__text">
        <RenderedText text={question.question} />
      </p>
      {props.section === undefined ? null : <Concerns section={props.section} />}
      <p class="rst-p139-question__context">
        <RenderedText text={question.context} />
      </p>
      <AnswerForm question={question} save={save} />
    </li>
  );
}

function Body({ runId, ended, overview }: RunAnswersProps): JSX.Element {
  const links = overview?.status === 'ready' ? (overview.overview?.questions ?? []) : [];
  const { load, apply } = useRunAnswers(runId, ended);
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
        <QuestionItem
          key={question.cardId}
          runId={runId}
          question={question}
          apply={apply}
          section={links.find((link) => link.cardId === question.cardId)?.section}
        />
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
