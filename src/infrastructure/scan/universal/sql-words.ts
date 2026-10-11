import type { SqlVerb } from '../../../domain/code-map/vocabulary.js';

// RF-103: the words that make text a SQL statement. No regular expression runs over file content:
// every function here works on a string that is already cut to a few hundred or thousand
// characters, and uses plain string methods.

/** The longest line the SQL extractors look at; the rest of a longer line is ignored. */
const maxLineLength = 4000;
/**
 * The longest statement text the scan keeps. The code map records 500 characters (data-model 3.4),
 * but only after masking: a secret that straddles character 500 must be seen whole by the masker,
 * and the longest secret pattern is 512 characters plus its look-ahead, so the window is wider.
 */
export const statementWindow = 1536;
/** The most statements kept per file, so one huge script cannot flood the code map. */
export const maxStatementsPerFile = 1000;

const verbs: ReadonlyMap<string, SqlVerb> = new Map([
  ['select', 'SELECT'],
  ['insert', 'INSERT'],
  ['update', 'UPDATE'],
  ['delete', 'DELETE'],
  ['exec', 'EXEC'],
  ['execute', 'EXEC'],
  ['create', 'CREATE'],
]);

const createdObjects: ReadonlySet<string> = new Set([
  'table',
  'view',
  'procedure',
  'proc',
  'index',
  'unique',
  'clustered',
  'database',
  'function',
  'trigger',
  'schema',
  'sequence',
]);

/** A line cut to the length the extractors look at. */
export function cutLine(line: string): string {
  return line.slice(0, maxLineLength);
}

/** The text with every run of white space replaced by one space, and trimmed. */
function collapse(text: string): string {
  return text
    .split(/\s+/u)
    .filter((word) => word !== '')
    .join(' ');
}

/** The statement text as it is recorded. */
export function statementText(text: string): string {
  return collapse(text.slice(0, statementWindow * 2)).slice(0, statementWindow);
}

/** The verb a text starts with (after leading white space), in any letter case. */
export function leadingVerb(text: string): SqlVerb | undefined {
  const start = text.trimStart();
  let end = 0;
  while (end < start.length && /[a-z]/iu.test(start.charAt(end))) end += 1;
  const next = start.charAt(end);
  if (next !== '' && !/[\s(]/u.test(next)) return undefined;
  return verbs.get(start.slice(0, end).toLowerCase());
}

/**
 * Whether a text that starts with `verb` is SQL and not a sentence: `SELECT` and `DELETE` need
 * `FROM`, `INSERT` needs `INTO`, `UPDATE` needs `SET`, `CREATE` names an object, `EXEC` names a
 * procedure. `window` is the literal plus the literals that continue it.
 */
export function looksLikeSql(verb: SqlVerb, window: string): boolean {
  const words = collapse(window.slice(0, maxLineLength * 2)).toLowerCase();
  const padded = ` ${words} `;
  switch (verb) {
    case 'SELECT':
    case 'DELETE':
      return padded.includes(' from ');
    case 'INSERT':
      return padded.includes(' into ');
    case 'UPDATE':
      return padded.includes(' set ');
    case 'EXEC':
      return words.includes(' ');
    case 'CREATE':
      return createdObjects.has(words.split(' ')[1] ?? '');
  }
}
