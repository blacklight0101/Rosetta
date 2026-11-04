import { describe, expect, it } from 'vitest';
import { runKindText } from '../../../web/src/lib/run-kind.js';

// RF-1008, P8-89: the kind of a run as the History artboard words it.

describe('runKindText', () => {
  it.each([
    ['scan', null, 'Scan'],
    ['understand', null, 'Understand'],
    ['plan', null, 'Plan'],
    ['understand', 0, 'Deepen'],
    ['understand', 1, 'Deepen, 1 round'],
    ['understand', 3, 'Deepen, 3 rounds'],
  ])('RF-1008 P8-89 names a %s run with %s rounds "%s"', (stage, rounds, expected) => {
    expect(runKindText(stage, rounds)).toBe(expected);
  });
});
