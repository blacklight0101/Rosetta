import { describe, expect, it } from 'vitest';
import { runningTimeText, wallTimeNote } from '../../../web/src/lib/run-times.js';

// RF-1008, P8-88: the running time of a run is the sum of its active spans; the wall time, from its
// first start to its end, follows it only when the run was stopped or paused for a while.

describe('runningTimeText', () => {
  it.each([
    [null, '–'],
    [8_000, '8 s'],
    [120_000, '2 min'],
    [3_960_000, '66 min'],
    [7_800_000, '2 h 10 min'],
    [6_000_000, '100 min'],
  ] as const)('RF-1008 reads %s ms as "%s"', (ms, text) => {
    expect(runningTimeText(ms)).toBe(text);
  });
});

describe('wallTimeNote', () => {
  it('RF-1008 names the wall time of a run that waited, after its running time', () => {
    expect(wallTimeNote(3_960_000, 7_800_000)).toBe('(over 2 h 10 min)');
  });

  it.each([
    [3_960_000, 4_019_999],
    [3_960_000, 3_960_000],
    [null, 7_800_000],
    [3_960_000, null],
  ] as const)('RF-1008 says nothing when running %s and wall %s are within a minute', (r, w) => {
    expect(wallTimeNote(r, w)).toBeNull();
  });
});
