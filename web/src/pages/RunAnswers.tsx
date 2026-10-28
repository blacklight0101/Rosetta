import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { sectionTitles } from '../api/overview.js';
import { waitsForAnswer, type OpenQuestionRow } from '../api/answers.js';
import { Button } from '../components/Button.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { RenderedText } from '../components/RenderedText.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { AnswerInput } from './AnswerChoices.js';
import { sectionAnchor } from './AppOverview.js';
import { useAnswerSave, type AnswerSave } from './use-answer-save.js';
import { useFocusFirst, type FocusRequest } from './use-focus-first-question.js';
import type { RunAnswersState } from './use-run-answers.js';
import type { OverviewLoad } from './use-run-overview.js';

// RF-1007, RF-240, RF-507: the open questions of an understand run on its live page, each with a
// field for the answer, or its suggested answers as choices plus "Type your own answer" (RF-645,
// DEC-178; a question saved before that keeps the field). Saving writes the answer into the project's answers.md (the other answers
// stay); a question is marked answered only when its area is analysed again with the answers
// (RF-241), so a saved answer reads "Answer saved" (not open, DEC-154) until a re-run used it, then Answered. A re-run skips
// an Answered question, so one whose answer was edited is reopened first (RF-241). Question and
// context come from a model and are shown as text. Each question also says how many items depend on
// it and what happens if it is skipped (RF-1017). The page of the ended run reads the questions (it
// counts them in "Your turn") and hands them over. The styles are under `.rst-p139-` and `.rst-p170-`.

export interface RunAnswersProps {
  /** The run's id (the UUID). */
  readonly runId: string;
  /** The questions of the run and the way to show the ones a save returned. */
  readonly answers: RunAnswersState;
  /**
   * DEC-154: when `wanted`, the first question without a saved answer is scrolled into view and
   * focused as soon as the questions are shown, and `done` is called.
   */
  readonly focus?: FocusRequest;
  /** RF-264: the overview each question links to, when the run has one. */
  readonly overview?: OverviewLoad;
  /** Called when the link to the overview section a question concerns is followed. */
  readonly onConcern?: (section: keyof typeof sectionTitles) => void;
}

type Questions = readonly OpenQuestionRow[];

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
      <AnswerInput question={question} save={save} />
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
function Concerns(props: {
  readonly section: keyof typeof sectionTitles;
  readonly onConcern: ((section: keyof typeof sectionTitles) => void) | undefined;
}): JSX.Element {
  return (
    <p class="rst-p168-concerns">
      Concerns the overview section{' '}
      <a
        href={`#${sectionAnchor(props.section)}`}
        onClick={(event) => {
          if (props.onConcern === undefined) return;
          event.preventDefault();
          props.onConcern(props.section);
        }}
      >
        {sectionTitles[props.section]}
      </a>
    </p>
  );
}

// RF-1017
function dependsText(dependents: number): string {
  if (dependents === 0) return 'No other item depends on it.';
  return `Affects ${String(dependents)} ${dependents === 1 ? 'item' : 'items'} of the specification.`;
}

/** RF-1017: where the question comes from, what hangs on it and what a skipped question does. */
function Reasons({ question }: { readonly question: OpenQuestionRow }): JSX.Element {
  return (
    <>
      <p class="rst-p139-question__context" data-testid="question-why">
        <span class="rst-p170-label">Why the code cannot say:</span>{' '}
        <RenderedText text={question.context} />
      </p>
      <p class="rst-p139-question__context" data-testid="question-depends">
        {dependsText(question.dependents)}
      </p>
      <p class="rst-p139-question__context" data-testid="question-default">
        If you skip it: the question stays open in answers.md and the next run does not use it.
      </p>
    </>
  );
}

/** DEC-154: Open, Answer saved (an answer in answers.md that no run has read yet) or Answered. */
function shownState(question: OpenQuestionRow): 'Open' | 'Answer saved' | 'Answered' {
  if (question.state === 'Answered') return 'Answered';
  return waitsForAnswer(question) ? 'Open' : 'Answer saved';
}

