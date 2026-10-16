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
  ])('finds %s', (_label, source) => {
    expect(findSqlTemplates(source)).not.toEqual([]);
  });
});

describe('findSqlTemplates finds more', () => {
  it.each([
    ['a TRUNCATE', 'const Q = `TRUNCATE ${t}`;'],
    ['a lower-case truncate', 'const Q = `truncate ${t} restart identity`;'],
    ['a LOCK TABLE', 'const Q = `LOCK TABLE ${t} IN ACCESS EXCLUSIVE MODE`;'],
    ['a lock over lines', 'const Q = `lock\n  table ${t}`;'],
    ['a VACUUM', 'const Q = `VACUUM ${t}`;'],
    ['a REINDEX', 'const Q = `REINDEX TABLE ${t}`;'],
    ['a COMMENT ON', 'const Q = `COMMENT ON TABLE ${t} IS x`;'],
    ['a bracket call of query', 'pool["query"](`${text}`, []);'],
    ['a bracket call with single quotes', "pool['query'](`${text}`, []);"],
    ['an optional call of query', 'pool?.query(`${text}`, []);'],
    ['a bracket call on a call result', 'getPool()["query"](`${text}`);'],
    ['a COPY TO STDOUT outside query()', 'const Q = `COPY ${t} TO STDOUT`;'],
    ['a lower-case copy to stdout', 'const Q = `copy ${t} (a, b) to stdout with csv`;'],
    ['a COPY FROM STDIN', 'const Q = `COPY ${t} FROM STDIN`;'],
    ['a COPY over lines', 'const Q = `COPY ${t}\n  TO PROGRAM ${cmd}`;'],
    ['a COPY to a server file', "const Q = `COPY ${t} TO '/tmp/out.csv'`;"],
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
    [
      'a message with the word copy',
      'const m = `Failed to copy ${count} files to the output folder.`;',
    ],
    ['a concatenation of constants', "const Q = 'SELECT a FROM t ' + 'WHERE id = $1';"],
  ])('%s', (_label, source) => {
    expect(findSqlTemplates(source)).toEqual([]);
  });
});
