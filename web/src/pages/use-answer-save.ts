import { useState } from 'preact/hooks';
import { reopenQuestion, saveAnswer, type OpenQuestionRow } from '../api/answers.js';
import type { ApiFailure, ApiResult } from '../api/client.js';
import { useApp } from '../app/app-context.js';

// RF-1007, RF-241: what saving, clearing or reopening the answer of one question does: the busy
// mark, the failure, the message and the questions the server answered with.

type Questions = readonly OpenQuestionRow[];

/** RF-645: the option chosen (from 1), `typed` for the user's own answer, `''` for none yet. */
export type Choice = '' | 'typed' | number;

export interface AnswerSave {
  readonly text: string;
  readonly choice: Choice;
  readonly choose: (choice: Choice) => void;
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

/** RF-645: the choice a saved question shows; an answer saved with no choice on record is typed. */
function choiceOf(question: OpenQuestionRow): Choice {
  const number = Number(question.chosen);
  if (Number.isInteger(number) && number >= 1) return number;
  return question.chosen === 'typed' || question.answer !== '' ? 'typed' : '';
}

/** RF-645: what a save sends: a chosen option writes its own answer, a typed one the text. */
function entryOf(question: OpenQuestionRow, choice: Choice, text: string) {
  const { cardId } = question;
  if (question.options === undefined) return { cardId, answer: text };
  if (typeof choice === 'number') {
    return { cardId, answer: question.options[choice - 1]?.answer ?? '', chosen: choice };
  }
  return choice === 'typed'
    ? { cardId, answer: text, chosen: 'typed' as const }
    : { cardId, answer: '' };
}

export function useAnswerSave(
  runId: string,
  question: OpenQuestionRow,
  apply: (questions: Questions) => void,
): AnswerSave {
  const { client } = useApp();
  const [text, setText] = useState(question.answer);
  const [choice, setChoice] = useState<Choice>(() => choiceOf(question));
  const request = useQuestionRequest();
  const { cardId } = question;
  const savedOf = (questions: Questions): string =>
    questions.find((each) => each.cardId === cardId)?.answer ?? '';
  const submit = async (): Promise<void> => {
    const send = () => saveAnswer(client, runId, entryOf(question, choice, text));
    const saved = await request.run(send, (questions) =>
      savedOf(questions) === '' ? 'Answer cleared in answers.md.' : 'Answer saved in answers.md.',
    );
    if (saved === undefined) return;
    setText(savedOf(saved));
    const row = saved.find((each) => each.cardId === cardId);
    if (row !== undefined) setChoice(choiceOf(row));
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
  const choose = (value: Choice): void => {
    setChoice(value);
    request.setMessage('');
  };
  return { text, choice, choose, busy, failure, message, type, submit, reopen };
}
