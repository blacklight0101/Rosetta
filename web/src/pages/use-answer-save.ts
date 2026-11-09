import { useState } from 'preact/hooks';
import {
  reopenQuestion,
  saveAnswer,
  type AnswerEntry,
  type OpenQuestionRow,
} from '../api/answers.js';
import type { ApiFailure, ApiResult } from '../api/client.js';
import { useApp } from '../app/app-context.js';

// RF-1007, RF-241: what saving, clearing or reopening the answer of one question does: the busy
// mark, the failure, the message and the questions the server answered with.

type Questions = readonly OpenQuestionRow[];

/** RF-645: the option chosen (from 1), `typed` for the user's own answer, `''` for none yet. */
type Choice = '' | 'typed' | number;

export interface AnswerSave {
  readonly text: string;
  readonly choice: Choice;
  readonly choose: (choice: Choice) => void;
  readonly busy: boolean;
  readonly failure: ApiFailure | undefined;
  readonly message: string;
  readonly type: (value: string) => void;
  /** Saves the answer; true when the server took it. */
  readonly submit: () => Promise<boolean>;
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
function useQuestionRequest(first: string): QuestionRequest {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | undefined>();
  const [message, setMessage] = useState(first);
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

/** RF-645: the choice a saved question shows; an answer saved with no choice on record is typed. */
function choiceOf(question: OpenQuestionRow): Choice {
  const number = Number(question.chosen);
  if (Number.isInteger(number) && number >= 1) return number;
  return question.chosen === 'typed' || question.answer !== '' ? 'typed' : '';
}

/** RF-647: the recommended option of a question nobody answered yet, as the choice it starts on. */
function recommendedChoice(question: OpenQuestionRow): Choice {
  const index = question.options?.findIndex((option) => option.recommended) ?? -1;
  return index < 0 ? '' : index + 1;
}

/** RF-645: what a save sends: a chosen option writes its own answer, a typed one the text. */
function entryOf(question: OpenQuestionRow, choice: Choice, text: string): AnswerEntry {
  const { cardId } = question;
  if (question.options === undefined) return { cardId, answer: text };
  if (typeof choice === 'number') {
    return { cardId, answer: question.options[choice - 1]?.answer ?? '', chosen: choice };
  }
  return choice === 'typed'
    ? { cardId, answer: text, chosen: 'typed' as const }
    : { cardId, answer: '' };
}

/** RF-647 (P8-86): the answer "Accept the recommended answers" saves for a question that waits. */
export function recommendedEntry(question: OpenQuestionRow): AnswerEntry | undefined {
  const choice = recommendedChoice(question);
  return choice === '' ? undefined : entryOf(question, choice, '');
}

/** The messages of a save that kept an answer and of one that cleared it. */
export const SAVED_MESSAGE = 'Answer saved in answers.md.';
export const CLEARED_MESSAGE = 'Answer cleared in answers.md.';

interface AnswerSaveOptions {
  /** RF-647: an open question with no answer starts on its recommended option. */
  readonly prefill?: boolean;
  /** P8-85: the message a question shows when it is drawn, after its save moved it to another list. */
  readonly message?: string | undefined;
  /** P8-86: told what the question would save each time its answer is changed. */
  readonly onDraft?: ((entry: AnswerEntry) => void) | undefined;
}

export function useAnswerSave(
  runId: string,
  question: OpenQuestionRow,
  apply: (questions: Questions) => void,
  options: AnswerSaveOptions = {},
): AnswerSave {
  const { prefill = false, message: first = '', onDraft } = options;
  const { client } = useApp();
  const [text, setText] = useState(question.answer);
  const [choice, setChoice] = useState<Choice>(() => {
    const own = choiceOf(question);
    return own === '' && prefill && question.state === 'Open' ? recommendedChoice(question) : own;
  });
  const request = useQuestionRequest(first);
  const { cardId } = question;
  const savedOf = (questions: Questions): string =>
    questions.find((each) => each.cardId === cardId)?.answer ?? '';
  const submit = async (): Promise<boolean> => {
    const send = () => saveAnswer(client, runId, entryOf(question, choice, text));
    const saved = await request.run(send, (questions) =>
      savedOf(questions) === '' ? CLEARED_MESSAGE : SAVED_MESSAGE,
    );
    if (saved === undefined) return false;
    setText(savedOf(saved));
    const row = saved.find((each) => each.cardId === cardId);
    if (row !== undefined) setChoice(choiceOf(row));
    apply(saved);
    return true;
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
    onDraft?.(entryOf(question, choice, value));
  };
  const { busy, failure, message } = request;
  const choose = (value: Choice): void => {
    setChoice(value);
    request.setMessage('');
    onDraft?.(entryOf(question, value, text));
  };
  return { text, choice, choose, busy, failure, message, type, submit, reopen };
}
