import { useState } from 'preact/hooks';
import type { FileState } from './workbook-batch.js';

// RF-150: where each file of the Excel workbooks form is: its state and how much of it has gone.

export interface Where {
  readonly states: readonly FileState[];
  readonly percents: readonly number[];
}

const replaceAt = <T>(list: readonly T[], index: number, value: T): T[] =>
  list.map((item, at) => (at === index ? value : item));

const all = <T>(count: number, value: T): T[] => Array.from({ length: count }, () => value);

export interface Placement {
  readonly where: Where;
  /** Every file is at Waiting, with nothing sent. */
  readonly place: (count: number) => void;
  readonly mark: (index: number, state: FileState) => void;
  readonly percent: (index: number, percent: number) => void;
  /** After a failure, a file that was never reached reads Not sent. */
  readonly settle: () => void;
}

/** Where each file is: its state and how much of it has gone. */
export function usePlacement(): Placement {
  const [where, setWhere] = useState<Where>({ states: [], percents: [] });
  return {
    where,
    place: (count) => {
      setWhere({ states: all(count, 'waiting'), percents: all(count, 0) });
    },
    mark: (index, state) => {
      setWhere((now) => ({ ...now, states: replaceAt(now.states, index, state) }));
    },
    percent: (index, percent) => {
      setWhere((now) => ({ ...now, percents: replaceAt(now.percents, index, percent) }));
    },
    settle: () => {
      setWhere((now) => ({
        ...now,
        states: now.states.map((state) => (state === 'waiting' ? 'unsent' : state)),
      }));
    },
  };
}
