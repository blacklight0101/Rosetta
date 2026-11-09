import type { JSX } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { sectionTitles } from '../api/overview.js';
import { waitsForAnswer, type OpenQuestionRow } from '../api/answers.js';
import { Button } from '../components/Button.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { RenderedText } from '../components/RenderedText.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { AnswerInput } from './AnswerChoices.js';
import { sectionAnchor } from './AppOverview.js';
import { Earlier, Reasons } from './QuestionReasons.js';
import { SaveAnswersBar } from './SaveAnswersBar.js';
import {
  CLEARED_MESSAGE,
  SAVED_MESSAGE,
  useAnswerSave,
  type AnswerSave,
} from './use-answer-save.js';
import { useFocusAfterMove } from './use-focus-after-move.js';
import { useFocusFirst, type FocusRequest } from './use-focus-first-question.js';
import { useQuestionPlaces } from './use-question-places.js';
import type { RunAnswersState } from './use-run-answers.js';
import { useSaveAnswers, type SaveAnswers } from './use-save-answers.js';
import type { OverviewLoad } from './use-run-overview.js';

// RF-1007, RF-240, RF-507: the open questions of an understand run on its live page, each with a
// field for the answer, or its suggested answers as choices plus "Type your own answer" (RF-645,
// DEC-178; a question saved before that keeps the field). One "Save answers" for the list (P8-86)
// writes the changed answers into the project's answers.md (the other answers stay); a question is marked answered only when its area is analysed again with the answers
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
  /**
   * RF-647: when set, an open question with suggested answers starts on its recommended one, and
   * each such question lists its save here so one click can save them all.
   */
  readonly accept?: AcceptRegistry;
}

/** RF-647: the save of each open question that starts on its recommended answer, by card id. */
export type AcceptRegistry = Map<string, () => Promise<boolean>>;

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

/** P8-86: the answer of one question; the list's "Save answers" saves it with the others. */
function AnswerForm(props: {
  readonly question: OpenQuestionRow;
  readonly save: AnswerSave;
  /** The message of the list's last save of this question. */
  readonly note: string | undefined;
}): JSX.Element {
  const { question, save } = props;
  const answered = question.state === 'Answered';
  return (
    <div class="rst-p139-question__form">
      {save.failure === undefined ? null : <ErrorBanner error={save.failure} />}
      <AnswerInput question={question} save={save} />
      <div class="rst-p139-question__actions">
        {answered ? <ReopenButton save={save} /> : null}
        <p class="rst-settings__note" role="status">
          {save.message === '' ? (props.note ?? '') : save.message}
        </p>
      </div>
    </div>
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

/** DEC-154: Open, Answer saved (an answer in answers.md that no run has read yet) or Answered. */
function shownState(question: OpenQuestionRow): 'Open' | 'Answer saved' | 'Answered' {
  if (question.state === 'Answered') return 'Answered';
  return waitsForAnswer(question) ? 'Open' : 'Answer saved';
}

function QuestionItem(props: {
  readonly runId: string;
  readonly question: OpenQuestionRow;
  readonly apply: (questions: Questions) => void;
  readonly section?: keyof typeof sectionTitles | undefined;
  readonly onConcern: RunAnswersProps['onConcern'];
  readonly accept: AcceptRegistry | undefined;
  /** P8-85: the message of the save that just moved the question to this list. */
  readonly moved: string | undefined;
  readonly batch: SaveAnswers;
}): JSX.Element {
  const { question, accept, batch } = props;
  const save = useAnswerSave(props.runId, question, props.apply, {
    prefill: accept !== undefined,
    message: props.moved,
    onDraft: batch.draft,
  });
  if (accept !== undefined) {
    if (waitsForAnswer(question) && question.options !== undefined) {
      accept.set(question.cardId, save.submit);
    } else {
      accept.delete(question.cardId);
    }
  }
  return (
    <li class="rst-p139-question" data-testid="open-question" data-card-id={question.cardId}>
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
      <AnswerForm question={question} save={save} note={batch.notes.get(question.cardId)} />
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
  readonly accept: AcceptRegistry | undefined;
}

interface ItemsProps extends ListProps {
  readonly shown: Questions;
  /** P8-85: the questions that just moved to this list, and the message their save showed. */
  readonly moved: ReadonlySet<string>;
  readonly movedMessage: string;
  readonly batch: SaveAnswers;
}

function Items(props: ItemsProps): JSX.Element {
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
          accept={props.accept}
          moved={props.moved.has(question.cardId) ? props.movedMessage : undefined}
          batch={props.batch}
        />
      ))}
    </ol>
  );
}

/**
 * RF-646, RF-1007, DEC-179, P8-85: the questions that wait for an answer first; the ones with an
 * answer in a collapsed "Answered" list whose questions can be edited like the others, each list in
 * id order. One list for the project.
 */
function QuestionLists(props: ListProps): JSX.Element {
  const [note, setNote] = useState('');
  const { open, answered, moved } = useQuestionPlaces(props.questions);
  const afterSave = useRef(false);
  useFocusAfterMove(moved, open, answered, afterSave);
  const apply = (questions: Questions): void => {
    props.apply(questions);
    const left = questions.filter(waitsForAnswer).length;
    setNote(
      `Saved. ${String(left)} ${left === 1 ? 'question waits' : 'questions wait'} for an answer.`,
    );
  };
  const batch = useSaveAnswers(props.runId, props.questions, {
    saved: (questions) => {
      afterSave.current = true;
      apply(questions);
    },
    say: setNote,
  });
  const shared = { ...props, apply, moved, batch };
  const offerAccept =
    props.accept === undefined &&
    open.some((question) => waitsForAnswer(question) && question.options !== undefined);
  return (
    <>
      <p class="rst-settings__note" role="status" data-testid="answers-status">
        {note}
      </p>
      {props.questions.some(waitsForAnswer) ? null : (
        <p class="rst-settings__note" data-testid="no-open-questions">
          No question waits for an answer.
        </p>
      )}
      {open.length === 0 ? null : <Items {...shared} shown={open} movedMessage={CLEARED_MESSAGE} />}
      <SaveAnswersBar batch={batch} offerAccept={offerAccept} main={props.accept === undefined} />
      {answered.length === 0 ? null : (
        <details class="rst-p139-answered" data-testid="answered-questions">
          <summary>{`Answered (${String(answered.length)})`}</summary>
          <Items {...shared} shown={answered} movedMessage={SAVED_MESSAGE} />
        </details>
      )}
    </>
  );
}

function Body({ runId, answers, overview, onConcern, accept }: RunAnswersProps): JSX.Element {
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
  return (
    <QuestionLists {...{ runId, apply, links, onConcern, accept }} questions={load.questions} />
  );
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
