import type { AnswerNote } from './answer-note.js';
import { hasRoomForAnother } from './context-room.js';
import type { ReadGate } from './read-gate.js';
import { readFirstMessage, readMoreMessage, type ReaderPrompts } from './reader-prompts.js';

// RF-206, Q-50, Q-55: whether a reader's final answer is refused, and what it is told. An answer
// before any read is refused (RF-206). An answer after less than half of the area was read is
// refused once (Q-50), but only while the conversation has room for another read and a new answer;
// without room it is accepted as it is (Q-55).

export interface Refusal {
  readonly message: string;
  /** `not-read` (RF-206) or `read-little` (Q-50). */
  readonly reason: string;
}

export interface RefusalInput {
  readonly gate: ReadGate;
  readonly prompts: ReaderPrompts;
  /** Renders a list of files as a data block. */
  readonly block: (files: string) => string;
  readonly answer: string;
  readonly turnsLeft: number;
  /** Tokens of the context share still free (RF-201). */
  readonly freeContext: number;
  readonly note: (note: AnswerNote) => Promise<void>;
}

export async function refusalFor(input: RefusalInput): Promise<Refusal | undefined> {
  const { gate, prompts, block, turnsLeft } = input;
  const unread = gate.refuse(turnsLeft);
  if (unread !== undefined) {
    return { message: readFirstMessage(prompts, block(unread), turnsLeft), reason: 'not-read' };
  }
  const more = gate.readMore(turnsLeft);
  if (more === undefined) return undefined;
  if (!hasRoomForAnother(input.freeContext, input.answer)) {
    await input.note({ outcome: 'accepted', reason: 'no-room' });
    return undefined;
  }
  gate.askedToReadMore();
  const message = readMoreMessage(prompts, {
    ...more,
    filesBlock: block(more.files),
    turns: turnsLeft,
  });
  return { message, reason: 'read-little' };
}
