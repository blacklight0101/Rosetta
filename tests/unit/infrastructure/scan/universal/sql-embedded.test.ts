import { describe, expect, it } from 'vitest';
import { extractEmbeddedStatements } from '../../../../../src/infrastructure/scan/universal/sql-embedded.js';

function found(...lines: string[]) {
  return extractEmbeddedStatements('src/Data.cs', lines).map((s) => [s.line, s.verb, s.text]);
}

describe('SQL statements in string literals', () => {
  it.each([
    [
      'SELECT',
      'var sql = "SELECT Id, Name FROM Item WHERE Id = @id";',
      'SELECT Id, Name FROM Item WHERE Id = @id',
    ],
    [
      'INSERT',
      'Run("INSERT INTO Log (Message) VALUES (@m)");',
      'INSERT INTO Log (Message) VALUES (@m)',
    ],
    [
      'UPDATE',
      "$sql = 'UPDATE Item SET Stock = 0 WHERE Id = 1';",
      'UPDATE Item SET Stock = 0 WHERE Id = 1',
    ],
    [
      'DELETE',
      'q = `DELETE FROM sessions WHERE expires < NOW()`',
      'DELETE FROM sessions WHERE expires < NOW()',
    ],
    ['EXEC', 'Run("EXEC dbo.RefreshTotals @year");', 'EXEC dbo.RefreshTotals @year'],
    ['CREATE', 'Run("CREATE TABLE Tmp (Id INT)");', 'CREATE TABLE Tmp (Id INT)'],
  ])('RF-103 finds a %s statement with its line', (verb, line, text) => {
    expect(found('// header', line)).toEqual([[2, verb, text]]);
  });

  it('RF-103 EXECUTE is recorded as EXEC and the verb may be in lower case', () => {
    expect(found('a("execute dbo.Go @a");', 'b("  select * from t");')).toEqual([
      [1, 'EXEC', 'execute dbo.Go @a'],
      [2, 'SELECT', 'select * from t'],
    ]);
  });

  it('RF-103 ordinary sentences that start with a verb are not SQL', () => {
    expect(
      found(
        'Label.Text = "Select an item to see its details";',
        'Label.Text = "Create an account";',
        'Label.Text = "Delete this order";',
        'Label.Text = "Insert a coin";',
        'Label.Text = "Update available";',
        'Label.Text = "Execute";',
      ),
    ).toEqual([]);
  });

  it('RF-103 SQL text outside a string literal is not recorded', () => {
    expect(found('// SELECT Id FROM Item', 'SELECT Id FROM Item')).toEqual([]);
  });

  it('RF-103 a quote inside the statement does not end it', () => {
    expect(found(`var sql = "SELECT Id FROM Item WHERE Name = 'Mug'";`)).toEqual([
      [1, 'SELECT', "SELECT Id FROM Item WHERE Name = 'Mug'"],
    ]);
    expect(found('var sql = "SELECT \\"Id\\" FROM Item";')).toEqual([
      [1, 'SELECT', 'SELECT \\"Id\\" FROM Item'],
    ]);
  });

  it('RF-103 two statements on one line are both recorded', () => {
    expect(found('a("DELETE FROM A WHERE x = 1"); b("DELETE FROM B WHERE y = 2");')).toHaveLength(
      2,
    );
  });

  it('RF-103 a statement split over concatenated literals is found by its first literal', () => {
    expect(found('var sql = "SELECT Id " +', '    "FROM Item";')).toEqual([
      [1, 'SELECT', 'SELECT Id'],
    ]);
  });

  it('RF-103 a verbatim string over several lines is joined', () => {
    expect(
      found(
        'var sql = @"INSERT INTO AuditLog (Message, At)',
        '    VALUES (@m, GETDATE())";',
        'var x = 1;',
      ),
    ).toEqual([[1, 'INSERT', 'INSERT INTO AuditLog (Message, At) VALUES (@m, GETDATE())']]);
  });

  it('RF-103 an apostrophe in a comment does not swallow the lines after it', () => {
    expect(found("// don't do this", 'var sql = "DELETE FROM T WHERE Id = 1";')).toEqual([
      [2, 'DELETE', 'DELETE FROM T WHERE Id = 1'],
    ]);
  });

  it('RF-103 the statement text is cut to 500 characters', () => {
    const [statement] = found(`var sql = "SELECT ${'a, '.repeat(400)}b FROM T";`);

    expect(statement?.[2]).toHaveLength(500);
  });

  it('RF-103 a very long line of quotes is handled', () => {
    expect(found('"'.repeat(1_000_000))).toEqual([]);
  });

  it('RF-103 a very long line of repeated SQL is cut, not scanned whole', () => {
    const line = `x("${'SELECT a FROM t'.repeat(100_000)}")`;

    expect(found(line)).toHaveLength(1);
  });

  it('RF-103 at most 1000 statements are kept per file', () => {
    const many = Array.from({ length: 1200 }, () => 'a("DELETE FROM T WHERE Id = 1");');

    expect(found(...many)).toHaveLength(1000);
  });
});
