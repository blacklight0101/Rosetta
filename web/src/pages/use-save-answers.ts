import { useState } from 'preact/hooks';
import {
  MAX_ANSWERS_PER_SAVE,
  saveAnswers,
  waitsForAnswer,
  type AnswerEntry,
  type OpenQuestionRow,
} from '../api/answers.js';
import type { ApiClient, ApiFailure } from '../api/client.js';
import { useApp } from '../app/app-context.js';
import { CLEARED_MESSAGE, SAVED_MESSAGE, recommendedEntry } from './use-answer-save.js';

// RF-1007, RF-647 (P8-86, UX-24): the one "Save answers (N)" of the Your questions list and its
// "Accept the recommended answers". Each question tells the list what it would save when its answer
// changes; N counts the ones that differ from what answers.md holds. Save answers writes them in one
// request; Accept writes, in the same request, each question that waits with suggested answers on its
// recommended option (or on the answer chosen for it), as Plan setup does. The route takes at most
// MAX_ANSWERS_PER_SAVE answers, so a longer list is sent in parts.

type Questions = readonly OpenQuestionRow[];

export interface SaveAnswers {
  /** How many answers differ from the ones saved. */
  readonly count: number;
  readonly busy: boolean;
  readonly failure: ApiFailure | undefined;
  /** The message of the last save for each question it wrote, by card id. */
  readonly notes: ReadonlyMap<string, string>;
  /** Called by a question each time its answer is changed. */
  readonly draft: (entry: AnswerEntry) => void;
  readonly save: () => Promise<void>;
  readonly accept: () => Promise<void>;
}

interface SaveAnswersOptions {
  /** Shows the questions a save returned. */
  readonly saved: (questions: Questions) => void;
  /** Says something in the status line of the list. */
  readonly say: (note: string) => void;
}

const byId = (a: AnswerEntry, b: AnswerEntry): number =>
  a.cardId.localeCompare(b.cardId, 'en', { numeric: true });

/** The changed answers that differ from what each question holds now. */
function pendingOf(drafts: ReadonlyMap<string, AnswerEntry>, questions: Questions): AnswerEntry[] {
  return questions.flatMap((question) => {
    const entry = drafts.get(question.cardId);
    return entry === undefined || entry.answer === question.answer ? [] : [entry];
  });
}

/** RF-647: the pending answers, and the recommended one of each question with options that waits. */
function acceptedOf(pending: readonly AnswerEntry[], questions: Questions): AnswerEntry[] {
  const own = new Map(pending.map((entry) => [entry.cardId, entry]));
  const filled = questions.flatMap((question) => {
    const chosen = own.get(question.cardId);
    if (chosen !== undefined && chosen.answer.trim() !== '') return [];
    if (!waitsForAnswer(question) || question.options === undefined) return [];
    own.delete(question.cardId);
    const entry = recommendedEntry(question);
    return entry === undefined ? [] : [entry];
  });
  return [...own.values(), ...filled];
}

function notesOf(sent: readonly AnswerEntry[], questions: Questions): Map<string, string> {
  const answerOf = (cardId: string): string =>
    questions.find((question) => question.cardId === cardId)?.answer ?? '';
  return new Map(
    sent.map((entry) => [
      entry.cardId,
      answerOf(entry.cardId) === '' ? CLEARED_MESSAGE : SAVED_MESSAGE,
    ]),
  );
}

function withoutIds<T>(
  map: ReadonlyMap<string, T>,
  entries: readonly AnswerEntry[],
): ReadonlyMap<string, T> {
  const next = new Map(map);
  for (const entry of entries) next.delete(entry.cardId);
  return next;
}

interface Written {
  /** The answers the server took. */
  readonly sent: readonly AnswerEntry[];
  /** The questions as the last request that went through answered them. */
  readonly questions: Questions;
  readonly failure: ApiFailure | undefined;
}

/** Sends the answers in id order, in parts the route takes; stops at the first part refused. */
async function writeAll(
  client: ApiClient,
  runId: string,
  entries: readonly AnswerEntry[],
  questions: Questions,
): Promise<Written> {
  const sorted = [...entries].sort(byId);
  const sent: AnswerEntry[] = [];
  let written = questions;
  for (let from = 0; from < sorted.length; from += MAX_ANSWERS_PER_SAVE) {
    const part = sorted.slice(from, from + MAX_ANSWERS_PER_SAVE);
    const result = await saveAnswers(client, runId, part);
    if (!result.ok) return { sent, questions: written, failure: result.error };
    sent.push(...part);
    written = result.value;
  }
  return { sent, questions: written, failure: undefined };
}

// RF-1007
export function useSaveAnswers(
  runId: string,
  questions: Questions,
  options: SaveAnswersOptions,
): SaveAnswers {
  const { client } = useApp();
  const [drafts, setDrafts] = useState<ReadonlyMap<string, AnswerEntry>>(new Map());
  const [notes, setNotes] = useState<ReadonlyMap<string, string>>(new Map());
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | undefined>();
  const pending = pendingOf(drafts, questions);
  const send = async (entries: readonly AnswerEntry[]): Promise<void> => {
    if (entries.length === 0) {
      options.say('No answer has changed.');
      return;
    }
    setBusy(true);
    setFailure(undefined);
    const written = await writeAll(client, runId, entries, questions);
    setBusy(false);
    setFailure(written.failure);
    if (written.sent.length === 0) return;
    setDrafts((current) => withoutIds(current, written.sent));
    setNotes(notesOf(written.sent, written.questions));
    options.saved(written.questions);
  };
  const draft = (entry: AnswerEntry): void => {
    setDrafts((current) => new Map(current).set(entry.cardId, entry));
    setNotes((current) => withoutIds(current, [entry]));
  };
  const { length: count } = pending;
  return {
    count,
    busy,
    failure,
    notes,
    draft,
    save: () => send(pending),
    accept: () => send(acceptedOf(pending, questions)),
  };
}
