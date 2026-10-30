import {
  legacyClaimsOf,
  type DataModelAssembly,
  type DataModelDraft,
  type DraftTable,
} from '../../domain/planning/data-model.js';
import { legacyTablesOf } from '../../domain/planning/data-model-legacy-tables.js';
import { assembleDataModel } from '../../domain/planning/data-model-assembly.js';
import type { SourceCard } from '../../domain/planning/plan-sources.js';
import type { PlanningBrief } from '../../domain/planning/planning-brief.js';
import { checkedModel, withoutKeptLeftOut } from './data-model-checked.js';
import { withoutStorelessCards, withoutStorelessTables } from './data-model-skipped.js';
import { askPlannerWith, type PlannerCall } from './ask-planner.js';
import { parseDataModelAnswer, type DataModelProblem } from './data-model-answer.js';
import { dataModelMessage, packableCards } from './data-model-message.js';
import { MEASURING_TAG, omittedFor } from './plan-call-packing.js';
import { cutOffMessage } from './plan-continuation.js';
import { dataModelBatches } from './data-model-batches.js';

// RF-623, RF-262, ADR-018: the target data model of a plan run. When the supported cards hold at
// least one `ENT` claim the planner is asked once more, through the same guarded provider, for the
// tables; its answer is checked against those claims (the domain), so a column names only a legacy
// field the cards support. Without a supported `ENT` claim there is nothing to map and no call is
// made. An answer that gives no usable table is not a failure of the run (like an unreadable PRD):
// the model has no table and lists every legacy claim as dropped, and the caller logs it.

export interface DataModelInput {
  /** The cards with their `Supported` claims. */
  readonly cards: readonly SourceCard[];
  readonly brief: PlanningBrief;
}

/** The database layer of the brief, or null when the owner chose none. */
function databaseOf(brief: PlanningBrief): string | null {
  return brief.stack.find((entry) => entry.layer === 'database')?.choice ?? null;
}

/** The data model, and whether the planner's answer gave at least one usable table. */
export interface PlannedDataModel {
  readonly assembly: DataModelAssembly;
  readonly readable: boolean;
  /** The parts of the planner's answer the parser dropped, named; empty for none. */
  readonly problems: readonly DataModelProblem[];
  /** Whether the planner's answer had a table list at all. */
  readonly answered: boolean;
  /** P3-120: how many of `problems` are checks of the model (types, keys, missing names), not dropped parts. */
  readonly flagged: number;
  /** P5-38: the tables copied from the legacy claims because the planner's answer for them failed. */
  readonly copied: readonly string[];
  /** RST-1805: the cause and the setting when a batch that fell back stayed cut off; empty for none. */
  readonly cutOffNote: string;
}

const emptyDraft = { tables: [], dropped: [] } as const;

/** What the batches gave: the draft, the parts the parser dropped, and the cards no answer served. */
interface Batched {
  readonly draft: DataModelDraft;
  readonly problems: readonly DataModelProblem[];
  readonly answered: boolean;
  readonly failed: readonly SourceCard[];
  /** Whether a failed batch stayed cut off at the output limit. */
  readonly cut: boolean;
}

/** One planner call for these entities: what its answer read as (undefined when none) and whether it stayed cut off. */
async function askBatch(
  call: PlannerCall,
  input: DataModelInput,
  batch: readonly SourceCard[],
  single: boolean,
): Promise<{ read: ReturnType<typeof parseDataModelAnswer>; cut: boolean }> {
  const state = { cut: false };
  const own: PlannerCall = {
    ...call,
    onCutOff: () => {
      state.cut = true;
      return Promise.resolve();
    },
  };
  const scope = single ? undefined : batch;
  const omitted = omittedFor(own, packableCards(input.cards, scope), (each) =>
    dataModelMessage({ ...input, omitted: each, batch: scope }, () => MEASURING_TAG),
  );
  const message = dataModelMessage({ ...input, omitted, batch: scope }, call.tags);
  const output = await askPlannerWith(own, message);
  return { read: state.cut ? undefined : parseDataModelAnswer(output), cut: state.cut };
}

/** P5-38: a batch that failed is asked again as two smaller ones, once; what still fails is `failed`. */
async function askRetrying(
  call: PlannerCall,
  input: DataModelInput,
  batch: readonly SourceCard[],
  single: boolean,
): Promise<Batched> {
  const { read: first, cut } = await askBatch(call, input, batch, single);
  if (first !== undefined) {
    return { draft: first.draft, problems: first.problems, answered: true, failed: [], cut: false };
  }
  if (batch.length < 2) {
    return { draft: emptyDraft, problems: [], answered: false, failed: batch, cut };
  }
  const half = Math.ceil(batch.length / 2);
  const parts: Batched[] = [];
  for (const smaller of [batch.slice(0, half), batch.slice(half)]) {
    const { read, cut: stillCut } = await askBatch(call, input, smaller, false);
    parts.push(
      read === undefined
        ? { draft: emptyDraft, problems: [], answered: false, failed: smaller, cut: stillCut }
        : { draft: read.draft, problems: read.problems, answered: true, failed: [], cut: false },
    );
  }
  return joined(parts);
}

function joined(parts: readonly Batched[]): Batched {
  return {
    draft: {
      tables: parts.flatMap((part) => part.draft.tables),
      dropped: parts.flatMap((part) => part.draft.dropped),
    },
    problems: parts.flatMap((part) => part.problems),
    answered: parts.some((part) => part.answered),
    failed: parts.flatMap((part) => part.failed),
    cut: parts.some((part) => part.cut),
  };
}

