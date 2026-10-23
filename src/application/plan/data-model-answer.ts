import { z } from 'zod';
import type { DataModelDraft, DraftTable } from '../../domain/planning/data-model.js';
import { cardLimits } from '../cards/card-limits.js';
import { searchJson } from '../cards/extract-json.js';
import { NO_REAL_COLUMN, withoutPlaceholders } from './data-model-placeholders.js';

// RF-623, ADR-013: the planner's data model is untrusted text. It is read as one JSON object
// (fenced or inside prose, like the other planner answers) with every list and text bounded; which
// names, types, keys and legacy claims are allowed is decided by the domain (data-model-assembly.ts),
// not here. A part the answer leaves out takes its empty value. A part that fails its schema (a
// column, a table, a key, a dropped claim) is dropped alone and named in `problems`, so one long
// field does not cost the whole model (EV-02); an answer with no table at all is no answer.

const MAX_TABLES = 100;
const MAX_COLUMNS = 200;
const MAX_LIST = 50;
const NAME = 80;
const TEXT = 2000;

const FAILS = 'The part fails its schema, so the parser drops it; the rest of the answer is kept.';
const PAST_LIMIT = 'The list is past its count limit, so the parser drops this item.';
const NOT_LIST = 'The value is not a list, so the parser drops it.';
const NO_COLUMN = 'The table has no valid column, so the parser drops it.';

const name = z.string().trim().min(1).max(NAME);
const text = z.string().trim().min(1).max(TEXT);
const optionalText = z.string().trim().max(TEXT);
const names = z.array(name).max(MAX_LIST);

const column = z.object({
  name,
  type: z.string().trim().max(NAME),
  nullable: z.boolean().default(true),
  legacy: z.object({ claim: name, field: name }).nullable().default(null),
  risk: optionalText.default(''),
});

const foreignKey = z.object({ columns: names, references: name, referencedColumns: names });

const tableIndex = z.object({
  columns: names,
  unique: z.boolean().default(false),
  reason: optionalText.default(''),
});

const droppedField = z.object({ claim: name, field: name, reason: text });

// The table as the planner wrote it, each part still untrusted: read part by part below.
const tableRaw = z
  .object({
    name: z.unknown(),
    purpose: z.unknown(),
    sources: z.unknown(),
    columns: z.unknown(),
    primaryKey: z.unknown(),
    uniqueKeys: z.unknown(),
    foreignKeys: z.unknown(),
    checks: z.unknown(),
    indexes: z.unknown(),
  })
  .partial();

const answerShape = z.object({
  tables: z.array(z.unknown()).min(1),
  dropped: z.unknown().optional(),
});

/** A part of the answer the parser dropped: its name (or label), the schema path and a fixed reason. */
export interface DataModelProblem {
  readonly item: string;
  readonly field: string;
  readonly reason: string;
}

type Problems = DataModelProblem[];

/** Where a list is read from, how many items it may keep, and where its problems are named. */
interface Scope {
  readonly where: string;
  readonly max: number;
  readonly problems: Problems;
}

/** What the answer read as: the draft, and the parts the parser dropped (named, for the log and checks.md). */
export interface DataModelParse {
  readonly draft: DataModelDraft;
  readonly problems: readonly DataModelProblem[];
}

function pick<T>(
  schema: z.ZodType<T>,
  value: unknown,
  path: { readonly item: string; readonly field: string },
  problems: Problems,
): T | undefined {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  problems.push({ ...path, reason: FAILS });
  return undefined;
}

function scopeOf(where: string, problems: Problems, max = MAX_LIST): Scope {
  return { where, max, problems };
}

function listOf(value: unknown, scope: Scope): unknown[] {
  if (value === undefined) return [];
  if (Array.isArray(value)) return value;
  scope.problems.push({ item: scope.where, field: scope.where, reason: NOT_LIST });
  return [];
}

