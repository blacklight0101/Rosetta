// RF-623, RF-630..RF-638, EV-31: columns the planner invented or repeated, taken out of a table
// before the domain checks it. Two kinds only, both decided from the table's own draft:
//  1. a placeholder name: `some_` followed by anything, or `field` / `column` followed by digits
//     (`field_3`, `column2`). `field_name`, `column_count`, `fields` and `someone_id` are real names
//     and stay;
//  2. a repeated copy: `x_N` (N is 2 or more) when the table also has a real column `x`, both
//     carry a legacy field with the same name (any claim, as repeated claims state it again) and
//     both have the same type. A copy without a legacy field, with another field or another type
//     may be a real second column (`address_2`, `phone_2`), so it stays.
// What is taken out is named in the problems, so checks.md lists it under "Data model".

interface Named {
  readonly name: string;
  readonly type: string;
  readonly legacy: { readonly field: string } | null;
}

/** A dropped part: its name, where it was, and why. */
interface Problem {
  readonly item: string;
  readonly field: string;
  readonly reason: string;
}

const PLACEHOLDER =
  'The column name is a placeholder (some_*, field_N or column_N), not a field of the legacy data, so the parser drops it.';
const REPEATED =
  'The column repeats an earlier column of the table (same legacy field and type), so the parser drops it.';
export const NO_REAL_COLUMN =
  'The table has only placeholder or repeated columns, so the parser drops it.';

const WORK =
  'The column name describes work (a metric used to derive a value, a range used for lookups), not a field of the legacy data, so the parser drops it.';

const placeholder = /^(?:some_.*|(?:field|column)_?\d+)$/iu;
// A name that says what the sheet or the code does with a value, not what the value is: `x_to_<verb>`,
// `x_used_to_`, `x_referenced_for_`, `lookup_range`; or a legacy field that is a cell range.
const work =
  /_(?:to|used_to|needed_to)_(?:derive|calculate|compute|determine|validate|check|apply|populate|generate|convert|identify)(?:_|$)|_(?:used|referenced|needed)_(?:for|by)_|(?:^|_)lookup_(?:range|table|list|values?)$/iu;
const cellRange = /\brange\s+[A-Z]{1,3}\d*:[A-Z]{1,3}\d*/iu;
const copy = /^(.+)_(\d+)$/u;

const same = (value: string): string => value.trim().toLowerCase();

function isPlaceholder(column: Named): boolean {
  return placeholder.test(column.name);
}

function isWork(column: Named): boolean {
  return work.test(column.name) || (column.legacy !== null && cellRange.test(column.legacy.field));
}

function isRepeat(column: Named, real: readonly Named[]): boolean {
  const match = copy.exec(column.name);
  const base = match?.[1];
  if (base === undefined || Number(match?.[2]) < 2 || column.legacy === null) return false;
  const own = column.legacy.field;
  return real.some(
    (other) =>
      other !== column &&
      other.name === base &&
      same(other.type) === same(column.type) &&
      other.legacy !== null &&
      same(other.legacy.field) === same(own),
  );
}

function problemOf(column: Named, where: string, reason: string): Problem {
  return { item: column.name, field: `${where} columns`, reason };
}

/** The columns left once placeholders and repeated copies are out; each one out is named in `problems`. */
// RF-623
export function withoutPlaceholders<T extends Named>(
  columns: readonly T[],
  where: string,
  problems: Problem[],
): T[] {
  const named = columns.filter((column) => !isPlaceholder(column) && !isWork(column));
  const kept = named.filter((column) => !isRepeat(column, named));
  for (const column of columns) {
    if (isPlaceholder(column)) problems.push(problemOf(column, where, PLACEHOLDER));
    else if (isWork(column)) problems.push(problemOf(column, where, WORK));
    else if (!kept.includes(column)) problems.push(problemOf(column, where, REPEATED));
  }
  return kept;
}
