import { legacyClaimsOf, type DataModelAssembly } from '../../domain/planning/data-model.js';
import { assembleDataModel } from '../../domain/planning/data-model-assembly.js';
import type { SourceCard } from '../../domain/planning/plan-sources.js';
import type { PlanningBrief } from '../../domain/planning/planning-brief.js';
import { askPlannerWith, type PlannerCall } from './ask-planner.js';
import { parseDataModelAnswer, type DataModelProblem } from './data-model-answer.js';
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
    };
  const entities = input.cards.filter((card) => card.type === 'ENT');
  const omitted = omittedFor(call, entities, (each) =>
    dataModelMessage({ ...input, omitted: each }, () => MEASURING_TAG),
  );
  const message = dataModelMessage({ ...input, omitted }, call.tags);
  const output = await askPlannerWith(call, message);
  const parsed = parseDataModelAnswer(output);
  const assembly = assembleDataModel(parsed?.draft ?? emptyDraft, legacy, database);
  return {
    assembly,
    readable: assembly.model.tables.length > 0,
    problems: parsed?.problems ?? [],
    answered: parsed !== undefined,
  };
}

/** RF-623: what to log about a planned data model: an unusable answer, and what the checks refused. */
export function dataModelWarnings(planned: PlannedDataModel): string[] {
  const { readable, assembly, problems, answered } = planned;
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
  return [...unusable, ...parts, ...refused];
}
