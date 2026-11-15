import { describe, expect, it } from 'vitest';
import { describeError } from '../../../../src/domain/errors/descriptions.js';

// RF-435, RF-432, P9-02, EV-100: RST-2311 serves a step that did not start and a Continue the
// journey could take none of, so its words fit both and name the one way on: Analyse again.

describe('RST-2311 words', () => {
  const description = describeError('RST-2311');

  it('RF-435 P9-02 says nothing more can run, which reads right for a start and a Continue', () => {
    expect(description.message).not.toMatch(/did not start/u);
    expect(description.message).toMatch(/used up|nothing is left/iu);
  });

  it('RF-435 P9-02 names Analyse again on the start page as the way on', () => {
    expect(description.nextStep).toContain('Analyse again');
    expect(description.nextStep).toContain('start page');
  });
});
