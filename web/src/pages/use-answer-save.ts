import { useState } from 'preact/hooks';
import { reopenQuestion, saveAnswer, type OpenQuestionRow } from '../api/answers.js';
import type { ApiFailure, ApiResult } from '../api/client.js';
import { useApp } from '../app/app-context.js';

// RF-1007, RF-241: what saving, clearing or reopening the answer of one question does: the busy
// mark, the failure, the message and the questions the server answered with.

type Questions = readonly OpenQuestionRow[];

export interface AnswerSave {
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

export function useAnswerSave(
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
