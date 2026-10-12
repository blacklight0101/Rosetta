import { expect, it } from 'vitest';
import { evaluateRules } from '../../../web/src/lib/password-rules.js';

// RF-1103: the rule checklist. Length and user name are judged while typing; the common-passwords
// list stays on the server, so that rule is open until the server refuses the password.

const states = (password: string, userName = 'ana.ruiz', refusedAsCommon = false) =>
  Object.fromEntries(
    evaluateRules({ password, userName, refusedAsCommon }).map((rule) => [rule.id, rule.state]),
  );

it('RF-1103 leaves every rule open before anything is typed', () => {
  expect(states('')).toEqual({ length: 'pending', common: 'pending', 'user-name': 'pending' });
});

it('RF-1103 counts characters while typing and passes at 12', () => {
  expect(states('short')).toMatchObject({ length: 'fail' });
  expect(states('twelve-chars')).toMatchObject({ length: 'pass' });
  const rules = evaluateRules({ password: 'ten-chars!', userName: 'ana', refusedAsCommon: false });
  expect(rules.find((rule) => rule.id === 'length')?.label).toBe(
    'At least 12 characters (10 so far)',
  );
});

it('RF-1103 counts a character outside the basic plane once, as the server does', () => {
  expect(states('😀'.repeat(12))).toMatchObject({ length: 'pass' });
  expect(states('😀'.repeat(11))).toMatchObject({ length: 'fail' });
});

it('RF-1103 fails a password that contains the user name, ignoring case', () => {
  expect(states('xx-ANA.ruiz-xx', 'ana.ruiz')).toMatchObject({ 'user-name': 'fail' });
  expect(states('xx-someone-xx', 'ana.ruiz')).toMatchObject({ 'user-name': 'pass' });
});

it('RF-1103 fails the common-password rule only after the server refused that password', () => {
  expect(states('twelve-chars', 'ana', true)).toMatchObject({ common: 'fail' });
  expect(states('twelve-chars', 'ana', false)).toMatchObject({ common: 'pending' });
});
