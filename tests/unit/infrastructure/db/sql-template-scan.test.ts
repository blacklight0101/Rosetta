import { describe, expect, it } from 'vitest';
import { findSqlTemplates } from '../../../support/sql-template-scan.js';

// ADR-016, RNF-003, F-20: the scan that keeps `${}` out of SQL text finds a substitution wherever it
// hides, and leaves `$1` placeholders and ordinary messages alone.

const kinds = (source: string): string[] => findSqlTemplates(source).map((found) => found.kind);

describe('findSqlTemplates', () => {
  it.each([
    ['a template written in query()', 'pool.query(`SELECT 1 FROM t WHERE id = ${id}`, []);'],
    ['a template written in a bare query()', 'query(`${text}`, []);'],
    ['a constant built from a template', 'const Q = `SELECT a FROM t WHERE b = ${b}`;'],
    ['a helper that returns SQL', 'const g = (s: string): string => `SELECT a FROM t WHERE ${s}`;'],
    ['lower-case SQL', 'const Q = `select a from t where b = ${b}`;'],
    ['mixed-case SQL', 'const Q = `SeLeCt a FrOm t WhErE b = ${b}`;'],
    ['SQL over several lines', 'const Q = `select a\n  from t\n  where b = ${b}`;'],
    ['SQL with CRLF line breaks', 'const Q = `select a\r\nfrom t\r\nwhere b = ${b}`;'],
    ['SQL with a Unicode space', 'const Q = `select a from t where b = ${b}`;'],
    ['an INSERT', 'const Q = `INSERT INTO t (a) VALUES (${a})`;'],
    ['an UPDATE', 'const Q = `UPDATE t SET a = ${a}`;'],
    ['a DELETE', 'const Q = `DELETE FROM t WHERE a = ${a}`;'],
    ['a DDL statement', 'const Q = `CREATE TABLE ${name} (a int)`;'],
    ['a GRANT', 'const Q = `GRANT SELECT ON t TO ${role}`;'],
    ['a SET ROLE', 'const Q = `SET ROLE ${role}`;'],
    ['a clause only', 'const Q = `ORDER BY ${column}`;'],
    ['a template nested in another', 'const Q = `x ${`select a from t where ${b}`}`;'],
    ['a template in a class method', 'class A { m() { return `select a from t where ${b}`; } }'],
  ])('finds %s', (_label, source) => {
    expect(findSqlTemplates(source)).not.toEqual([]);
  });

  it('finds a tagged template whatever its text', () => {
    expect(kinds('const Q = sql`${a}`;')).toEqual(['tagged']);
    expect(kinds('const Q = db.sql`select a from t where b = ${b}`;')).toEqual([
      'tagged',
      'sql-text',
    ]);
  });

  it('finds the template in the first argument of query() whatever its text', () => {
    expect(kinds('client.query(`${text}`, [1]);')).toEqual(['query-argument']);
  });

  it('reports the line of the template', () => {
    const [found] = findSqlTemplates('const a = 1;\n\nconst Q = `select a from t where b = ${b}`;');

    expect(found?.line).toBe(3);
  });
});

describe('findSqlTemplates leaves alone', () => {
  it.each([
    ['a constant string', "const Q = 'SELECT a FROM t WHERE id = $1';"],
    [
      'a placeholder in a template without substitution',
      'const Q = `SELECT a FROM t WHERE id = $1 AND b = $2`;',
    ],
    ['an array placeholder', 'const Q = `SELECT a FROM t WHERE id = ANY($1::uuid[])`;'],
    ['a dollar quote', 'const Q = `DO $$ BEGIN PERFORM 1; END $$`;'],
    ['a message', 'const m = `Migration ${name} failed and was rolled back.`;'],
    ['a key', 'const k = `${userId.toLowerCase()} ${provider}`;'],
    ['a message with the word from', 'const m = `Read ${count} files from the folder.`;'],
    ['a replacement pattern', 'const r = text.replace(re, `$<keep>${MASKED}`);'],
    ['a concatenation of constants', "const Q = 'SELECT a FROM t ' + 'WHERE id = $1';"],
  ])('%s', (_label, source) => {
    expect(findSqlTemplates(source)).toEqual([]);
  });
});
