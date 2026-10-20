import { TextFile, type ByteBudget } from './render-output.js';
import type { WorkbookModel, WorkbookSheet } from './workbook-model.js';
import { NAME_CAP, quoteText } from './workbook-text.js';

// RF-152, Q-35, Q-38, Q-39, RFC-005 section 4.4: `workbook.md`. Its first table maps every safe
// folder name to the real name of the workbook or sheet (a reader of the report reads the real name
// there: the third column of a row is a JSON string). Then sheets with visibility, used range and
// counts, defined names, tables, external links (file name only), data connections (no connection
// string), pivot tables and charts (listed, not drawn) and the macros. Every text from the file is a
// JSON string cut at its cap, and a list is cut at LIST_CAP rows with a note.

/** Rows of one list; more are counted. */
const LIST_CAP = 1000;
const REFERS_CAP = 300;
const COLUMNS_LISTED = 30;
const COLUMN_CAP = 60;

export interface SheetEntry {
  readonly sheet: WorkbookSheet;
  readonly segment: string;
  readonly formulas: number;
}

const q = (text: string, max: number = NAME_CAP): string => quoteText(text, max, { pipes: true });

function addTable(
  file: TextFile,
  heading: string,
  head: readonly string[],
  rows: readonly (readonly string[])[],
): void {
  file.section(heading);
  file.add();
  if (rows.length === 0) {
    file.add('None.');
    return;
  }
  file.add(`| ${head.join(' | ')} |`);
  file.add(`|${head.map(() => '---').join('|')}|`);
  for (const row of rows.slice(0, LIST_CAP)) file.add(`| ${row.join(' | ')} |`);
  if (rows.length > LIST_CAP) {
    file.add();
    file.add(`- ${String(rows.length - LIST_CAP)} more not listed`);
  }
}

/** The file name of an external link target, whatever folder the file named. */
function baseName(path: string): string {
  return path.split(/[\\/]/u).at(-1) ?? path;
}

function columnsText(columns: readonly string[]): string {
  const shown = columns.slice(0, COLUMNS_LISTED).map((column) => q(column, COLUMN_CAP));
  const more = columns.length - shown.length;
  return more > 0 ? `${shown.join(', ')}, ... (+${String(more)} more)` : shown.join(', ');
}

function addSheetLists(file: TextFile, entries: readonly SheetEntry[]): void {
  const each = <T>(
    pick: (s: WorkbookSheet) => readonly T[],
    row: (e: SheetEntry, t: T) => string[],
  ) => entries.flatMap((e) => pick(e.sheet).map((item) => row(e, item)));
  addTable(
    file,
    '## Tables',
    ['Sheet', 'Table', 'Range', 'Columns'],
    each(
      (s) => s.tables,
      (e, t) => [e.segment, q(t.name), q(t.range), columnsText(t.columns)],
    ),
  );
  addTable(
    file,
    '## Pivot tables',
    ['Sheet', 'Pivot table', 'Range'],
    each(
      (s) => s.pivots,
      (e, p) => [e.segment, q(p.name), p.range === undefined ? '-' : q(p.range)],
    ),
  );
  addTable(
    file,
    '## Charts',
    ['Sheet', 'Chart'],
    each(
      (s) => s.charts,
      (e, chart) => [e.segment, q(chart)],
    ),
  );
}

function addNames(file: TextFile, model: WorkbookModel, entries: readonly SheetEntry[]): void {
  const scopeOf = (name: string | undefined): string => {
    if (name === undefined) return 'workbook';
    return entries.find((e) => e.sheet.name === name)?.segment ?? q(name);
  };
  addTable(
    file,
    '## Defined names',
    ['Name', 'Scope', 'Hidden', 'Refers to'],
    model.definedNames.map((n) => [
      q(n.name),
      scopeOf(n.sheet),
      n.hidden ? 'yes' : 'no',
      q(n.refersTo, REFERS_CAP),
    ]),
  );
}

function addLinks(file: TextFile, model: WorkbookModel): void {
  file.section('## External links');
  file.add();
  if (model.externalLinks.length === 0) file.add('None.');
  for (const link of model.externalLinks.slice(0, LIST_CAP)) {
    file.add(`- ${q(baseName(link.fileName))}`);
  }
  addTable(
    file,
    '## Data connections',
    ['Name', 'Type'],
    model.connections.map((c) => [
      q(c.name),
      c.sourceType === undefined ? '-' : String(c.sourceType),
    ]),
  );
}

function addHeader(
  file: TextFile,
  model: WorkbookModel,
  version: string,
  entries: readonly SheetEntry[],
): void {
  const cells = entries.reduce((sum, e) => sum + e.sheet.cells.length, 0);
  const formulas = entries.reduce((sum, e) => sum + e.formulas, 0);
  file.add(`# Workbook ${q(model.fileName)}`);
  file.add();
  file.add(`- Renderer version: ${version}`);
  file.add(`- Sheets: ${String(entries.length)}`);
  file.add(`- Non-empty cells: ${String(cells)}`);
  file.add(`- Formula cells: ${String(formulas)}`);
  file.add(`- Date system: ${model.date1904 ? '1904' : '1900'}`);
}

function sheetRow(e: SheetEntry): string[] {
  const { sheet } = e;
  return [
    e.segment,
    sheet.state,
    sheet.usedRange === undefined ? '-' : q(sheet.usedRange, 40),
    String(sheet.cells.length),
    String(e.formulas),
    String(sheet.comments.length),
    String(sheet.mergedRanges.length),
  ];
}

export interface IndexInput {
  readonly model: WorkbookModel;
  /** The folder of the workbook, the segment of its own name. */
  readonly folder: string;
  readonly entries: readonly SheetEntry[];
  readonly version: string;
}

export function renderIndex(input: IndexInput, budget: ByteBudget): string {
  const { model, folder, entries, version } = input;
  const file = new TextFile(budget);
  addHeader(file, model, version, entries);
  addTable(
    file,
    '## Names',
    ['Segment', 'Kind', 'Real name'],
    [
      [folder, 'workbook', q(model.fileName)],
      ...entries.map((e) => [e.segment, 'sheet', q(e.sheet.name)]),
    ],
  );
  addTable(
    file,
    '## Sheets',
    ['Segment', 'State', 'Used range', 'Cells', 'Formulas', 'Comments', 'Merged ranges'],
    entries.map(sheetRow),
  );
  addNames(file, model, entries);
  addSheetLists(file, entries);
  addLinks(file, model);
  file.section('## Macros');
  file.add();
  file.add(
    model.hasMacros
      ? '- This workbook holds a VBA project. Its macros are not read yet by this version of Rosetta.'
      : '- No VBA project.',
  );
  return file.text();
}
