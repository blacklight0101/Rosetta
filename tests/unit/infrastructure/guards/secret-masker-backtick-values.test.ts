import { describe, expect, it } from 'vitest';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { fakeValue } from '../../../support/fake-value.js';

// P7-11 (RF-141, EV-59): the bare-value password rule does not take a lone backtick, or a run of
// backticks with nothing in it, for the value: the closing backtick of a code span such as
// `password =` is Markdown, not a secret. A value in a code span, or any other value, is still
// masked. FAKE values only (RNF-003).

const masker = new SecretMasker();
const fake = `Ex${fakeValue(6)}4`;
const mask = '[MASKED:password]';

describe('the closing backtick of a code span after a password key (P7-11)', () => {
  it.each([
    '| `-----BEGIN`, `password =`, `secret =`, `token =` | No secret in code |',
    'Search for `password =`',
    'Search for `password =` in the branch.',
    'Search for `password=`, then `pwd:`.',
    '`password =``',
    'password = ``',
    'the column `sa_password`: the field "table x columns 9".',
  ])('leaves %j alone', (text) => {
    const result = masker.mask(text);

    expect(result.text).toBe(text);
    expect(result.counts.password).toBe(0);
  });

  it.each([
    [`password = \`${fake}\``, `password = ${mask}`],
    [`password=\`${fake}\`, next`, `password=${mask}, next`],
    [`password: ${fake}`, `password: ${mask}`],
    ['password = a', `password = ${mask}`],
    ['password = `a', `password = ${mask}`],
    ['password = ``a``', `password = ${mask}`],
    [`sa_password: ${fake}`, `sa_password: ${mask}`],
    [`sa_password: the field`, `sa_password: ${mask} field`],
  ])('still masks %j', (text, masked) => {
    const result = masker.mask(text);

    expect(result.text).toBe(masked);
    expect(result.counts.password).toBe(1);
    expect(masker.mask(result.text).text).toBe(masked);
  });
});
