import { describe, expect, it } from 'vitest';
import { probeStatesOutcome } from '../../../../src/domain/planning/task-card-quality.js';

// P5-08, RF-630: which review probes state an expected outcome.

describe('RF-630 probeStatesOutcome', () => {
  it.each([
    ['A total of 51 => refused with RST-9'],
    ['A total of 50 -> accepted'],
    ['A total of 50 \u2192 accepted'],
    ['Open /a-b -> c'], // counted: the arrow has text on both sides, so "c" is the outcome
    ['Upload `a=>b.csv` => stored under that name'], // the arrow outside the quotes counts
    ['Expected: refused for 51'],
    ['Send 51; expected refusal of the order'],
    ['A total of 51 must be refused'],
    ['A total of 413 bytes is refused with 413'],
    ['Send a script tag; rejected'],
  ])('RF-630 counts %j as stating an outcome', (probe) => {
    expect(probeStatesOutcome(probe)).toBe(true);
  });

  it.each([
    ['Send input; nothing expected'],
    ['What is expected? Try 1'],
    ['expected-value mismatch'],
    ['A file called `a=>b` in a quoted file name'], // the arrow is inside a quoted name
    ['A total of 50.'],
    ['=> refused'], // no input
    ['A total of 50 =>'], // no outcome
    ['   '],
  ])('RF-630 does not count %j', (probe) => {
    expect(probeStatesOutcome(probe)).toBe(false);
  });
});
