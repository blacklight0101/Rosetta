import { describe, expect, it } from 'vitest';
import { auditSafeDetail } from '../../../../src/infrastructure/db/audit-text.js';
import { fixturePassword } from '../../../support/account-fixtures.js';

// RF-1109, RNF-003, P1-101: the free-text masking of an audit detail value.
const M = '[MASKED:password]';
const words = ['One', 'Two', 'Three'].map(fixturePassword);
const phrase = words.join(' ');

describe('auditSafeDetail free-text masking', () => {
  it('RNF-003 masks the unquoted phrase of the card up to the end of the text', () => {
    const text = `password is ${['a', 'long', 'phrase'].join(' ')}`;

    expect(auditSafeDetail(text)).toBe(`password is ${M}`);
  });

  it.each([
    [`password is: ${phrase}`, `password is: ${M}`],
    [`password was ${phrase}, retry`, `password was ${M}, retry`],
    [`pwd is ${phrase}; retry`, `pwd is ${M}; retry`],
    [`pass is ${phrase}\nretry`, `pass is ${M}\nretry`],
    [`passphrase is ${phrase}  `, `passphrase is ${M}  `],
  ])('RNF-003 masks an unquoted phrase up to a delimiter: %#', (text, expected) => {
    const masked = auditSafeDetail(text);

    expect(masked).toBe(expected);
    for (const word of words) expect(String(masked)).not.toContain(word);
  });

  it.each([
    ["'", "'"],
    ['‘', '’'],
    ['“', '”'],
    ['«', '»'],
    ['"', '"'],
  ])('RNF-003 takes a phrase between %s and %s whole', (open, close) => {
    expect(auditSafeDetail(`password is ${open}${phrase}${close} done`)).toBe(
      `password is ${M} done`,
    );
  });

  it('RNF-003 does not end a single-quoted phrase at an apostrophe inside it', () => {
    const [one = '', two = ''] = words;

    expect(auditSafeDetail(`password is '${one}'s ${two}' done`)).toBe(`password is ${M} done`);
  });

  it('RNF-003 leaves a text without a password phrase and an already masked one alone', () => {
    expect(auditSafeDetail('the user changed their settings')).toBe(
      'the user changed their settings',
    );
    expect(auditSafeDetail(`password is ${M} and more`)).toBe(`password is ${M} and more`);
  });
});
