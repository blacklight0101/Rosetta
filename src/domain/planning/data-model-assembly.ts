import { mergedDrafts } from './data-model-merge.js';
import { splitDrafts } from './data-model-split.js';
import { checkedTables, newTally, type ClaimIndex } from './data-model-tables.js';
import type {
  DataModelAssembly,
  DataModelDraft,
  DroppedField,
  LegacyClaim,
  ModelTable,
} from './data-model.js';

// RF-623, RF-262, RF-603: the planner's draft of the target data model made into the model the
// package writes. Tables are checked in data-model-tables.ts. Every supported `ENT` claim (the
// unit a legacy field is traced by) must end up mapped by a column or listed as dropped: a claim
// the planner did neither for is listed by the code as dropped, with a reason that says so, so
// nothing is silently lost and nothing is invented.

const unlistedReason =
  'The planner wrote no target column for this legacy statement; confirm whether it is dropped.';

function mappedClaims(tables: readonly ModelTable[]): Set<string> {
  return new Set(
    tables.flatMap((table) =>
      table.columns.flatMap((column) => (column.legacy === null ? [] : [column.legacy.claimId])),
    ),
  );
}

function plannerDropped(draft: DataModelDraft, claims: ClaimIndex): DroppedField[] {
  const seen = new Set<string>();
  return draft.dropped.flatMap((dropped) => {
    const claim = claims.get(dropped.claim);
    const key = `${dropped.claim}\n${dropped.field}`;
    if (claim === undefined || seen.has(key)) return [];
    seen.add(key);
    return [
      {
        ...{ cardId: claim.cardId, claimId: claim.claimId, field: dropped.field },
        reason: dropped.reason,
        byPlanner: true,
      },
    ];
  });
}

/** The planner's dropped fields, then the claims it left unmapped, in legacy claim order. */
function droppedFields(
  draft: DataModelDraft,
  tables: readonly ModelTable[],
  legacy: readonly LegacyClaim[],
): DroppedField[] {
  const claims: ClaimIndex = new Map(legacy.map((claim) => [claim.claimId, claim]));
  const listed = plannerDropped(draft, claims);
  const covered = new Set([...mappedClaims(tables), ...listed.map((field) => field.claimId)]);
  const unlisted = legacy
    .filter((claim) => !covered.has(claim.claimId))
    .map((claim) => ({
      ...{ cardId: claim.cardId, claimId: claim.claimId, field: '' },
      reason: unlistedReason,
      byPlanner: false,
    }));
  const order = new Map(legacy.map((claim, index) => [claim.claimId, index]));
  const at = (field: DroppedField): number => order.get(field.claimId) ?? 0;
  return [...listed, ...unlisted].sort((a, b) => at(a) - at(b));
}

// RF-623
export function assembleDataModel(
  draft: DataModelDraft,
  legacy: readonly LegacyClaim[],
  database: string | null,
): DataModelAssembly {
  const claims: ClaimIndex = new Map(legacy.map((claim) => [claim.claimId, claim]));
  const tally = newTally();
  const { tables: merged, merges } = mergedDrafts(draft.tables);
  const { tables: split, splits } = splitDrafts(merged);
  const tables = checkedTables(split, claims, tally);
  return {
    model: { database, tables, dropped: droppedFields(draft, tables, legacy), splits },
    leftOut: tally,
    merged: merges,
  };
}
