import { legacyClaimsOf, type DataModelAssembly } from '../../domain/planning/data-model.js';
import { assembleDataModel } from '../../domain/planning/data-model-assembly.js';
import type { SourceCard } from '../../domain/planning/plan-sources.js';
import type { PlanningBrief } from '../../domain/planning/planning-brief.js';
import { askPlannerWith, type PlannerCall } from './ask-planner.js';
import { parseDataModelAnswer, type DataModelProblem } from './data-model-answer.js';
import { keepLegacyKeys } from './data-model-legacy-keys.js';
import { typeProblems } from './data-model-database.js';
import { missingNamed } from './data-model-named.js';
import { dataModelMessage } from './data-model-message.js';
import { MEASURING_TAG, omittedFor } from './plan-call-packing.js';

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
}

const emptyDraft = { tables: [], dropped: [] } as const;

// RF-623
export async function planDataModel(
  call: PlannerCall,
  input: DataModelInput,
): Promise<PlannedDataModel> {
  const database = databaseOf(input.brief);
  const legacy = legacyClaimsOf(input.cards);
  if (legacy.length === 0)
    return {
      assembly: assembleDataModel(emptyDraft, legacy, database),
      readable: true,
      problems: [],
      answered: false,
      flagged: 0,
    };
  const entities = input.cards.filter((card) => card.type === 'ENT');
  const omitted = omittedFor(call, entities, (each) =>
    dataModelMessage({ ...input, omitted: each }, () => MEASURING_TAG),
  );
  const message = dataModelMessage({ ...input, omitted }, call.tags);
  const output = await askPlannerWith(call, message);
  const parsed = parseDataModelAnswer(output);
  const assembled = assembleDataModel(parsed?.draft ?? emptyDraft, legacy, database);
  const keys = keepLegacyKeys(assembled.model, input.cards, input.brief);
  const assembly = { ...assembled, model: keys.model };
  const readable = assembly.model.tables.length > 0;
  // P3-120: what the checks flag is listed in checks.md; an unusable answer has nothing to check.
  const flagged = readable
    ? [
        ...typeProblems(assembly.model),
        ...keys.problems,
        ...missingNamed(assembly.model, input.cards),
      ]
    : [];
  return {
    assembly,
    readable,
    problems: [...(parsed?.problems ?? []), ...flagged],
    flagged: flagged.length,
    answered: parsed !== undefined,
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
          `The planner data model has ${String(flagged)} item(s) the checks list in checks.md: column types of another database, a changed legacy key type, or names a card says that the model lacks.`,
        ];
  return [...unusable, ...parts, ...refused, ...checked];
}
