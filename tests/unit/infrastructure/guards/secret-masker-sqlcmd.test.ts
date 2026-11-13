import { describe, expect, it } from 'vitest';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { fakeValue } from '../../../support/fake-value.js';

// RF-141, RNF-003: the password of a SQL Server command line (`sqlcmd`, `osql`, `bcp`) follows `-P`,
// as in the healthcheck of a docker-compose file. The rule names no key, so the masker missed it
// (found in the committed lab sets, P10 lab fixes). FAKE values only.

const masker = new SecretMasker();
const pw = `Pw@${fakeValue(9)}`;
const mask = '[MASKED:password]';

describe('the password of a SQL Server command line', () => {
  it.each([
    [`sqlcmd -S localhost -U sa -P ${pw} -Q "select 1"`, `-P ${mask} -Q "select 1"`],
    [
      `      test: [ "CMD", "sqlcmd", "-U", "sa", "-P", "${pw}", "-Q", "select 1" ]`,
      `"-P", "${mask}", "-Q", "select 1" ]`,
    ],
    [`/opt/mssql-tools/bin/sqlcmd -S db -U sa -P '${pw}'`, `-P '${mask}'`],
    [`sqlcmd.exe -S . -U sa -P${pw}`, `-P${mask}`],
    [`osql -S . -U sa -P ${pw}`, `-P ${mask}`],
    [`bcp dbo.Items out items.dat -S . -U sa -P ${pw} -c`, `-P ${mask} -c`],
    [String.raw`"build": "sqlcmd -S . -U sa -P \"${pw}\" -Q x"`, String.raw`-P \"${mask}\" -Q x"`],
    [
      String.raw`"test": "[ \"CMD\", \"sqlcmd\", \"-P\", \"${pw}\", \"-Q\", \"x\" ]"`,
      String.raw`\"-P\", \"${mask}\", \"-Q\", \"x\" ]"`,
    ],
    [String.raw`sqlcmd -U sa -P \\\"${pw}\\\" -Q x`, String.raw`-P \\\"${mask}\\\" -Q x`],
    [`sqlcmd -U sa -P Fa,ke]${pw} -Q x`, `-P ${mask} -Q x`],
    [`sqlcmd -U sa -P "it's ${pw}" -Q x`, `-P "${mask}" -Q x`],
    [`sqlcmd -U sa -P 'say "${pw}"' -Q x`, `-P '${mask}' -Q x`],
    [`test: [CMD, sqlcmd, -U, sa, -P, ${pw}, -Q, x]`, `-P, ${mask}, -Q, x]`],
  ])('masks the value after -P in %j', (text, end) => {
    const result = masker.mask(text);

    expect(result.text).not.toContain(pw);
    expect(result.text.endsWith(end)).toBe(true);
    expect(result.counts.password).toBe(1);
  });

  it.each([
    'sqlcmd -S db -U sa -P "$SA_PASSWORD" -Q "select 1"',
    'sqlcmd -S db -U sa -P %SA_PASSWORD%',
    'sqlcmd -S db -U sa -P $(SA_PASSWORD)',
    'sqlcmd -S db -E -Q "select 1"',
    'sqlcmd -S db -U sa -P -Q "select 1"',
    'mysql -h db -P 3306 -u root',
    'Run sqlcmd with -P to give the password.',
    `sqlcmd -U sa -P ${mask}`,
    `test: [ "CMD", "sqlcmd", "-P", "${mask} (a note on the masked value)", "-Q", "select 1" ]`,
    String.raw`"test": "[ \"CMD\", \"sqlcmd\", \"-P\", \"$SA_PASSWORD\" ]"`,
    String.raw`"build": "sqlcmd -U sa -P \"[MASKED:password] (a note)\" -Q x"`,
  ])('leaves %j alone', (text) => {
    expect(masker.mask(text).text).toBe(text);
  });
});

describe('the time the SQL Server rules take', () => {
  it.each([
    ['options', `sqlcmd ${'-x '.repeat(50_000)}`],
    ['escaped quotes after -P', `sqlcmd -P ${'\\"'.repeat(50_000)}`],
    ['backslash runs after -P', `sqlcmd -P "${'\\'.repeat(100_000)}`],
    ['backslash runs before a quote', `sqlcmd -P ${'\\'.repeat(100_000)}"`],
    ['exec array items', `[ "sqlcmd", ${'"-P", '.repeat(30_000)}`],
    ['escaped exec array items', `[ \\"sqlcmd\\", ${'\\"-P\\", '.repeat(30_000)}`],
    ['tool names', 'sqlcmd -P '.repeat(20_000)],
    ['bare tool names', 'sqlcmd '.repeat(30_000)],
    ['continued lines', 'sqlcmd -x \\\n'.repeat(20_000)],
    ['continued options', `sqlcmd ${'-x \\\n'.repeat(20_000)}`],
    ['joined quoted parts', `sqlcmd -P ${'"a"b'.repeat(50_000)}`],
    ['unclosed escaped quotes', `sqlcmd -P a${'\\"x'.repeat(50_000)}`],
    ['unclosed quotes in a word', `sqlcmd -P a${'"x'.repeat(50_000)}`],
    ['runs of five backslashes and a quote', `sqlcmd -P ${'\\\\\\\\\\"'.repeat(30_000)}`],
    ['blanks after -P', `sqlcmd -P${' '.repeat(100_000)}`],
    ['continued blanks after -P', `sqlcmd -P${' \\\n'.repeat(50_000)}`],
    ['blanks after /P', `sqlcmd /P${' '.repeat(100_000)}`],
  ])('stays linear on a long line of %s', (_name, long) => {
    const started = performance.now();

    masker.mask(long.repeat(4));

    expect(performance.now() - started).toBeLessThan(2000);
  });
});
