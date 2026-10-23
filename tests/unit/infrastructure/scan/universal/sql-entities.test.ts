import { describe, expect, it } from 'vitest';
import { entitiesFromSql } from '../../../../../src/infrastructure/scan/universal/sql-entities.js';
import type { SqlStatement } from '../../../../../src/infrastructure/scan/universal/scan-types.js';

function statement(text: string, verb: SqlStatement['verb'], line = 3): SqlStatement {
  return { path: 'Module1.vb', line, verb, text };
}

const names = (statements: readonly SqlStatement[]): string[] =>
  entitiesFromSql(statements).map((entity) => entity.name);

describe('entity candidates from SQL strings', () => {
  it('RF-103 takes the table of INSERT INTO, UPDATE, DELETE FROM and SELECT FROM', () => {
    expect(names([statement('INSERT INTO tblThing (Id) VALUES (1)', 'INSERT')])).toEqual([
      'tblThing',
    ]);
    expect(names([statement('update tblOrder set a = 1', 'UPDATE')])).toEqual(['tblOrder']);
    expect(names([statement('DELETE FROM [dbo].[tblLine] WHERE Id = 1', 'DELETE')])).toEqual([
      'tblLine',
    ]);
    expect(names([statement('SELECT * FROM Customers c WHERE c.Id = 1', 'SELECT')])).toEqual([
      'Customers',
    ]);
  });
});

describe('entity candidates from SQL strings, joins and lists', () => {
  it('RF-103 takes JOINed tables and comma lists, and drops subqueries and variables', () => {
    const found = names([
      statement(
        'SELECT a.x FROM tblA a INNER JOIN dbo.tblB b ON a.Id = b.Id LEFT JOIN tblC ON 1 = 1',
        'SELECT',
      ),
      statement('SELECT x FROM tblD, tblE e WHERE 1 = 1', 'SELECT'),
      statement('SELECT x FROM (SELECT y FROM tblF) t', 'SELECT'),
      statement('SELECT x FROM @tmp', 'SELECT'),
    ]);

    expect(found).toEqual(['tblA', 'tblB', 'tblC', 'tblD', 'tblE', 'tblF']);
  });

  it('RF-103 names the line and the verb, and records a table once per file', () => {
    const entities = entitiesFromSql([
      statement('INSERT INTO tblThing (Id) VALUES (1)', 'INSERT', 7),
      statement('SELECT * FROM tblThing', 'SELECT', 12),
    ]);

    expect(entities).toEqual([
      { name: 'tblThing', path: 'Module1.vb', startLine: 7, source: 'sql:INSERT' },
    ]);
  });

  it('RF-103 gives nothing for EXEC, CREATE and words that are not tables', () => {
    expect(
      names([
        statement('EXEC spDoIt @a = 1', 'EXEC'),
        statement('SELECT 1 FROM', 'SELECT'),
        statement('SELECT x FROM where y', 'SELECT'),
      ]),
    ).toEqual([]);
  });

  it('RF-103 does not take the word after FOR UPDATE for a table', () => {
    expect(names([statement('SELECT x FROM tblA WHERE 1 = 1 FOR UPDATE of y', 'SELECT')])).toEqual([
      'tblA',
    ]);
  });
});

describe('entity candidates from SQL strings, prose and short statements', () => {
  it('RF-103 gives nothing for English sentences that start with a SQL verb', () => {
    expect(
      names([
        statement('Select a file from the list', 'SELECT'),
        statement('Select one from the options below', 'SELECT'),
        statement('Delete this item from the cart', 'DELETE'),
        statement('Insert your name into the box', 'INSERT'),
        statement('Update the page when you set a date', 'UPDATE'),
      ]),
    ).toEqual([]);
  });

  it('RF-103 still takes tables from short real statements', () => {
    expect(
      names([
        statement('SELECT Id, Name FROM tblA', 'SELECT'),
        statement('SELECT COUNT(*) FROM tblB', 'SELECT'),
        statement('UPDATE tblC t SET t.x = 1', 'UPDATE'),
        statement('DELETE FROM tblD', 'DELETE'),
        statement('INSERT INTO tblE VALUES (1)', 'INSERT'),
      ]),
    ).toEqual(['tblA', 'tblB', 'tblC', 'tblD', 'tblE']);
  });
});
