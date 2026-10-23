import type { PackEntity } from '../../../application/ports/language-pack.js';
import type { SqlStatement } from './scan-types.js';

// RF-103: candidate entities from the table names in SQL strings, for every language. The name
// after INSERT INTO, UPDATE, DELETE FROM, FROM and JOIN is a candidate (a comma list after FROM
// gives each table). No regular expression runs over file content: the statement text is already
// cut and collapsed, and the words are read with plain string methods.

const maxNameCharacters = 200;
const keywords = new Set(['into', 'from', 'join', 'update']);
/** Words that follow a table name and are neither an alias nor another table. */
const stops = new Set([
  'where',
  'set',
  'values',
  'value',
  'on',
  'using',
  'inner',
  'left',
  'right',
  'full',
  'cross',
  'outer',
  'join',
  'group',
  'order',
  'having',
  'union',
  'select',
  'limit',
  'for',
  'output',
  'default',
  'with',
]);
// English words that follow FROM, INTO or JOIN in a sentence, never a table name.
const prose = [
  'the a an this that these those your my our their its his her all each any some every no',
  'it them you we they me us what which who list options option cart menu form page file below above',
  'here there one other another more less',
].join(' ');
const notTables = new Set([
  ...stops,
  ...prose.split(' '),
  'dual',
  'only',
  'top',
  'distinct',
  'lateral',
  'table',
]);

function isIdentifier(text: string): boolean {
  if (text === '' || /\d/u.test(text.charAt(0))) return false;
  for (const char of text) {
    if (!/[\p{L}\p{N}_]/u.test(char)) return false;
  }
  return true;
}

/** `[dbo].[tblThing](` gives `tblThing`; undefined for a subquery, a variable or a keyword. */
function tableName(word: string): string | undefined {
  const bare = word.split('(')[0] ?? '';
  const last =
    bare
      .replaceAll(/[[\])"`;,]/gu, '')
      .split('.')
      .pop() ?? '';
  if (!isIdentifier(last) || notTables.has(last.toLowerCase())) return undefined;
  return last.slice(0, maxNameCharacters);
}

/** How many words to move on to reach the next table of a comma list; 0 when the list ends. */
function stepToNextTable(words: readonly string[], at: number): number {
  const next = words[at + 1] ?? '';
  // `a x, b y`: after the table comes an optional alias, then a comma starts the next table.
  const afterAlias = words[at + 2] ?? '';
  const commaNext = next.endsWith(',');
  const commaAfterAlias = afterAlias === ',' || (isIdentifier(next) && afterAlias.startsWith(','));
  if ((words[at] ?? '').endsWith(',')) return 1;
  if (commaNext) return 2;
  return commaAfterAlias ? 3 : 0;
}

function tablesAfter(words: readonly string[], start: number): string[] {
  const found: string[] = [];
  let at = start;
  for (;;) {
    const name = tableName(words[at] ?? '');
    if (name !== undefined) found.push(name);
    const step = stepToNextTable(words, at);
    if (step === 0) return found;
    at += step;
  }
}

function tablesOf(text: string): string[] {
  const words = text.split(' ');
  const found: string[] = [];
  words.forEach((word, index) => {
    const keyword = word.toLowerCase();
    // `FOR UPDATE` and `ON UPDATE` are not a table: UPDATE counts only as the first word.
    if (keywords.has(keyword) && (keyword !== 'update' || index === 0)) {
      found.push(...tablesAfter(words, index + 1));
    }
  });
  return found;
}

/** `SELECT` list: one word, or a list with a comma, `*`, a call, `AS` or `DISTINCT`/`TOP`. */
function selectShape(words: readonly string[]): boolean {
  const from = words.indexOf('from');
  if (from < 2) return false;
  const list = words.slice(1, from);
  const joined = list.join(' ');
  const marked = [',', '*', '('].some((mark) => joined.includes(mark));
  return list.length === 1 || marked || ['as', 'distinct', 'top'].some((w) => list.includes(w));
}

/**
 * Whether a statement has the shape of its verb, so a sentence such as `Select a file from the
 * list` is not read as SQL: `SELECT cols FROM`, `INSERT INTO`, `UPDATE t SET x =`, `DELETE FROM`.
 */
function hasShape(statement: SqlStatement): boolean {
  const words = statement.text.toLowerCase().split(' ');
  switch (statement.verb) {
    case 'SELECT':
      return selectShape(words);
    case 'INSERT':
      return words[1] === 'into';
    case 'UPDATE': {
      const set = words.indexOf('set');
      return (
        (set === 2 || set === 3) &&
        words
          .slice(set + 1)
          .join(' ')
          .includes('=')
      );
    }
    case 'DELETE':
      return words[1] === 'from';
    case 'CREATE':
    case 'EXEC':
      return false;
  }
}

/** One candidate per table name and file, at the first statement that names it. */
export function entitiesFromSql(statements: readonly SqlStatement[]): PackEntity[] {
  const seen = new Set<string>();
  const entities: PackEntity[] = [];
  for (const statement of statements.filter(hasShape)) {
    for (const name of tablesOf(statement.text)) {
      const key = `${statement.path}\n${name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entities.push({
        name,
        path: statement.path,
        startLine: statement.line,
        source: `sql:${statement.verb}`,
      });
    }
  }
  return entities;
}
