import { describe, expect, it } from 'vitest';
import { nextStepFor } from '../../../web/src/lib/live-run/run-failures.js';

// RF-615, RF-1108: the next step a failed plan run shows names no Resume: a plan run is not resumed
// (the journey says "Try the plan again"), so the words the error catalogue gives for a resumable
// run must not reach a plan page (EV-13).

const resumeWording = 'The run was stopped or reached a cap; resume it when you are ready.';

describe('nextStepFor: the next step of a failed run', () => {
  it('EV-13 a failed plan run never points to a Resume button', () => {
    const text = nextStepFor('plan', resumeWording);

    expect(text).not.toMatch(/resume/i);
    expect(text).toMatch(/try the plan again/i);
  });

  it('RF-006 an understand run keeps the next step of the catalogue', () => {
    expect(nextStepFor('understand', resumeWording)).toBe(resumeWording);
  });
});