/** RF-646: a question raised in several runs says so; the older answers it replaced are kept and shown. */
function Earlier({ question }: { readonly question: OpenQuestionRow }): JSX.Element | null {
  const runs = question.runs?.length ?? 0;
  const history = question.history ?? [];
  if (runs < 2 && history.length === 0) return null;
  return (
    <div class="rst-p139-question__context" data-testid="question-earlier">
      {runs < 2 ? null : (
        <p>{`Asked in ${String(runs)} runs of this project; it is listed once.`}</p>
      )}
      {history.length === 0 ? null : (
        <>
          <p>Earlier answers, kept in answers.md:</p>
          <ul>
            {history.map((each) => (
              <li
                key={`${each.runKey}
${each.answer}`}
              >
                <RenderedText text={each.answer} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function QuestionItem(props: {
  readonly runId: string;
  readonly question: OpenQuestionRow;
  readonly apply: (questions: Questions) => void;
  readonly section?: keyof typeof sectionTitles | undefined;
  readonly onConcern: RunAnswersProps['onConcern'];
}): JSX.Element {
  const { question } = props;
  const save = useAnswerSave(props.runId, question, props.apply);
  return (
    <li class="rst-p139-question" data-testid="open-question">
      <div class="rst-p139-question__head">
        <span class="rst-mono rst-p139-question__id">{question.cardId}</span>
        <StatusBadge list="QuestionShown" value={shownState(question)} />
      </div>
      <p class="rst-p139-question__text">
        <RenderedText text={question.question} />
      </p>
      {props.section === undefined ? null : (
        <Concerns section={props.section} onConcern={props.onConcern} />
      )}
      <Reasons question={question} />
      <Earlier question={question} />
      <AnswerForm question={question} save={save} />
    </li>
  );
}

interface ListProps {
  readonly runId: string;
  readonly questions: Questions;
  readonly apply: (questions: Questions) => void;
  readonly links: readonly {
    readonly cardId: string;
    readonly section: keyof typeof sectionTitles;
  }[];
  readonly onConcern: RunAnswersProps['onConcern'];
}

function Items(props: ListProps & { readonly shown: Questions }): JSX.Element {
  return (
    <ol class="rst-p139-answers__list">
      {props.shown.map((question) => (
        <QuestionItem
          key={question.cardId}
          runId={props.runId}
          question={question}
          apply={props.apply}
          section={props.links.find((link) => link.cardId === question.cardId)?.section}
          onConcern={props.onConcern}
        />
      ))}
    </ol>
  );
}

/**
 * RF-646, RF-1007, DEC-179: the open questions first; the ones with an answer in a collapsed
 * "Answered" list whose questions can be edited like the others. One list for the project.
 */
function QuestionLists(props: ListProps): JSX.Element {
  const [note, setNote] = useState('');
  const open = props.questions.filter(waitsForAnswer);
  const answered = props.questions.filter((question) => !waitsForAnswer(question));
  const apply = (questions: Questions): void => {
    props.apply(questions);
    const left = questions.filter(waitsForAnswer).length;
    setNote(
      `Saved. ${String(left)} ${left === 1 ? 'question waits' : 'questions wait'} for an answer.`,
    );
  };
  return (
    <>
      <p class="rst-settings__note" role="status" data-testid="answers-status">
        {note}
      </p>
      {open.length === 0 ? (
        <p class="rst-settings__note" data-testid="no-open-questions">
          No question waits for an answer.
        </p>
      ) : (
        <Items {...props} apply={apply} shown={open} />
      )}
      {answered.length === 0 ? null : (
        <details class="rst-p139-answered" data-testid="answered-questions">
          <summary>{`Answered (${String(answered.length)})`}</summary>
          <Items {...props} apply={apply} shown={answered} />
        </details>
      )}
    </>
  );
}

function Body({ runId, answers, overview, onConcern }: RunAnswersProps): JSX.Element {
  const links = overview?.status === 'ready' ? (overview.overview?.questions ?? []) : [];
  const { load, apply } = answers;
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
  return <QuestionLists {...{ runId, apply, links, onConcern }} questions={load.questions} />;
}

// RF-1007
export function RunAnswers(props: RunAnswersProps): JSX.Element {
  useFocusFirst(props.answers.load, props.focus);
  return (
    <section class="rst-card rst-p139-answers" aria-label="Open questions">
      <h2 class="rst-live-section__title">Open questions</h2>
      <Body {...props} />
    </section>
  );
}
