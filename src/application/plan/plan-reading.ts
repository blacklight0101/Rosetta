import type { z } from 'zod';
import type { PlanDraft, UnreadableItem } from '../../domain/planning/plan-draft.js';

// P3-126, RF-601, ADR-013: how the lists of the planner's answer are read item by item. An item that
// does not read is left out and named by its list, position and field; the reason is a fixed phrase
// of this program, never a word of the answer.

export interface Kept<T> {
  readonly items: T[];
  /** The new position (from 1) of an old one; undefined when that item was left out. */
  readonly at: (position: number) => number | undefined;
}

const ITEM_REASON =
  'The item is not readable: a field is missing, of the wrong shape or out of its bounds.';

/** The items of one list that read, in order, and by position and field the ones that did not. */
export function readItems<T>(
  list: string,
  schema: z.ZodType<T>,
  raw: readonly unknown[],
  lost: UnreadableItem[],
): Kept<T> {
  const items: T[] = [];
  const moved = new Map<number, number>();
  raw.forEach((each, index) => {
    const read = schema.safeParse(each);
    if (read.success) {
      items.push(read.data);
      moved.set(index + 1, items.length);
      return;
    }
    const first = read.error.issues[0]?.path[0];
    const field = typeof first === 'string' ? first : 'item';
    lost.push({ list, position: index + 1, field, reason: ITEM_REASON });
  });
  const removed = raw.length - items.length;
  // A position past the list stays past it, so the notes about positions outside it still hold.
  const at = (position: number): number | undefined => {
    if (removed === 0) return position;
    return position > raw.length ? position - removed : moved.get(position);
  };
  return { items, at };
}

export interface PlanProblem {
  /** The list, for example `technical.security`, or `answer` for an answer with no JSON object. */
  readonly list: string;
  /** The item's position in the list, from 1; none for a fault of the whole list. */
  readonly position?: number;
  readonly field: string;
}

export interface PlanReading {
  /** Undefined when the answer is refused. */
  readonly draft?: PlanDraft;
  /** Why it is refused: the failing paths, by list, position and field. */
  readonly problems: readonly PlanProblem[];
}

export const noObject: PlanProblem[] = [{ list: 'answer', field: 'answer' }];

/** The paths that kept the lists of the answer from reading as lists. */
export function shapeProblems(error: z.ZodError): PlanProblem[] {
  const named = error.issues.map((issue): PlanProblem => {
    const path = issue.path.filter((each): each is string => typeof each === 'string');
    return { list: path.join('.') || 'answer', field: path.at(-1) ?? 'answer' };
  });
  return named.filter((each, index) => named.findIndex((o) => o.list === each.list) === index);
}
