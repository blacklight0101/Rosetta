import type { Citation } from '../cards/citation.js';
import type { LegacySource, TargetDataModel } from './data-model.js';
import type { PlanContent, PlanTask } from './plan-content.js';
import type { SourceCard } from './plan-sources.js';
import type { FormulaRow, WorkbookFormulas } from './workbook-formulas.js';

// RF-623, RF-631, P3-94: which formula rows a target column, a citation and a task card are tied
// to. A column is tied by the name of its legacy field to a calculated column of a table (the
// formula rows that fill it); a rule card by the lines of `formulas.md` it cites; a task card by
// the tables it builds and the rules its requirements come from. Nothing is guessed: a name that
// two tables share and the claim does not tell apart links neither.

const sameName = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

function tableKey(row: FormulaRow): string {
  return `${row.folder}\u0000${row.table ?? ''}`;
}

function citationsOfClaim(sources: readonly SourceCard[], legacy: LegacySource): Citation[] {
  const card = sources.find((each) => each.id === legacy.cardId);
  const claim = card?.claims.find((each) => each.claimId === legacy.claimId);
  return [...(claim?.citations ?? [])];
}

/** The rows of the calculated table column a legacy field names; none for a field no column matches. */
// RF-623
export function formulasOfColumn(
  formulas: WorkbookFormulas | undefined,
  sources: readonly SourceCard[],
  legacy: LegacySource | null,
): readonly FormulaRow[] {
  if (formulas === undefined || legacy === null || legacy.field.trim() === '') return [];
  const named = formulas.rows.filter(
    (row) => row.column !== undefined && sameName(row.column, legacy.field),
  );
  if (new Set(named.map(tableKey)).size <= 1) return named;
  const cited = citationsOfClaim(sources, legacy);
  const inCited = named.filter((row) =>
    cited.some((each) => each.path.startsWith(`${row.folder}/`)),
  );
  return new Set(inCited.map(tableKey)).size === 1 ? inCited : [];
}

/** The rows whose rendered lines a citation covers. */
// RF-631
export function formulasCitedBy(
  formulas: WorkbookFormulas | undefined,
  citations: readonly Citation[],
): readonly FormulaRow[] {
  return (formulas?.rows ?? []).filter(({ source }) =>
    citations.some(
      (each) =>
        each.path === source.path &&
        each.startLine <= source.endLine &&
        each.endLine >= source.startLine,
    ),
  );
}

export interface TaskFormulaParts {
  readonly requirements: PlanContent['requirements'];
  readonly sources: readonly SourceCard[];
  readonly dataModel: TargetDataModel;
}

function builtColumns(task: PlanTask, dataModel: TargetDataModel) {
  const built = new Set(
    task.builds.filter((id) => id.startsWith('table:')).map((id) => id.slice(6)),
  );
  return dataModel.tables
    .filter((table) => built.has(table.name))
    .flatMap((table) => table.columns);
}

function ruleCitations(task: PlanTask, parts: TaskFormulaParts): Citation[] {
  const cards = new Set(
    parts.requirements
      .filter((requirement) => task.requirements.includes(requirement.id))
      .flatMap((requirement) => requirement.sources),
  );
  return parts.sources
    .filter((card) => card.type === 'BR' && cards.has(card.id))
    .flatMap((card) => card.claims)
    .filter((claim) => claim.status === 'Supported')
    .flatMap((claim) => claim.citations);
}

/** The rows a task card links: the calculated columns of the tables it builds and the formulas its rules cite. */
// RF-631
export function formulasOfTask(
  formulas: WorkbookFormulas | undefined,
  task: PlanTask,
  parts: TaskFormulaParts,
): readonly FormulaRow[] {
  if (formulas === undefined) return [];
  const linked = new Set(
    [
      ...builtColumns(task, parts.dataModel).flatMap((column) =>
        formulasOfColumn(formulas, parts.sources, column.legacy),
      ),
      ...formulasCitedBy(formulas, ruleCitations(task, parts)),
    ].map((row) => row.id),
  );
  return formulas.rows.filter((row) => linked.has(row.id));
}
