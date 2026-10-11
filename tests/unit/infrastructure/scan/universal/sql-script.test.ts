import { describe, expect, it } from 'vitest';
import { extractScriptStatements } from '../../../../../src/infrastructure/scan/universal/sql-script.js';

function scriptOf(text: string) {
  return extractScriptStatements('db/script.sql', text.split('\n'));
}

describe('SQL statements in a script', () => {
  it('RF-103 records each statement with its first line and verb', () => {
    const statements = scriptOf(
      [
        'INSERT INTO Item (Id, Name) VALUES (1, 1);',
        'INSERT INTO Item (Id, Name)',
        "VALUES (2, 'Cap');",
        '',
        'DELETE FROM Item WHERE Id = 99;',
      ].join('\n'),
    );

    expect(statements).toEqual([
      {
        path: 'db/script.sql',
        line: 1,
        verb: 'INSERT',
        text: 'INSERT INTO Item (Id, Name) VALUES (1, 1);',
      },
      {
        path: 'db/script.sql',
        line: 2,
        verb: 'INSERT',
        text: "INSERT INTO Item (Id, Name) VALUES (2, 'Cap');",
      },
      {
        path: 'db/script.sql',
        line: 5,
        verb: 'DELETE',
        text: 'DELETE FROM Item WHERE Id = 99;',
      },
    ]);
  });

  it('RF-103 a GO line ends a statement that has no semicolon', () => {
    const statements = scriptOf(
      ['CREATE TABLE T (Id INT)', 'GO', 'SELECT Id FROM T', 'GO'].join('\n'),
    );

    expect(statements.map((s) => [s.line, s.verb, s.text])).toEqual([
      [1, 'CREATE', 'CREATE TABLE T (Id INT)'],
      [3, 'SELECT', 'SELECT Id FROM T'],
    ]);
  });

  it('RF-103 a SELECT under an unfinished CREATE or INSERT belongs to it', () => {
    const statements = scriptOf(
      ['CREATE VIEW V AS', 'SELECT Id FROM T;', 'INSERT INTO U (Id)', 'SELECT Id FROM T;'].join(
        '\n',
      ),
    );

    expect(statements.map((s) => [s.line, s.verb])).toEqual([
      [1, 'CREATE'],
      [3, 'INSERT'],
    ]);
    expect(statements[0]?.text).toBe('CREATE VIEW V AS SELECT Id FROM T;');
  });

  it('RF-103 comments are skipped and the verb is found in any letter case', () => {
    const statements = scriptOf(
      ['-- SELECT nothing FROM here', '/* UPDATE x SET y = 1 */', 'update T set A = 1;'].join('\n'),
    );

    expect(statements.map((s) => [s.line, s.verb, s.text])).toEqual([
      [3, 'UPDATE', 'update T set A = 1;'],
    ]);
  });

  it('RF-103 EXECUTE is recorded as EXEC', () => {
    const statements = scriptOf('EXECUTE dbo.Refresh @Id = 1;\nexec sp_who;');

    expect(statements.map((s) => s.verb)).toEqual(['EXEC', 'EXEC']);
  });

  it('RF-103 the last statement is recorded even without a terminator', () => {
    expect(scriptOf('SELECT 1 FROM T')).toHaveLength(1);
  });

  it('RF-103 the statement text is cut to 500 characters', () => {
    const [statement] = scriptOf(`SELECT ${'a, '.repeat(400)}b FROM T;`);

    expect(statement?.text).toHaveLength(500);
  });

  it('RF-103 a script with no statement gives an empty list', () => {
    expect(scriptOf('-- only a comment\n\n')).toEqual([]);
  });

  it('RF-103 at most 1000 statements are kept per file', () => {
    const many = Array.from(
      { length: 1200 },
      (_, index) => `DELETE FROM T WHERE Id = ${String(index)};`,
    );

    expect(scriptOf(many.join('\n'))).toHaveLength(1000);
  });

  it('RF-103 a very long line is cut, not scanned whole', () => {
    const [statement] = scriptOf(`SELECT ${'x'.repeat(2_000_000)} FROM T;`);

    expect(statement?.text.length).toBeLessThanOrEqual(500);
  });
});