/** The table names of the legacy claims that no table of the planner already has, for the cards that failed. */
function copiedTables(failed: readonly SourceCard[], have: readonly DraftTable[]): DraftTable[] {
  const names = new Set(have.map((table) => table.name.toLowerCase()));
  return legacyTablesOf(failed).filter((table) => !names.has(table.name.toLowerCase()));
}

/** Every entity card named as an empty table: the last resort, so the model is never empty. */
function namedAfterCards(cards: readonly SourceCard[]): DraftTable[] {
  return cards.flatMap((card) => {
    const name = card.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, '_')
      .replace(/^_+|_+$/gu, '')
      .slice(0, 60);
    if (!/^[a-z]/u.test(name)) return [];
    return [
      {
        ...{ name, sources: [card.id], columns: [], primaryKey: [], uniqueKeys: [] },
        ...{ foreignKeys: [], checks: [], indexes: [], copiedFromLegacy: true },
        purpose: `Named after the legacy entity ${card.title}; the planner's answer failed, so confirm it.`,
      },
    ];
  });
}

// RF-623
export async function planDataModel(
  call: PlannerCall,
  given: DataModelInput,
): Promise<PlannedDataModel> {
  const { cards, skipped, ids } = withoutStorelessCards(given.cards);
  const input = { ...given, cards };
  const database = databaseOf(input.brief);
  const legacy = legacyClaimsOf(input.cards);
  if (legacy.length === 0)
    return {
      assembly: assembleDataModel(emptyDraft, legacy, database),
      readable: true,
      problems: skipped,
      answered: false,
      flagged: skipped.length,
      copied: [],
      cutOffNote: '',
    };
  const entities = input.cards.filter((card) => card.type === 'ENT');
  const limit = call.planner.maxOutputTokens;
  const batches = dataModelBatches(entities, call.planner.maxOutputTokens);
  const single = batches.length === 1;
  const parts: Batched[] = [];
  for (const batch of batches) parts.push(await askRetrying(call, input, batch, single));
  const all = joined(parts);
  const cutOffNote = all.cut ? cutOffMessage(limit) : '';
  const copied = copiedTables(all.failed, all.draft.tables);
  const kept = withoutStorelessTables(all.draft.tables, ids);
  const draft = { ...all.draft, tables: [...kept, ...copied] };
  let assembled = assembleDataModel(draft, legacy, database);
  if (assembled.model.tables.length === 0) {
    const fromClaims = legacyTablesOf(entities);
    assembled = assembleDataModel(
      { ...draft, tables: fromClaims.length > 0 ? fromClaims : namedAfterCards(entities) },
      legacy,
      database,
    );
  }
  return checked(assembled, input, { all, cutOffNote, skipped });
}

/** The model once the checks have run, with what they flag and the tables copied (P3-120, P5-38). */
function checked(
  assembled: DataModelAssembly,
  input: DataModelInput,
  rest: { all: Batched; cutOffNote: string; skipped: readonly DataModelProblem[] },
): PlannedDataModel {
  const { all, cutOffNote, skipped } = rest;
  const model = checkedModel(assembled, input.cards, input.brief);
  const { assembly, readable, copied } = model;
  const flagged = [...skipped, ...model.flagged];
  return {
    assembly,
    readable,
    problems: [...withoutKeptLeftOut(all.problems, assembly), ...flagged],
    flagged: flagged.length,
    answered: all.answered,
    copied,
    cutOffNote,
  };
}

/** RF-623: what to log about a planned data model: an unusable answer, and what the checks refused. */
export function dataModelWarnings(planned: PlannedDataModel): string[] {
  const { readable, assembly, answered, flagged } = planned;
  const problems = planned.problems.slice(0, planned.problems.length - flagged);
  const { tables, columns, keys, sources } = assembly.leftOut;
  const named = problems.map((problem) => `${problem.field} (${problem.item})`).join('; ');
  const unusable = readable
    ? []
    : [
        answered && problems.length > 0
          ? `The planner answer for the data model had tables it could not read: ${named}; every legacy field is listed as dropped.`
          : 'The planner answer for the data model had no usable table; every legacy field is listed as dropped.',
      ];
  const parts =
    readable && problems.length > 0
      ? [`The planner data model dropped parts that failed their schema: ${named}.`]
      : [];
  const refused =
    tables + columns + keys + sources === 0
      ? []
      : [
          `The planner data model had items the checks refused; ${String(tables)} table(s), ${String(columns)} column(s), ${String(keys)} key(s) or index(es) and ${String(sources)} legacy source(s) were left out.`,
        ];
  const checked =
    flagged === 0
      ? []
      : [
          `The planner data model has ${String(flagged)} item(s) the checks list in checks.md: column types of another database, a changed legacy key type, a column that differs from its legacy type or nullability, or names a card says that the model lacks.`,
        ];
  const copiedFrom =
    planned.copied.length === 0
      ? []
      : [
          `The planner answer for ${String(planned.copied.length)} table(s) failed after a retry; they are copied from the legacy claims and marked: ${planned.copied.join(', ')}.${planned.cutOffNote === '' ? '' : ` ${planned.cutOffNote}`}`,
        ];
  return [...unusable, ...parts, ...refused, ...copiedFrom, ...checked];
}
