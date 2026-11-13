import { readDataBlocks, type ReadDataBlock } from './data-blocks.js';
import type { TranscriptTask } from './capture-types.js';

// RF-1404, RF-1406: the inputs of the reader's other prompt files, from the task of a reader agent:
// the owner's answers, the rejected claims and the parent's cards, read back from the data blocks of
// the first user message; the numbers and unread files of the refusal after a short read, which the
// run wrote from its own counts; and the last turn for the turns-left message. A model's tool calls
// and answers are never read.

/** The prompts of the parts of the first message, the turns of the loop and the workbook guidance. */
export const readerPartIds: readonly string[] = [
  'reader/answers',
  'reader/parent-cards',
  'reader/read-more',
  'reader/reread',
  'reader/turns-left',
  'reader/workbook',
];

const MAX_ANSWERS = 4;
const MAX_REJECTED = 4;
const MAX_PARENT_CARDS = 30;
const MAX_UNREAD = 20;
const MAX_TURNS = 100;
const MAX_PART_CHARS = 8000;
/** The turns-left message decides on the last turn, so its case has one turn left. */
const LAST_TURN_CASE = 2;

/** The common part of a case and the reads of the task, which the replaying cases need. */
export interface PartContext {
  readonly base: object;
  readonly workbook: boolean;
  readonly reads: readonly object[];
}

function firstBlocks(task: TranscriptTask): ReadDataBlock[] {
  const first = task.messages.find((message) => message.role === 'user');
  return first === undefined ? [] : readDataBlocks(first.content);
}

function listOf(text: string, key: string): unknown[] | undefined {
  try {
    const value: unknown = JSON.parse(text);
    const list: unknown =
      typeof value === 'object' && value !== null ? Reflect.get(value, key) : null;
    return Array.isArray(list) ? (list as unknown[]) : undefined;
  } catch {
    return undefined;
  }
}

/** The first entries of the list a cards block holds under the key, written as the run writes it. */
function listText(task: TranscriptTask, key: string, max: number): string | undefined {
  for (const block of firstBlocks(task).filter((each) => each.source === 'cards')) {
    const list = listOf(block.text, key);
    if (list === undefined) continue;
    const text = JSON.stringify({ [key]: list.slice(0, max) }, null, 2);
    return text.length > MAX_PART_CHARS ? undefined : text;
  }
  return undefined;
}

function answersText(task: TranscriptTask): string | undefined {
  const block = firstBlocks(task).find((each) => each.source === 'owner_answers');
  const entries = (block?.text ?? '').split('\n\n').filter((each) => each.trim() !== '');
  return entries.length === 0 ? undefined : entries.slice(0, MAX_ANSWERS).join('\n\n');
}

const shortRead =
  /^You gave your final answer, but you have read only (\d+)% of the code of your area \((\d+) of (\d+)\s+tokens\)/u;

/** The unread files the refusal lists, a data block of paths. */
function unreadOf(content: string): string[] {
  const files = readDataBlocks(content).find((block) => block.source === 'list_area_files');
  return (files?.text ?? '').split('\n').filter((line) => line.trim() !== '');
}

/** The numbers, the unread files and the turns left of the first refusal after a short read. */
function readMoreOf(task: TranscriptTask): object | undefined {
  const content = task.messages.find(
    (each) => each.role === 'user' && shortRead.test(each.content),
  )?.content;
  const [, percent, readTokens, tokens] = shortRead.exec(content ?? '') ?? [];
  const left = /Turns left: (\d+)/u.exec(content ?? '')?.[1];
  const unread = unreadOf(content ?? '');
  if (left === undefined || percent === undefined || unread.length === 0) return undefined;
  const readMore = { percent: Number(percent), readTokens: Number(readTokens) };
  return {
    turns: Math.min(MAX_TURNS, Number(left) + 1),
    readMore: { ...readMore, tokens: Number(tokens), unread: unread.slice(0, MAX_UNREAD) },
  };
}

function withPart(context: PartContext, key: string, text: string | undefined): object | undefined {
  return text === undefined ? undefined : { ...context.base, [key]: text };
}

// RF-1404, RF-1406
export function capturePartInput(
  promptId: string,
  task: TranscriptTask,
  context: PartContext,
): object | undefined {
  switch (promptId) {
    case 'reader/answers':
      return withPart(context, 'answers', answersText(task));
    case 'reader/reread':
      return withPart(context, 'rejected', listText(task, 'rejected', MAX_REJECTED));
    case 'reader/parent-cards':
      return withPart(context, 'parentCards', listText(task, 'cards', MAX_PARENT_CARDS));
  }
  if (context.reads.length === 0) return undefined;
  const replaying = { ...context.base, reads: context.reads };
  switch (promptId) {
    case 'reader/turns-left':
      return { ...replaying, turns: LAST_TURN_CASE };
    case 'reader/read-more': {
      const refusal = readMoreOf(task);
      return refusal === undefined ? undefined : { ...replaying, ...refusal };
    }
    default:
      return context.workbook ? replaying : undefined;
  }
}
