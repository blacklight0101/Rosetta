import { err } from '../../../domain/errors/result.js';
import type { LabTarget } from '../lab-target.js';

// RF-1406: stub, the behaviour comes with the feature commit.

// RF-1406
export function gapTarget(): LabTarget {
  return {
    id: 'planner/gap',
    role: 'planner',
    parseInput: () => err('not implemented'),
    readsAnswer: () => false,
  };
}
