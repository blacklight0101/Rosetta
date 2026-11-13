import type { ReaderPrompts } from '../../agent/reader-prompts.js';
import { err } from '../../../domain/errors/result.js';
import type { LabTarget } from '../lab-target.js';

// RF-1406: the target of the reader's repair request; not written yet.

// RF-1406
export function cardsRepairTarget(current: ReaderPrompts): LabTarget {
  return {
    id: 'cards/repair',
    role: 'reader',
    parseInput: () => err('not written yet'),
    readsAnswer: (text) => text === current.repair.text,
  };
}
