import { describe, expect, it } from 'vitest';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { fakeValue } from '../../../support/fake-value.js';

// RF-141, RNF-003 (P10 masker gaps): the password after `-P` of `sqlcmd`, `osql` and `bcp` is the
// whole shell word (bare and quoted parts joined), on the tool's line or a line it continues, and a
// literal that starts with `$`, `%` or `-` is a password too; only an exact variable reference is
// left alone. FAKE values only.

const masker = new SecretMasker();
const pw = `Pw${fakeValue(9)}`;
const mask = '[MASKED:password]';
const bs = '\\';

describe('the whole shell word after -P', () => {
  it.each([
    [`sqlcmd -P Fake"${pw}" -Q x`, `-P ${mask} -Q x`],
    [`sqlcmd -P Fake'${pw}' -Q x`, `-P ${mask} -Q x`],
    [`sqlcmd -P "Fake"${pw} -Q x`, `-P ${mask} -Q x`],
    [`sqlcmd -P 'a b'"${pw}" -Q x`, `-P ${mask} -Q x`],
    [String.raw`"c": "sqlcmd -P Fake\"${pw}\" -Q x"`, `-P ${mask} -Q x"`],
    [String.raw`sqlcmd -P Fake\"${pw} -Q x`, `-P ${mask} -Q x`],
  ])('masks every part of %j', (text, end) => {
    const result = masker.mask(text);

    expect(result.text).not.toContain(pw);
    expect(result.text.endsWith(end)).toBe(true);
    expect(result.counts.password).toBe(1);
  });
});

describe('a command line continued on the next line', () => {
  it.each([
    [`sqlcmd -S localhost ${bs}\n  -U sa -P ${pw}`, `-P ${mask}`],
    [`sqlcmd -S localhost ${bs}\r\n  -U sa -P ${pw} -Q x`, `-P ${mask} -Q x`],
    ['sqlcmd -S localhost `\n  -U sa -P ' + pw, `-P ${mask}`],
    [`sqlcmd -S localhost ^\n  -U sa -P ${pw}`, `-P ${mask}`],
    [
      `RUN sqlcmd -S db ${bs}\n    -U sa ${bs}\n    -P "${pw}" ${bs}\n    -Q x`,
      `-P "${mask}" ${bs}\n    -Q x`,
    ],
    [`sqlcmd -S db -U sa -P ${bs}\n  ${pw} -Q x`, `${mask} -Q x`],
  ])('masks the password in %j', (text, end) => {
    const result = masker.mask(text);

    expect(result.text).not.toContain(pw);
    expect(result.text.endsWith(end)).toBe(true);
  });

  it('keeps the line count', () => {
    const text = `sqlcmd -S db ${bs}\n -U sa -P ${pw}\nnext`;

    expect(masker.mask(text).text.split('\n')).toHaveLength(3);
  });
});

describe('literal values and the other flag shapes', () => {
  it.each([
    [`sqlcmd -U sa -P '$${pw}'`, `-P '${mask}'`],
    [`sqlcmd -U sa -P %${pw}`, `-P ${mask}`],
    [`sqlcmd -U sa -P -${pw}`, `-P ${mask}`],
    [`sqlcmd -U sa -P "for"`, `-P "${mask}"`],
    [`sqlcmd -U sa -P ${mask}${pw}`, `-P ${mask}`],
    [`sqlcmd -S . "-P" "${pw}"`, `"-P" "${mask}"`],
    [String.raw`["sqlcmd", "-P", \"${pw}\"]`, String.raw`"-P", \"${mask}\"]`],
    [`sqlcmd /S . /U sa /P ${pw}`, `/P ${mask}`],
    [`osql /U sa /P "${pw}"`, `/P "${mask}"`],
  ])('masks %j', (text, end) => {
    const result = masker.mask(text);

    expect(result.text).not.toContain(pw);
    expect(result.text.endsWith(end)).toBe(true);
  });

  it.each([
    'sqlcmd -S db -U sa -P $$SA_PASSWORD',
    'sqlcmd -S db -U sa -P ${SA_PASSWORD}',
    'sqlcmd -S db -U sa -P "${SA_PASSWORD}"',
    'sqlcmd -S db -U sa -P $(cat /run/secrets/sa)',
    'sqlcmd -S db -U sa -P %SA_PASSWORD%',
    '[CMD, sqlcmd, -P, $SA_PASSWORD]',
    'sqlcmd -S db -i /Path/to/setup.sql',
    'In sqlcmd, -P is the password flag.',
    `sqlcmd -S localhost ${bs}\n  -E -Q "select 1"`,
    `sqlcmd -U sa -P "${mask} (a note)"`,
  ])('leaves %j alone', (text) => {
    expect(masker.mask(text).text).toBe(text);
  });
});
