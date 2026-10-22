import { z } from 'zod';
import type { DataModelDraft } from '../../domain/planning/data-model.js';
import { cardLimits } from '../cards/card-limits.js';
import { searchJson } from '../cards/extract-json.js';

// RF-623, ADR-013: the planner's data model is untrusted text. It is read as one JSON object
// (fenced or inside prose, like the other planner answers) with every list and text bounded; which
// names, types, keys and legacy claims are allowed is decided by the domain (data-model-assembly.ts),
// not here. A part the answer leaves out takes its empty value; an answer without a table, or a
// table without a column, is no answer.

const MAX_TABLES = 100;
const MAX_COLUMNS = 200;
const MAX_LIST = 50;
const NAME = 80;
const TEXT = 2000;

const name = z.string().trim().min(1).max(NAME);
const text = z.string().trim().min(1).max(TEXT);
const optionalText = z.string().trim().max(TEXT).default('');
const names = z.array(name).max(MAX_LIST);

const column = z.object({
  name,
  type: z.string().trim().max(NAME),
  nullable: z.boolean().default(true),
  legacy: z.object({ claim: name, field: name }).nullable().default(null),
  risk: optionalText,
});

const table = z.object({
  name,
  purpose: optionalText,
  sources: z.array(z.string().max(40)).max(MAX_LIST).default([]),
  columns: z.array(column).min(1).max(MAX_COLUMNS),
  primaryKey: names.default([]),
  uniqueKeys: z.array(names).max(MAX_LIST).default([]),
  foreignKeys: z
    .array(z.object({ columns: names, references: name, referencedColumns: names }))
    .max(MAX_LIST)
    .default([]),
  checks: z.array(text).max(MAX_LIST).default([]),
  indexes: z
    .array(z.object({ columns: names, unique: z.boolean().default(false), reason: optionalText }))
    .max(MAX_LIST)
    .default([]),
});

const answer = z.object({
  tables: z.array(table).min(1).max(MAX_TABLES),
  dropped: z
    .array(z.object({ claim: name, field: name, reason: text }))
    .max(MAX_COLUMNS)
    .default([]),
});

/** What the answer read as: the draft, and the parts the parser dropped (named, for the log). */
export interface DataModelParse {
  readonly draft: DataModelDraft;
  readonly problems: readonly string[];
}

/** The draft of the answer, or undefined when no JSON object of the answer reads as a data model. */
// RF-623
export function parseDataModelAnswer(output: string): DataModelParse | undefined {
  for (const value of searchJson(output.slice(0, cardLimits.maxOutputChars)).values) {
    const parsed = answer.safeParse(value);
    if (parsed.success) return { draft: parsed.data, problems: [] };
  }
  return undefined;
}
