// RF-152, P3-94: the notes of `formulas.md`. A formula line ends in a note in square brackets that
// says what the renderer knew of it: the table column of a single formula, `array`, `written for
// D2` of a shared formula, and the cached result (`cached: 5`, or `cached D2: 5`). The heading of a
// region carries the table column too (`, InvoiceTable column "Total"`). The file is read as text;
// nothing here is run.

export interface ParsedValue {
  /** `text` is a cell's text, which can hold anything; `plain` is a number, date, boolean or error. */
  readonly kind: 'text' | 'plain';
  readonly text: string;
}

export interface TableColumnName {
  readonly table: string;
  readonly column: string;
}

export interface ParsedNote {
  readonly table?: TableColumnName;
  readonly cached?: ParsedValue;
}

const JSON_TEXT = '"(?:[^"\\\\]|\\\\.)*"';
const NAME = '[A-Za-z_][A-Za-z0-9_.]*';
const TABLE_COLUMN = new RegExp(`^(?:(${NAME})|(${JSON_TEXT})) column (${JSON_TEXT})`, 'u');
/** How a note starts; the line is split at the first `    [` whose rest is a note. */
const NOTE_START = new RegExp(
  `^(?:cached|no cached value|array|data table|written for |(?:${NAME}|${JSON_TEXT}) column )`,
  'u',
);
const NUMBER = /^-?\d+(?:\.\d+)?(?:E[+-]?\d+)?$/iu;
const DATE = /^\d{4}-\d{2}-\d{2}(?:T[0-9:.]{1,20}(?:Z|[+-]\d{2}:\d{2})?)?$/u;
const OTHER = /^(?:TRUE|FALSE|#[A-Z0-9/!?]{1,10})$/u;
const CACHED = /(?:^|; )cached(?: [A-Za-z]{1,3}[1-9][0-9]{0,6})?: ([\s\S]*)$/u;

/** A JSON string written by the renderer, or undefined when the text is not one. */
export function unquoted(text: string): string | undefined {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === 'string' ? value : undefined;
  } catch {
    return undefined;
  }
}

/** The table column of a heading or a note: `InvoiceTable column "Total"`. */
function tableColumnOf(text: string): { name: TableColumnName; length: number } | undefined {
  const match = TABLE_COLUMN.exec(text);
  if (match?.[3] === undefined) return undefined;
  const table = match[1] ?? unquoted(match[2] ?? '');
  const column = unquoted(match[3]);
  return table === undefined || column === undefined
    ? undefined
    : { name: { table, column }, length: match[0].length };
}

/** The table column a region heading names after its count, or undefined for none. */
export function headingTable(suffix: string | undefined): TableColumnName | undefined {
  return suffix?.startsWith(', ') === true ? tableColumnOf(suffix.slice(2))?.name : undefined;
}

/** A cached value as it is written: a JSON text, or a number, date, boolean or error as stored. */
export function valueOf(written: string): ParsedValue {
  if (written.startsWith('"')) return { kind: 'text', text: unquoted(written) ?? written };
  const plain = NUMBER.test(written) || DATE.test(written) || OTHER.test(written);
  return { kind: plain ? 'plain' : 'text', text: written };
}

/** A formula line split into its text and its note, or the whole line when it ends in none. */
export function splitNote(line: string): { text: string; note: string | undefined } {
  for (let at = line.indexOf('    ['); at >= 0; at = line.indexOf('    [', at + 1)) {
    const rest = line.slice(at + 5);
    if (rest.endsWith(']') && NOTE_START.test(rest)) {
      return { text: line.slice(0, at), note: rest.slice(0, -1) };
    }
  }
  return { text: line, note: undefined };
}

/** What a note says: the table column of a single formula and the cached result. */
export function parseNote(note: string | undefined): ParsedNote {
  if (note === undefined) return {};
  const where = tableColumnOf(note);
  const rest = where === undefined ? note : note.slice(where.length);
  const cached = CACHED.exec(rest);
  const table = where === undefined ? {} : { table: where.name };
  if (cached?.[1] === undefined) return table;
  return { ...table, cached: valueOf(cached[1]) };
}
