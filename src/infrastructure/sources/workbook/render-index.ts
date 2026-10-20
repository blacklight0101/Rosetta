import type { MacroStatus, RenderedMacros } from './render-macros.js';
import { TextFile, type ByteBudget } from './render-output.js';
import type { WorkbookModel, WorkbookSheet } from './workbook-model.js';
import { NAME_CAP, quoteText, splitText } from './workbook-text.js';

// RF-152, Q-35, Q-38, Q-39, RFC-005 section 4.4: `workbook.md`. Its first table maps every safe
// folder name to the real name of the workbook or sheet (a reader of the report reads the real name
// there: the third column of a row is a JSON string). Then sheets with visibility, used range and
// counts, defined names, tables, external links (file name only), data connections (no connection
// string), pivot tables and charts (listed, not drawn) and the macros. Every text from the file is a
// JSON string cut at its cap, and a list is cut at LIST_CAP rows with a note.

/** Rows of one list; more are counted. */
const LIST_CAP = 1000;
/** The escaped characters of one piece of a reference in a table row. */
const REFERS_CHUNK = 600;

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

/** The columns of each table, all of them, on lines that repeat the table they belong to. */
function addTableColumns(file: TextFile, entries: readonly SheetEntry[]): void {
  const tables = entries.flatMap((e) => e.sheet.tables.map((table) => ({ e, table })));
  if (tables.length === 0) return;
  file.section('## Table columns');
  file.add();
  for (const { e, table } of tables) {
    const columns = table.columns.map((column) => q(column));
    file.addWrapped(`- ${e.segment} ${q(table.name)}: `, columns, ', ');
  }
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
      (e, t) => [e.segment, q(t.name), q(t.range), String(t.columns.length)],
    ),
  );
  addTableColumns(file, entries);
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
  const pieces = (refersTo: string): string[] =>
    splitText(refersTo, REFERS_CHUNK, true, true).map((piece) => `"${piece}"`);
  addTable(
    file,
    '## Defined names',
    ['Name', 'Scope', 'Hidden', 'Refers to'],
    model.definedNames.map((n) => [
      q(n.name),
      scopeOf(n.sheet),
      n.hidden ? 'yes' : 'no',
      pieces(n.refersTo)[0] ?? '""',
    ]),
  );
  const longer = model.definedNames.filter((n) => pieces(n.refersTo).length > 1);
  if (longer.length === 0) return;
  file.section('## Defined names, rest of long references');
  file.add();
  for (const n of longer.slice(0, LIST_CAP)) {
    for (const piece of pieces(n.refersTo).slice(1))
      file.add(`- ${q(n.name)} (continued): ${piece}`);
  }
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

const SKIPPED: Readonly<Record<Exclude<MacroStatus, 'written'>, string>> = {
  locked: 'skipped, project locked',
  'no-source': 'skipped, compiled code only',
  unreadable: 'skipped, unreadable',
};

function macroState(model: WorkbookModel, macros: RenderedMacros): string {
  const project = model.macros;
  if (project === undefined) {
    return model.hasMacros
      ? '- This workbook holds a VBA project that was not read.'
      : '- No VBA project.';
  }
  const name = project.name === undefined ? '' : ` ${q(project.name)}`;
  if (project.state === 'locked') {
    return `- The VBA project${name} is locked for viewing; its modules are named and skipped (Q-40).`;
  }
  if (project.state === 'unreadable') {
    const reason = quoteText(project.reason ?? 'unknown', 300);
    return `- The VBA project${name} could not be read: ${reason}`;
  }
  return `- VBA project${name}: ${String(macros.written)} modules written, ${String(macros.skipped)} skipped.`;
}

/** The macros of the workbook: the state of the project, its modules and its form controls. */
function addMacros(file: TextFile, model: WorkbookModel, macros: RenderedMacros): void {
  file.section('## Macros');
  file.add();
  file.add(macroState(model, macros));
  addTable(
    file,
    '## Macro modules',
    ['File', 'Kind', 'Lines', 'Status', 'Real name'],
    macros.entries.map((m) => [
      m.file === undefined ? '-' : `macros/${m.file}`,
      m.module.kind,
      m.status === 'written' ? String(m.lines) : '-',
      m.status === 'written' ? 'written' : SKIPPED[m.status],
      q(m.module.name),
    ]),
  );
  const controls = model.macros?.formControls ?? [];
  if (controls.length === 0) return;
  file.section('## Form controls');
  file.add();
  for (const c of controls.slice(0, LIST_CAP))
    file.add(`- ${q(c.form)} ${q(c.name)}: ${q(c.type)}`);
  if (controls.length > LIST_CAP)
    file.add(`- ${String(controls.length - LIST_CAP)} more not listed`);
}

export interface IndexInput {
  readonly model: WorkbookModel;
  /** The folder of the workbook, the segment of its own name. */
  readonly folder: string;
  readonly entries: readonly SheetEntry[];
  readonly version: string;
  readonly macros: RenderedMacros;
}

export function renderIndex(input: IndexInput, budget: ByteBudget): string {
  const { model, folder, entries, version, macros } = input;
  const file = new TextFile(budget);
  addHeader(file, model, version, entries);
  addTable(
    file,
    '## Names',
    ['Segment', 'Kind', 'Real name'],
    [
      [folder, 'workbook', q(model.fileName)],
      ...entries.map((e) => [e.segment, 'sheet', q(e.sheet.name)]),
      ...macros.entries.flatMap((m) =>
        m.file === undefined ? [] : [[`macros/${m.file}`, 'macro', q(m.module.name)]],
      ),
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
  addMacros(file, model, macros);
  return file.text();
}
