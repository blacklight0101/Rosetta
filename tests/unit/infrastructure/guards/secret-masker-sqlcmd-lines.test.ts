import { describe, expect, it } from 'vitest';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import {
  loadMaskedValuePrompt,
  maskedValueReplacement,
} from '../../../../src/infrastructure/prompts/masked-value-prompt.js';
import { fakeValue } from '../../../support/fake-value.js';

// RF-141, RNF-003 (P10 masker gaps 2): every `-P` and `/P` of a SQL Server tool's line is read, not
// only the first; a `-P` inside another option's quoted argument (`-Q "SELECT -Price"`) is not a
// flag; a `$` or `%` reference is a variable unless single quotes make it a literal; a reference, a
// masked value, a placeholder or a word of prose is left alone only when it is the whole shell word.
// FAKE values only.

const masker = new SecretMasker();
const a = `Aa${fakeValue(8)}`;
const b = `Bb${fakeValue(7)}`;
const mask = '[MASKED:password]';
const bs = '\\';

function maskedTwice(text: string): string {
  const once = masker.mask(text).text;
  expect(masker.mask(once).text).toBe(once);
  return once;
}

describe('every password flag of the line', () => {
  it.each([
    [
      `sqlcmd -Q "SELECT -Price FROM t" -U sa -P "${b}"`,
      `sqlcmd -Q "SELECT -Price FROM t" -U sa -P "${mask}"`,
    ],
    [
      `bcp "SELECT a FROM t WHERE s = -Pending" queryout f.dat -U sa -P "${b}"`,
      `bcp "SELECT a FROM t WHERE s = -Pending" queryout f.dat -U sa -P "${mask}"`,
    ],
    [`["sqlcmd", "-Q", "x -Py", "-P", "${b}"]`, `["sqlcmd", "-Q", "x -Py", "-P", "${mask}"]`],
    [
      String.raw`"c": "sqlcmd -Q \"x -Py\" -P \"${b}\""`,
      String.raw`"c": "sqlcmd -Q \"x -Py\" -P \"${mask}\""`,
    ],
    [`sqlcmd -P "${a}" -S x -P ${b}`, `sqlcmd -P "${mask}" -S x -P ${mask}`],
    [`sqlcmd -P ${a} -P "${b}"`, `sqlcmd -P ${mask} -P "${mask}"`],
    [`sqlcmd -P '${a}' /P ${b}`, `sqlcmd -P '${mask}' /P ${mask}`],
    [`sqlcmd -P ${a} -P ${b}`, `sqlcmd -P ${mask} -P ${mask}`],
    [`[CMD, sqlcmd, -P, ${a}, -P, ${b}]`, `[CMD, sqlcmd, -P, ${mask}, -P, ${mask}]`],
    [`sqlcmd -P $PW -P "${b}"`, `sqlcmd -P $PW -P "${mask}"`],
    [`sqlcmd -P <password> -P "${b}"`, `sqlcmd -P <password> -P "${mask}"`],
  ])('masks every password in %j', (text, expected) => {
    expect(maskedTwice(text)).toBe(expected);
  });

  it.each([
    'sqlcmd -S db -Q "SELECT -Price FROM t"',
    'sqlcmd -S db -Q "use -P to"',
    'sqlcmd -E -Q "x" | mysql -h h -P 3306',
    `sqlcmd -E ${bs}\nmysql -P 3306`,
    'The sqlcmd docs say: -P is the password, /P too.',
    'sqlcmd -S db -o /P /out.txt -E',
    'sqlcmd -S . -E -v P=1 -i /P x.sql',
  ])('leaves %j alone', (text) => {
    expect(masker.mask(text).text).toBe(text);
  });
});

describe('a variable reference after -P', () => {
  it.each([
    'sqlcmd -U sa -P $env:SA_PASSWORD',
    'sqlcmd -U sa -P "$Env:MSSQL_SA_PASSWORD"',
    'sqlcmd -U sa -P ${{ secrets.SA_PASSWORD }}',
    'sqlcmd -U sa -P ${{ secrets.SA_PASSWORD }} -Q x',
    'sqlcmd -U sa -P "$1"',
    'sqlcmd -U sa -P $1',
    'sqlcmd -U sa -P "$@"',
    'sqlcmd -U sa -P %~1',
    'sqlcmd -U sa -P $cfg.Password',
    'sqlcmd -U sa -P $(cat /run/secrets/sa) -Q x',
  ])('leaves %j alone', (text) => {
    expect(masker.mask(text).text).toBe(text);
  });

  it.each([
    [`sqlcmd -U sa -P '$${a}'`, `-P '${mask}'`],
    [`sqlcmd -U sa -P %${a}`, `-P ${mask}`],
  ])('masks the literal %j', (text, end) => {
    expect(maskedTwice(text).endsWith(end)).toBe(true);
  });
});

