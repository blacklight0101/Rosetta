import type { SqlVerb } from '../../../domain/code-map/vocabulary.js';

// RF-103: the words that make text a SQL statement. No regular expression runs over file content:
// every function here works on a string that is already cut to a few hundred or thousand
// characters, and uses plain string methods.

/** The longest line the SQL extractors look at; the rest of a longer line is ignored. */
const maxLineLength = 4000;
/**
 * The longest statement text the scan keeps. The code map records 500 characters (data-model 3.4),
 * counted after masking, so the scan keeps more for the masker to see.
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

// An XML element whose name ends in a password name, opened on the last line and not closed: the
// masker needs the closing tag (its value may hold spaces), so a cut inside it would keep the value.
const openPasswordElement =
  /<[\w.:-]{0,32}?(?:password|passwd|pwd)(?:[ \t][^<>\r\n]{0,256})?>[^<\s][^<\r\n]*$/iu;

/**
 * RF-141: `text` cut to at most `length` characters, never inside a word. When the cut falls inside
 * a run without white space, that whole run is dropped. Every masker rule either matches inside one
 * such run (keys, connection URLs, `password=value`) or, once its keyword is in the text, runs to
 * the end of the text (private key blocks, quoted values, `;Password=` settings). The XML password
 * element is the one exception: its value may hold spaces and it ends at its closing tag, so a cut
 * between the opening tag and the closing tag drops the open element with its value. So the masker
 * finds in the kept prefix every secret character it would find in the whole text, and a secret
 * whose end (for example the `@` of a connection URL) was cut away is never kept in part. A wider
 * window alone cannot give this: masking shortens the text, so the cut end can reach the output.
 */
export function cutAtWord(text: string, length: number): string {
  if (text.length <= length) return text;
  let end = length;
  if (!/\s/u.test(text.charAt(length))) {
    while (end > 0 && !/\s/u.test(text.charAt(end - 1))) end -= 1;
  }
  const kept = text.slice(0, end);
  const open = openPasswordElement.exec(kept.slice(kept.lastIndexOf('\n') + 1));
  if (open !== null) return kept.slice(0, kept.length - open[0].length).trimEnd();
  return end === length ? kept : kept.trimEnd();
}

/** A line cut to the length the extractors look at, never inside a word. */
export function cutLine(line: string): string {
  return cutAtWord(line, maxLineLength);
}

/** The text with every run of white space replaced by one space, and trimmed. */
function collapse(text: string): string {
  return text
    .split(/\s+/u)
    .filter((word) => word !== '')
    .join(' ');
}

/** The statement text as it is recorded: both cuts end at a word (see `cutAtWord`). */
export function statementText(text: string): string {
  return cutAtWord(collapse(cutAtWord(text, statementWindow * 2)), statementWindow);
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
