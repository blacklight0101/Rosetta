import { describe, expect, it } from 'vitest';
import { checkNewPassword } from '../../../../src/domain/accounts/password-rules.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { fixturePassword } from '../../../support/account-fixtures.js';

// RF-1103, ADR-015: a new password has at least 12 characters, is not on the common-passwords list
// and does not contain the user name. The list holds lower-case entries.

const common: ReadonlySet<string> = new Set([
  ['correct', 'horse', 'battery'].join(''),
  ['a', 'b', 'c'].join('').repeat(4),
]);

describe('password rules', () => {
  it('RF-1103 accepts a password of 12 characters or more that breaks no rule', () => {
    const password = fixturePassword('A');

    expect(checkNewPassword(password, 'teacher', common)).toEqual({ ok: true, value: password });
  });

  it('RF-1103 refuses a password shorter than 12 characters', () => {
    const password = 'Ab1-'.repeat(2) + 'Xyz';

    expect(password).toHaveLength(11);
    expect(checkNewPassword(password, 'teacher', common)).toEqual({
      ok: false,
      error: ERROR_CODES.passwordTooShort,
    });
  });

  it('RF-1103 counts characters, not UTF-16 code units, for the minimum length', () => {
    const password = '\u{1F512}'.repeat(11);

    expect(checkNewPassword(password, 'teacher', common)).toEqual({
      ok: false,
      error: ERROR_CODES.passwordTooShort,
    });
  });

  it('RF-1103 accepts exactly 12 characters', () => {
    const password = ['Qz', 'Wx', 'Ev', 'Rb', 'Tn', 'Ym'].join('');

    expect(checkNewPassword(password, 'teacher', common).ok).toBe(true);
  });

  it('RF-1103 refuses a password on the common-passwords list, whatever its case', () => {
    const password = ['Correct', 'HORSE', 'battery'].join('');

    expect(checkNewPassword(password, 'teacher', common)).toEqual({
      ok: false,
      error: ERROR_CODES.passwordTooCommon,
    });
  });

  it('RF-1103 refuses a password that contains the user name, whatever its case', () => {
    const password = ['my', 'TeAcHeR', 'long', 'phrase'].join('-');

    expect(checkNewPassword(password, 'teacher', common)).toEqual({
      ok: false,
      error: ERROR_CODES.passwordContainsUserName,
    });
  });
});
