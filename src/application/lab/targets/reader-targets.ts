/* eslint-disable @typescript-eslint/no-unused-vars -- stub of the test commit (DEC-191) */
import { err } from '../../../domain/errors/result.js';
import type { ReaderPrompts } from '../../agent/reader-prompts.js';
import type { LabTarget } from '../lab-target.js';

// RF-1406: stub, the behaviour comes with the feature commit.

// RF-1406
export function readerTargets(_current: ReaderPrompts): LabTarget[] {
  return ['reader/task', 'reader/area', 'reader/read-first', 'cards/card-format'].map((id) => ({
    id,
    role: 'reader',
    parseInput: () => err('not implemented'),
    readsAnswer: () => false,
  }));
}
