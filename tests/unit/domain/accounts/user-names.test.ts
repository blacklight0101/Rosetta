import { describe, expect, it } from 'vitest';
import { parseDisplayName, parseUserName } from '../../../../src/domain/accounts/user-names.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';

// RF-1102, data-model.md section 4: a user name has 3..40 characters [a-z0-9._-] and is unique
// case-insensitively, so it is kept in lower case; a display name has 1..80 characters.

describe('user names', () => {
  it.each(['abc', 'teacher', 'first.last', 'a_b-c.9', 'x'.repeat(40)])(
    'RF-1102 accepts the user name %s',
    (name) => {
      expect(parseUserName(name)).toEqual({ ok: true, value: name });
    },
  );

  it('RF-1102 keeps a user name in lower case, so names differing only in case are one name', () => {
    expect(parseUserName('  Teacher ')).toEqual({ ok: true, value: 'teacher' });
  });

  it.each(['ab', 'x'.repeat(41), 'with space', 'semi;colon', 'slash/name', 'ümlaut', ''])(
    'RF-1102 refuses the user name %j',
    (name) => {
      expect(parseUserName(name)).toEqual({ ok: false, error: ERROR_CODES.userNameInvalid });
    },
  );
});

describe('display names', () => {
  it('RF-1102 accepts and trims a display name of 1 to 80 characters', () => {
    expect(parseDisplayName('  Ada Lovelace ')).toEqual({ ok: true, value: 'Ada Lovelace' });
    expect(parseDisplayName('\u{1F600}'.repeat(80))).toEqual({
      ok: true,
      value: '\u{1F600}'.repeat(80),
    });
  });

  it.each(['', '   ', 'y'.repeat(81)])('RF-1102 refuses the display name %j', (name) => {
    expect(parseDisplayName(name)).toEqual({ ok: false, error: ERROR_CODES.displayNameInvalid });
  });
});
