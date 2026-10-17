import { describe, expect, it } from 'vitest';
import { sameFamilyWarning } from '../../../../src/application/verifier/family-warning.js';

// RF-301, DEC-57: a run whose verifier shares the reader's model family is warned; the run goes on.

describe('self-preference warning', () => {
  it('RF-301 a verifier of the reader family gives a warning that names the self-preference risk', () => {
    const warning = sameFamilyWarning('gemma4:e4b', 'gemma3:27b');

    expect(warning).toMatchObject({
      level: 'warn',
      logger: 'understand',
      data: { readerModel: 'gemma4:e4b', verifierModel: 'gemma3:27b', family: 'gemma' },
    });
    expect(warning?.message).toContain('self-preference');
    expect(warning?.message).toContain('The run continues.');
  });

  it('RF-301 a verifier of another family gives no warning', () => {
    expect(sameFamilyWarning('gemma4:e4b', 'gpt-4o-mini')).toBeUndefined();
  });
});
