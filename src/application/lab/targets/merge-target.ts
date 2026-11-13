import { err } from '../../../domain/errors/result.js';
import type { LabTarget } from '../lab-target.js';

// RF-1406: stub, the behaviour comes with the feature commit.

// RF-1406
export function mergeTarget(): LabTarget {
  return {
    id: 'summariser/merge',
    role: 'summariser',
    parseInput: () => err('not implemented'),
    readsAnswer: () => false,
  };
}
