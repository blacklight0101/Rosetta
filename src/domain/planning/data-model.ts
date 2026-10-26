import type { SourceCard } from './plan-sources.js';

// RF-623, RF-262, RF-603, DEC-134: the target data model of the hand-off package, table by table.
// The draft is what the planner answers (untrusted model output, ADR-013); the model is what is
// written once `assembleDataModel` has checked it against the supported `ENT` claims of the cards.
// The legacy data model has claims, not structured fields (entity-model.ts), so a legacy field is
// named by the supported `ENT` claim that states it (`ENT-001.c2`) and the field name the planner
// read in it. There is no executable DDL anywhere in these types: a table is names, types written
// as type names, keys, constraints in words and indexes.

export interface DraftColumn {
  readonly name: string;
  /** A type name of the chosen database, such as `varchar(200)`. */
  readonly type: string;
  readonly nullable: boolean;
  /** The legacy field this column holds: a supported `ENT` claim id and the field's name; null for "new". */
  readonly legacy: { readonly claim: string; readonly field: string } | null;
  /** A type change that can lose data, in words; empty for none. */
  readonly risk: string;
}

export interface ForeignKey {
  readonly columns: readonly string[];
  readonly references: string;
  readonly referencedColumns: readonly string[];
}

interface TableIndex {
  readonly columns: readonly string[];
  readonly unique: boolean;
  readonly reason: string;
}

export interface DraftTable {
  readonly name: string;
  readonly purpose: string;
  /** `ENT` card ids the table is built from. */
  readonly sources: readonly string[];
  readonly columns: readonly DraftColumn[];
  readonly primaryKey: readonly string[];
  readonly uniqueKeys: readonly (readonly string[])[];
  readonly foreignKeys: readonly ForeignKey[];
  /** Rules in words (for example "total is zero or more"), never an expression to run. */
  readonly checks: readonly string[];
  readonly indexes: readonly TableIndex[];
  /** P5-38: true for a table built by code from the legacy claims because the planner's answer failed. */
  readonly copiedFromLegacy?: boolean | undefined;
}

interface DraftDroppedField {
  readonly claim: string;
  readonly field: string;
  readonly reason: string;
}

export interface DataModelDraft {
  readonly tables: readonly DraftTable[];
  readonly dropped: readonly DraftDroppedField[];
}

/** A supported claim of an `ENT` card: the unit a legacy field is traced and counted by. */
export interface LegacyClaim {
  readonly cardId: string;
  readonly claimId: string;
  readonly text: string;
}

export interface LegacySource {
  readonly cardId: string;
  readonly claimId: string;
  readonly field: string;
}

export interface ModelColumn {
  readonly name: string;
  readonly type: string;
  readonly nullable: boolean;
  /** Null for a column that is new in the target. */
  readonly legacy: LegacySource | null;
  /** A type change that can lose data, in words; empty for none. */
  readonly migrationRisk: string;
  /** P5-37: the default the legacy claim states, as written; absent for none. */
  readonly default?: string;
}

export interface ModelTable {
  readonly name: string;
  readonly purpose: string;
  /** `ENT` card ids, sorted; empty for a table that is new. */
  readonly sources: readonly string[];
  readonly columns: readonly ModelColumn[];
  readonly primaryKey: readonly string[];
  readonly uniqueKeys: readonly (readonly string[])[];
  readonly foreignKeys: readonly ForeignKey[];
  readonly checks: readonly string[];
  readonly indexes: readonly TableIndex[];
  /** P5-38: true when the table is copied from the legacy claims, not designed by the planner. */
  readonly copiedFromLegacy?: boolean | undefined;
}

/** A legacy statement with no target column. */
export interface DroppedField {
  readonly cardId: string;
  readonly claimId: string;
  readonly field: string;
  readonly reason: string;
  /** False when the planner left the claim unmapped and unlisted, so the code listed it. */
  readonly byPlanner: boolean;
}

export interface TargetDataModel {
  /** The database layer of the planning brief; null when the brief names none. */
  readonly database: string | null;
  readonly tables: readonly ModelTable[];
  readonly dropped: readonly DroppedField[];
}

/** How many items of the draft the model leaves out, for the log. */
export interface LeftOut {
  readonly tables: number;
  readonly columns: number;
  readonly keys: number;
  readonly sources: number;
}

export interface DataModelAssembly {
  readonly model: TargetDataModel;
  readonly leftOut: LeftOut;
}

/** The supported claims of the `ENT` cards, in card and claim order. */
// RF-623
export function legacyClaimsOf(cards: readonly SourceCard[]): LegacyClaim[] {
  return cards
    .filter((card) => card.type === 'ENT')
    .flatMap((card) =>
      card.claims
        .filter((claim) => claim.status === 'Supported')
        .map((claim) => ({ cardId: card.id, claimId: claim.claimId, text: claim.text })),
    );
}

// RF-623
export function emptyDataModel(database: string | null): TargetDataModel {
  return { database, tables: [], dropped: [] };
}
