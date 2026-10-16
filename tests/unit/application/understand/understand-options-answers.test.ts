import { describe, expect, it } from 'vitest';
import {
  readUnderstandOptions,
  understandOptionsOf,
} from '../../../../src/application/understand/understand-options.js';

// RF-241, data-model.md section 3.6 (`options`): the answers option is recorded when the request set it.

describe('the answers option of an understand run', () => {
  it('RF-241 is recorded only when the request asked for it, and read back', () => {
    expect(understandOptionsOf({ withAnswers: true })).toEqual({
      cloudConsent: false,
      withAnswers: true,
    });
    expect(understandOptionsOf({ withAnswers: false })).toEqual({ cloudConsent: false });
    expect(readUnderstandOptions({ cloudConsent: true, withAnswers: true })).toEqual({
      cloudConsent: true,
      withAnswers: true,
    });
  });

  it('RF-241 reads anything but true as no answers option', () => {
    expect(readUnderstandOptions({ withAnswers: 'yes' })).toEqual({ cloudConsent: false });
  });
});
