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
const notTables = new Set([...stops, 'dual', 'only', 'top', 'distinct', 'lateral', 'table']);

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

/** One candidate per table name and file, at the first statement that names it. */
export function entitiesFromSql(statements: readonly SqlStatement[]): PackEntity[] {
  const seen = new Set<string>();
  const entities: PackEntity[] = [];
  for (const statement of statements) {
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