describe('a left-alone token joined to more of the word', () => {
  it.each([
    `sqlcmd -P $X"${a}" -Q x`,
    `sqlcmd -P "$X"${a} -Q x`,
    `sqlcmd -P %X%"${a}" -Q x`,
    `sqlcmd -P \${X}"${a}" -Q x`,
    `sqlcmd -P to"${a}" -Q x`,
    `sqlcmd -P ${mask}"${a}" -Q x`,
    `sqlcmd -P "${mask}"${a} -Q x`,
    `sqlcmd -P '$SA_PASSWORD'${a} -Q x`,
    `sqlcmd -P $(cat f)${a} -Q x`,
    `sqlcmd -P Fake" ${a}" -Q x`,
  ])('masks the whole word of %j', (text) => {
    expect(maskedTwice(text)).toBe(`sqlcmd -P ${mask} -Q x`);
  });

  it('keeps a JSON line around the command readable', () => {
    const text = `{"c": "sqlcmd -P ${a}", "d": "x"}`;

    expect(maskedTwice(text)).toBe(`{"c": "sqlcmd -P ${mask}", "d": "x"}`);
  });

  it('reads the note of a masked value as a part of the word', async () => {
    const file = await loadMaskedValuePrompt('prompts');
    const explained = new SecretMasker(undefined, maskedValueReplacement(file));

    const result = explained.mask(`sqlcmd -U sa -P pwd=Abc,${a} -Q x`).text;

    expect(result).not.toContain(a);
    expect(result.endsWith(' -Q x')).toBe(true);
  });
});

describe('the arguments the command skips', () => {
  it.each([
    [String.raw`sqlcmd -o "C:\out\" -P "${a}"`, String.raw`sqlcmd -o "C:\out\" -P "${mask}"`],
    [String.raw`sqlcmd -i 'C:\x\' -P '${a}'`, String.raw`sqlcmd -i 'C:\x\' -P '${mask}'`],
    [
      String.raw`& sqlcmd -S . -o 'C:\temp\' -U sa -P '${a}'`,
      String.raw`& sqlcmd -S . -o 'C:\temp\' -U sa -P '${mask}'`,
    ],
    [String.raw`sqlcmd -v X='a\' -P '${a}'`, String.raw`sqlcmd -v X='a\' -P '${mask}'`],
    [`sqlcmd -S mysql -U sa -P ${a}`, `sqlcmd -S mysql -U sa -P ${mask}`],
    [`sqlcmd -S mysql,1433 -U sa -P ${a}`, `sqlcmd -S mysql,1433 -U sa -P ${mask}`],
    [`sqlcmd -U mysql -P ${a}`, `sqlcmd -U mysql -P ${mask}`],
    [`sqlcmd -Q mysql -P ${a}`, `sqlcmd -Q mysql -P ${mask}`],
    [`sqlcmd -S . -d mariadb -U sa -P ${a}`, `sqlcmd -S . -d mariadb -U sa -P ${mask}`],
    [`sqlcmd -P ,${a}`, `sqlcmd -P ${mask}`],
  ])('masks the password after %j', (text, expected) => {
    expect(maskedTwice(text)).toBe(expected);
  });

  it.each([
    [
      String.raw`sqlcmd -o "C:\out\" -P${a} -Q "x"`,
      String.raw`sqlcmd -o "C:\out\" -P${mask} -Q "x"`,
    ],
    [
      String.raw`sqlcmd -v Dir="C:\Backups\" -S . -U sa -P${a}`,
      String.raw`sqlcmd -v Dir="C:\Backups\" -S . -U sa -P${mask}`,
    ],
    [
      String.raw`{"a":sqlcmd -o "C:\out\" -P "${a}","b":1}`,
      String.raw`{"a":sqlcmd -o "C:\out\" -P "${mask}","b":1}`,
    ],
    [
      String.raw`{"a":sqlcmd -i "C:\in.sql" -P "${a}","b":1}`,
      String.raw`{"a":sqlcmd -i "C:\in.sql" -P "${mask}","b":1}`,
    ],
  ])('never lets a skipped argument swallow the password after it in %j', (text, expected) => {
    expect(maskedTwice(text)).toBe(expected);
  });

  it.each(['sqlcmd -P ${{ secrets.X -Q x', 'sqlcmd -P $(cat f -Q x'])(
    'leaves the reference that does not close in %j alone',
    (text) => {
      expect(masker.mask(text).text).toBe(text);
    },
  );
});

describe('a quoted argument that names a tool', () => {
  it.each([
    [
      `["[CMD, sqlcmd, -P, ${a}]", "[CMD, sqlcmd, -P, ${b}]"]`,
      `["[CMD, sqlcmd, -P, ${mask}]", "[CMD, sqlcmd, -P, ${mask}]"]`,
    ],
    [
      String.raw`["[\"sqlcmd\", \"-P\", \"${a}\"]", "[\"sqlcmd\", \"-P\", \"${b}\"]"]`,
      String.raw`["[\"sqlcmd\", \"-P\", \"${mask}\"]", "[\"sqlcmd\", \"-P\", \"${mask}\"]"]`,
    ],
    [`sqlcmd -P "${a}", "sqlcmd -P ${b}"`, `sqlcmd -P "${mask}", "sqlcmd -P ${mask}"`],
  ])('reads the command in a quoted argument that names a tool in %j', (text, expected) => {
    expect(maskedTwice(text)).toBe(expected);
  });

  it('masks the passwords of the command inside and of the command around it', () => {
    const masked = maskedTwice(`sqlcmd -Q "exec xp_cmdshell 'bcp t out f -P ${a}'" -P ${b}`);

    expect(masked).not.toContain(a);
    expect(masked).not.toContain(b);
  });
});

describe('a value masked between quotes, masked again', () => {
  it.each([
    `{"a": sqlcmd -P "${a}"}`,
    `[sqlcmd -P "${a}", 1]`,
    `{"a": sqlcmd -P '${a}'}`,
    JSON.stringify(JSON.stringify(`sqlcmd -P "${a}"`)),
    JSON.stringify(`bash -c 'sqlcmd -P "${a}"'`),
    `{"a": ${JSON.stringify(JSON.stringify(`sqlcmd -P "${a} x"`))}}`,
  ])('stays the same in %j', (text) => {
    expect(maskedTwice(text)).not.toContain(a);
  });
});