/** The name a list item carries, when it is an object with one; otherwise its place in the list. */
function nameOf(value: unknown, label: string): string {
  if (typeof value === 'object' && value !== null && 'name' in value) {
    const named = value.name;
    if (typeof named === 'string' && named.trim() !== '') return named.trim();
  }
  return label;
}

/** Reads the items of a list with `schema`: keeps the ones that read, names the ones refused. */
function itemsIn<T>(schema: z.ZodType<T>, value: unknown, scope: Scope): T[] {
  const kept: T[] = [];
  listOf(value, scope).forEach((item, index) => {
    const field = `${scope.where} ${String(index + 1)}`;
    const itemName = nameOf(item, field);
    if (kept.length === scope.max) {
      scope.problems.push({ item: itemName, field, reason: PAST_LIMIT });
      return;
    }
    const read = pick(schema, item, { item: itemName, field }, scope.problems);
    if (read !== undefined) kept.push(read);
  });
  return kept;
}

function parseColumns(raw: unknown, where: string, problems: Problems) {
  return itemsIn(column, raw, scopeOf(`${where} columns`, problems, MAX_COLUMNS));
}

function parseKeys(raw: z.infer<typeof tableRaw>, where: string, problems: Problems) {
  return {
    primaryKey: itemsIn(name, raw.primaryKey, scopeOf(`${where} primary key`, problems)),
    uniqueKeys: itemsIn(names, raw.uniqueKeys, scopeOf(`${where} unique keys`, problems)),
    foreignKeys: itemsIn(foreignKey, raw.foreignKeys, scopeOf(`${where} foreign keys`, problems)),
    checks: itemsIn(text, raw.checks, scopeOf(`${where} checks`, problems)),
    indexes: itemsIn(tableIndex, raw.indexes, scopeOf(`${where} indexes`, problems)),
  };
}

function parseTable(value: unknown, label: string, problems: Problems): DraftTable | undefined {
  const raw = pick(tableRaw, value, { item: label, field: label }, problems);
  if (raw === undefined) return undefined;
  const tableName = pick(name, raw.name, { item: label, field: `${label} name` }, problems);
  if (tableName === undefined) return undefined;
  const where = `table ${tableName}`;
  const purpose = pick(
    optionalText,
    raw.purpose ?? '',
    { item: tableName, field: `${where} purpose` },
    problems,
  );
  if (purpose === undefined) return undefined;
  const read = parseColumns(raw.columns, where, problems);
  const columns = withoutPlaceholders(read, where, problems);
  if (columns.length === 0) {
    const reason = read.length === 0 ? NO_COLUMN : NO_REAL_COLUMN;
    problems.push({ item: tableName, field: where, reason });
    return undefined;
  }
  const sources = itemsIn(z.string().max(40), raw.sources, scopeOf(`${where} sources`, problems));
  return { name: tableName, purpose, sources, columns, ...parseKeys(raw, where, problems) };
}

function readAnswer(shape: z.infer<typeof answerShape>): DataModelParse {
  const problems: Problems = [];
  const tables: DraftTable[] = [];
  listOf(shape.tables, scopeOf('tables', problems, MAX_TABLES)).forEach((value, index) => {
    const label = `table ${String(index + 1)}`;
    if (tables.length === MAX_TABLES) {
      problems.push({ item: label, field: label, reason: PAST_LIMIT });
      return;
    }
    const table = parseTable(value, label, problems);
    if (table !== undefined) tables.push(table);
  });
  const dropped = itemsIn(
    droppedField,
    shape.dropped,
    scopeOf('dropped claims', problems, MAX_COLUMNS),
  );
  return { draft: { tables, dropped }, problems };
}

/** What the answer read as, or undefined when no JSON object of the answer has a table list. */
// RF-623
export function parseDataModelAnswer(output: string): DataModelParse | undefined {
  for (const value of searchJson(output.slice(0, cardLimits.maxOutputChars)).values) {
    const shape = answerShape.safeParse(value);
    if (shape.success) return readAnswer(shape.data);
  }
  return undefined;
}
