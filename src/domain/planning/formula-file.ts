import {
  headingTable,
  parseNote,
  splitNote,
  unquoted,
  type ParsedNote,
  type ParsedValue,
  valueOf,
  type TableColumnName,
} from './formula-note.js';

// RF-152, P3-94: one rendered `formulas.md` read back as text. The file is a title, then sections:
// a region (a run of formulas down a column, or a shared formula) with its heading, the single
// cells, the array formulas, the data tables. Each formula is a line `D2 = text    [note]` that
// continues on lines starting with the same address; nothing is run. Lines are numbered from 1, as
// a citation numbers them.

export interface RawCell {
  /** The address of the cell, or the range of a shared or array formula. */
  readonly head: string;
  readonly formula: string;
  readonly note: ParsedNote;
  /** The example cells that follow a formula filled down (P3-103), with their cached results. */
  readonly examples: readonly RawExample[];
  readonly startLine: number;
  readonly endLine: number;
}

interface RawExample {
  readonly address: string;
  readonly value: ParsedValue;
}

export interface RawSection {
  readonly kind: 'region' | 'single' | 'shared' | 'array';
  readonly headingLine: number;
  /** The range in the heading of a region; empty for the other sections. */
  readonly range: string;
  readonly table: TableColumnName | undefined;
  readonly cells: RawCell[];
}

export interface ParsedFile {
  /** The sheet named in the title, when the file has one. */
  readonly sheet: string | undefined;
  readonly sections: readonly RawSection[];
}

const TITLE = /^# Formulas of sheet (".*")$/u;
const REGION = /^## Region (\S+) \(\d+ formulas?\)(.*)$/u;
const SHARED = /^## Region (\S+) \(shared formula(?:, \d+ cells)?\)(.*)$/u;
const HEAD = /^(\S+) (= |\{= )(.*)$/u;
const CONTINUED = /^\S+ \(continued\) (.*)$/u;
const EXAMPLE = /^(\S+) \(example\) (.*)$/u;
const CACHED_CONTINUED = /^\S+ \(cached, continued\) (.*)$/u;

function section(kind: RawSection['kind'], headingLine: number, rest = {}): RawSection {
  return { kind, headingLine, range: '', table: undefined, cells: [], ...rest };
}

/** The section a heading opens; undefined for a heading whose lines are not read. */
function headingOf(line: string, number: number): RawSection | undefined {
  const shared = SHARED.exec(line);
  if (shared?.[1] !== undefined) {
    return section('shared', number, { range: shared[1], table: headingTable(shared[2]) });
  }
  const region = REGION.exec(line);
  if (region?.[1] !== undefined) {
    return section('region', number, { range: region[1], table: headingTable(region[2]) });
  }
  if (line.startsWith('## Single cells')) return section('single', number);
  return line === '## Array formulas' ? section('array', number) : undefined;
}

/** A formula being read: its chunks so far, and its note once the last chunk is in. */
interface Building {
  readonly head: string;
  readonly array: boolean;
  readonly chunks: string[];
  readonly startLine: number;
  endLine: number;
  note: string | undefined;
  /** The text of a long cached value that came on lines of its own. */
  readonly extra: string[];
  /** The example cells that came on lines of their own. */
  readonly examples: RawExample[];
}

function take(building: Building, chunk: string, number: number): void {
  const { text, note } = splitNote(chunk);
  building.chunks.push(note !== undefined && building.array ? text.replace(/\}$/u, '') : text);
  building.note = note;
  building.endLine = number;
}

function finish(building: Building): RawCell {
  const parsed = parseNote(building.note);
  const extra = building.extra.map((piece) => unquoted(piece) ?? piece).join('');
  const { cached } = parsed;
  const note: ParsedNote =
    cached === undefined || extra === ''
      ? parsed
      : { ...parsed, cached: { kind: 'text', text: `${cached.text}${extra}` } };
  return {
    ...{ head: building.head, formula: building.chunks.join(''), note },
    examples: building.examples,
    ...{ startLine: building.startLine, endLine: building.endLine },
  };
}

/** A line that goes on with the formula being read: more text, more of a cached text, or an example. */
function addLine(building: Building, line: string, number: number): void {
  const more = CONTINUED.exec(line)?.[1];
  const cached = CACHED_CONTINUED.exec(line)?.[1];
  const example = EXAMPLE.exec(line);
  if (more !== undefined) take(building, more, number);
  else if (cached !== undefined) building.extra.push(cached);
  else if (example?.[1] !== undefined && example[2] !== undefined) {
    building.examples.push({ address: example[1], value: valueOf(example[2]) });
    building.endLine = number;
  }
}

/** Adds one line of a section to the formula being read, or starts the next one. */
function feed(open: RawSection, building: Building | undefined, line: string, number: number) {
  const head = HEAD.exec(line);
  if (head?.[1] !== undefined && head[3] !== undefined) {
    if (building !== undefined) open.cells.push(finish(building));
    const next: Building = {
      ...{ head: head[1], array: head[2] === '{= ', chunks: [], startLine: number },
      ...{ endLine: number, note: undefined, extra: [], examples: [] },
    };
    take(next, head[3], number);
    return next;
  }
  if (building !== undefined) addLine(building, line, number);
  return building;
}

export function parseFormulaFile(text: string): ParsedFile {
  const sections: RawSection[] = [];
  let open: RawSection | undefined;
  let building: Building | undefined;
  const close = (): void => {
    if (open !== undefined && building !== undefined) open.cells.push(finish(building));
    building = undefined;
  };
  const lines = text.split('\n');
  lines.forEach((line, index) => {
    if (line.startsWith('## ') || line === '') {
      close();
      open = line === '' ? undefined : headingOf(line, index + 1);
      if (open !== undefined) sections.push(open);
    } else if (open !== undefined) {
      building = feed(open, building, line, index + 1);
    }
  });
  close();
  const title = TITLE.exec(lines[0] ?? '')?.[1];
  return { sheet: title === undefined ? undefined : unquoted(title), sections };
}
