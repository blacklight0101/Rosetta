import type { HandoffPackage } from '../../application/plan/handoff-package.js';
import { formatCitation } from '../../domain/cards/citation.js';
import type { LegacySource } from '../../domain/planning/data-model.js';
import type { PlanTask } from '../../domain/planning/plan-content.js';
import { formulasOfColumn, formulasOfTask } from '../../domain/planning/workbook-formula-links.js';
import type {
  FormulaRow,
  FormulaValue,
  WorkbookFormulas,
} from '../../domain/planning/workbook-formulas.js';
import type { MarkdownEscaper } from '../cards/markdown-text.js';
import type { TextMasker } from '../guards/secret-masker.js';
import { handoffFiles, idLink } from './handoff-links.js';

// RF-623, RF-631, RF-603, ADR-013, P3-94: `workbook-formulas.md`, the formulas of the rendered
// workbooks, and the links to its rows from the data model and the task cards. Code wrote every
// word of it from the rendered `formulas.md` files; the formula and the cached text come from the
// workbook, so they are masked, and the names are escaped like any other text of a stranger. A
// formula is shown in a code span that is longer than any backtick run in it. A cached number,
// date, boolean or error is kept as it is written: it was checked to be nothing else.

/** `[F-003](workbook-formulas.md#f-003)`, from a file at the root of the package. */
function formulaLink(row: FormulaRow): string {
  return idLink(row.id, handoffFiles.workbookFormulas);
}

function plural(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? '' : 's'}`;
}

/** The text in a code span with a fence longer than any run of backticks inside it. */
function codeSpan(text: string, masker: TextMasker): string {
  const body = masker.mask(text).text.replace(/\s+/gu, ' ').trim();
  const longest = Math.max(0, ...(body.match(/`+/gu) ?? []).map((run) => run.length));
  const fence = '`'.repeat(longest + 1);
  return longest === 0 ? `${fence}${body}${fence}` : `${fence} ${body} ${fence}`;
}

function valueText(value: FormulaValue, esc: MarkdownEscaper): string {
  const shown = value.kind === 'plain' ? value.text : `"${esc.inline(value.text)}"`;
  return `${esc.inline(value.address)} = ${shown}`;
}

function rangeText(row: FormulaRow, esc: MarkdownEscaper): string {
  const parts = [
    ...(row.cells > 1 ? [`${String(row.cells)} cells`] : []),
    ...(row.shape === 'shared' ? ['shared formula'] : []),
    ...(row.shape === 'array' ? ['array formula'] : []),
  ];
  const range = esc.inline(row.range);
  return parts.length === 0 ? range : `${range} (${parts.join(', ')})`;
}

function rowLines(row: FormulaRow, esc: MarkdownEscaper, masker: TextMasker): string[] {
  const column =
    row.table === undefined || row.column === undefined
      ? []
      : [`- Table column: ${esc.inline(row.table)}, "${esc.inline(row.column)}"`];
  const cached =
    row.cached.length === 0
      ? 'none stored'
      : row.cached.map((value) => valueText(value, esc)).join('; ');
  return [
    `#### ${row.id}`,
    '',
    `- Range: ${rangeText(row, esc)}`,
    ...column,
    `- Formula: ${codeSpan(row.formula, masker)}`,
    `- Cached results: ${cached}`,
    `- Lines: ${esc.inline(formatCitation(row.source))}`,
    '',
  ];
}

/** The heading lines that open a row when its workbook or its sheet is not the one before. */
function headingLines(
  row: FormulaRow,
  before: FormulaRow | undefined,
  esc: MarkdownEscaper,
): string[] {
  const sameBook = before?.workbook === row.workbook;
  const sameSheet = sameBook && before.sheet === row.sheet;
  return [
    ...(sameBook ? [] : [`## ${esc.inline(row.workbook)}`, '']),
    ...(sameSheet ? [] : [`### Sheet ${esc.inline(row.sheet)}`, '']),
  ];
}

function noteLines(formulas: WorkbookFormulas): string[] {
  const { omitted, unread } = formulas;
  const was = omitted === 1 ? 'was' : 'were';
  return [
    ...(omitted === 0
      ? []
      : [`${plural(omitted, 'formula')} ${was} left out because the file reached its limit.`, '']),
    ...(unread === 0
      ? []
      : [`${plural(unread, 'rendered formulas.md file')} could not be read.`, '']),
  ];
}

const intro =
  'The formulas of the rendered workbooks this package is planned from. Code read them out of the rendered `formulas.md` of each sheet; no model wrote this file. A row is one formula however many cells it fills, with the table column it fills, the references to the row of a table written as column names and up to three of the results Excel stored. A formula is text and is never run. Each row names the rendered lines that hold it.';

// RF-623, RF-631
export function workbookFormulasMarkdown(
  formulas: WorkbookFormulas,
  esc: MarkdownEscaper,
  masker: TextMasker,
): string {
  return [
    '# Workbook formulas',
    '',
    intro,
    '',
    ...noteLines(formulas),
    ...(formulas.rows.length === 0 ? ['The rendered workbooks hold no formula.', ''] : []),
    ...formulas.rows.flatMap((row, index) => [
      ...headingLines(row, formulas.rows[index - 1], esc),
      ...rowLines(row, esc, masker),
    ]),
  ].join('\n');
}

/** RF-623: the rows of the calculated table column a target column's legacy source names. */
export function columnFormulas(
  handoff: HandoffPackage,
): (legacy: LegacySource) => readonly FormulaRow[] {
  return (legacy) => formulasOfColumn(handoff.workbookFormulas, handoff.sources, legacy);
}

/** RF-631: `Formulas: F-003, F-005` for a task card that builds a calculated column or cites a formula. */
export function formulaLines(task: PlanTask, handoff: HandoffPackage): string[] {
  const rows = formulasOfTask(handoff.workbookFormulas, task, {
    requirements: handoff.content.requirements,
    sources: handoff.sources,
    dataModel: handoff.dataModel,
  });
  return rows.length === 0 ? [] : [`Formulas: ${rows.map(formulaLink).join(', ')}`, ''];
}

/** RF-623: the mark after a column's legacy source; empty for a column no formula fills. */
export function calculatedMark(rows: readonly FormulaRow[]): string {
  return rows.length === 0 ? '' : ` (calculated: ${rows.map(formulaLink).join(', ')})`;
}
