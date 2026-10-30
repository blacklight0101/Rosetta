import type { ModelColumn, ModelTable, TargetDataModel } from '../../domain/planning/data-model.js';
import { unconfirmedType } from '../../domain/planning/data-model-names.js';
import type { SourceCard } from '../../domain/planning/plan-sources.js';
import type { DataModelProblem } from './data-model-answer.js';
import { baseOf } from './data-model-database.js';

// RF-623, P7-13, EV-75: a character column is long enough for the longest value its sources list.
// The values come from a list the sources state: "accepts only A, B or C", "one of A, B or C", "list
// validation A,B,C", "allowed values: A, B", an enum, quoted constants; and from the table's own
// checks ("movement_type is IN or OUT"). A list belongs to a column when its claim names the column
// (its name or its legacy field) or when it shares two values with what the table's checks say the
// column holds. A shorter length is widened to the longest value and noted; a length that fits, a
// type without a length (`max`, `text`) and a column no list belongs to are left alone. Claims are
// untrusted text: each is cut to a bound and read by flat patterns.

const MAX_TEXT = 2000;
const MAX_VALUE = 40;
const MAX_WORDS = 4;
const characterTypes = new Set(['char', 'varchar', 'nchar', 'nvarchar']);
const sized = /^([A-Za-z ]+)\((\d{1,5})\)$/u;
const cue =
  /(?:accepts only|allows only|only allows|one of|from (?:a|the) list|list validation|allowed values?|valid values?|values?:|enum(?:eration)?)\s*:?\s*([^.;\n]*)/giu;
const isCue = /\bis\b\s*([^.;\n]*)/iu;

function itemsOf(segment: string): string[] {
  const text = segment.replace(/\s+from (?:a|the) list.*$/iu, '');
  const quoted = [...text.matchAll(/(?<![A-Za-z])['"]([^'"]{1,40})['"](?![A-Za-z])/gu)];
  const raw =
    quoted.length > 1
      ? quoted.map((match) => match[1] ?? '')
      : text.split(/\s*,\s*|\s+or\s+|\s+and\s+/iu);
  const items = raw.map((item) => item.trim().replace(/^[('"]+|[)'".]+$/gu, ''));
  const fine = items.every(
    (item) => item !== '' && item.length <= MAX_VALUE && item.split(/\s+/u).length <= MAX_WORDS,
  );
  return fine && items.length > 1 ? items : [];
}

/** The value lists a text states; a list has at least two values. */
function listsIn(text: string, withIs: boolean): string[][] {
  const bounded = text.slice(0, MAX_TEXT);
  const segments = [...bounded.matchAll(cue)].map((match) => match[1] ?? '');
  const own = withIs && segments.length === 0 ? [isCue.exec(bounded)?.[1] ?? ''] : [];
  return [...segments, ...own].map(itemsOf).filter((items) => items.length > 0);
}

function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
}

/** Whether the text names the column by its name (also with spaces for underscores) or its legacy field. */
function names(text: string, column: ModelColumn): boolean {
  const variants = [column.name, column.name.replaceAll('_', ' '), column.legacy?.field ?? '']
    .filter((each) => each.length >= 3)
    .map(escaped);
  return (
    variants.length > 0 &&
    new RegExp(`(?<![a-z0-9])(?:${variants.join('|')})(?![a-z0-9])`, 'iu').test(text)
  );
}

function overlaps(list: readonly string[], known: readonly string[]): boolean {
  const wanted = new Set(known.map((each) => each.toLowerCase()));
  return list.filter((each) => wanted.has(each.toLowerCase())).length >= 2;
}

/** The longest value the sources list for the column; 0 when no list belongs to it. */
function longestValue(column: ModelColumn, table: ModelTable, texts: readonly string[]): number {
  const own = table.checks.filter((check) => names(check, column));
  const known = own.flatMap((check) => listsIn(check, true)).flat();
  const lists = [
    ...own.flatMap((check) => listsIn(check, true)),
    ...texts.flatMap((text) =>
      listsIn(text, false).filter((list) => names(text, column) || overlaps(list, known)),
    ),
  ];
  return Math.max(0, ...lists.flat().map((value) => value.length));
}

function widened(
  column: ModelColumn,
  need: number,
): { column: ModelColumn; reason: string } | null {
  const match = sized.exec(column.type.trim());
  const [, prefix = '', size = ''] = match ?? [];
  if (match === null || !characterTypes.has(baseOf(prefix)) || Number(size) >= need) return null;
  const reason = `The length ${size} cannot hold the longest value the sources list (${String(need)} characters), so the length is widened to ${String(need)}.`;
  return { column: { ...column, type: `${prefix.trim()}(${String(need)})` }, reason };
}

// RF-623, P7-13
export function fitLengths(
  model: TargetDataModel,
  cards: readonly SourceCard[],
): { readonly model: TargetDataModel; readonly problems: DataModelProblem[] } {
  const texts = cards.flatMap((card) =>
    card.claims.filter((claim) => claim.status === 'Supported').map((claim) => claim.text),
  );
  const problems: DataModelProblem[] = [];
  const tableOf = (table: ModelTable): ModelTable => ({
    ...table,
    columns: table.columns.map((column) => {
      const fitted = widened(column, longestValue(column, table, texts));
      if (fitted === null) return column;
      const field = `table ${table.name} columns`;
      problems.push({ item: column.name, field, reason: fitted.reason });
      return fitted.column;
    }),
  });
  return { model: { ...model, tables: model.tables.map(tableOf) }, problems };
}

/** The columns still typed "to confirm": no type name from the planner and none in the legacy claim. */
// RF-623, P7-13
export function unconfirmedTypes(model: TargetDataModel): DataModelProblem[] {
  return model.tables.flatMap((table) =>
    table.columns
      .filter((column) => column.type === unconfirmedType)
      .map((column) => ({
        ...{ item: column.name, field: `table ${table.name} columns` },
        reason: `The type is "${unconfirmedType}": the planner gave no type name and the legacy claim names none, so choose one.`,
      })),
  );
}
