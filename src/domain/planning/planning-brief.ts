/* eslint-disable @typescript-eslint/no-unused-vars -- placeholder of the TDD red step, replaced by the next commit */
import type { Run } from '../runs/run.js';
import type { ArchitectureStyleId, Catalogue } from './catalogue.js';

// RF-605, ADR-018, DEC-72, DEC-80, data-model.md section 3.20: the planning brief, the answers Plan
// setup saves for a project. A question the user did not answer takes its default and is listed in
// `defaulted`, so the package can report it as an open question (RF-604); nothing is invented
// (DEC-80). A stack layer, the deadline and the other free answers have no default value: unanswered
// they stay empty and are listed. The default migration strategy is Strangler Fig (RF-610), the
// default principles are the catalogue's switched-on entries (DEC-74).

/** The layers of RF-609, in the order the page asks about them. */
export const stackLayers = [
  'language-runtime',
  'backend-framework',
  'front-end',
  'database',
  'data-access',
  'testing',
  'hosting',
] as const;
export type StackLayer = (typeof stackLayers)[number];

/** RF-610; the first is the default. */
export const migrationStrategies = ['strangler-fig', 'parallel-change', 'rewrite'] as const;
export type MigrationStrategy = (typeof migrationStrategies)[number];

/** The style a brief takes when nothing was chosen and nothing is recommended (first in RF-608). */
export const defaultArchitectureStyle: ArchitectureStyleId = 'layered';

export interface StackChoice {
  readonly layer: StackLayer;
  /** The chosen technology, free text (untrusted, ADR-013). */
  readonly choice: string;
  /** True when the user typed their own instead of picking a pre-filled option. */
  readonly custom: boolean;
}

export interface ProjectContext {
  readonly teamSize: number | null;
  readonly experience: string | null;
  readonly deadline: string | null;
  readonly keepIntegrations: readonly string[];
  readonly dataMigration: string | null;
}

export interface PlanningBrief {
  readonly schemaVersion: 1;
  /** ISO 8601 UTC instant of the save. */
  readonly savedAt: string;
  readonly catalogueVersion: number;
  /** Catalogue entry ids of the chosen principles and practices, sorted. */
  readonly principles: readonly string[];
  readonly architecture: {
    readonly style: ArchitectureStyleId;
    /** The styles Rosetta recommended when the user chose (RF-608). */
    readonly recommended: readonly ArchitectureStyleId[];
    /** Card ids behind the recommendation. */
    readonly evidence: readonly string[];
  };
  readonly migration: MigrationStrategy;
  /** One entry per answered layer, in layer order. */
  readonly stack: readonly StackChoice[];
  readonly context: ProjectContext;
  readonly buildMethod: { readonly aiAssisted: boolean };
  /** The questions that took their default, in question order. */
  readonly defaulted: readonly string[];
}

/** A brief that has not been saved yet. */
export type UnsavedBrief = Omit<PlanningBrief, 'savedAt'>;

/** What a save carries; every part may be left out, and a part left out takes its default. */
export interface BriefAnswers {
  readonly principles?: readonly string[] | undefined;
  readonly architecture?:
    | {
        readonly style: ArchitectureStyleId;
        readonly recommended?: readonly ArchitectureStyleId[] | undefined;
        readonly evidence?: readonly string[] | undefined;
      }
    | undefined;
  readonly migration?: MigrationStrategy | undefined;
  readonly stack?: readonly StackChoice[] | undefined;
  readonly context?:
    | {
        readonly teamSize?: number | null | undefined;
        readonly experience?: string | null | undefined;
        readonly deadline?: string | null | undefined;
        readonly keepIntegrations?: readonly string[] | undefined;
        readonly dataMigration?: string | null | undefined;
      }
    | undefined;
  readonly buildMethod?: { readonly aiAssisted: boolean } | undefined;
}

export interface BriefProblem {
  readonly field: string;
  readonly reason: string;
}

// Placeholder behaviour: the tests of the next commit fail on it, the implementation follows.
export function briefProblems(_answers: BriefAnswers, _catalogue: Catalogue): BriefProblem[] {
  return [];
}

export function buildBrief(_answers: BriefAnswers, catalogue: Catalogue): UnsavedBrief {
  return {
    schemaVersion: 1,
    catalogueVersion: catalogue.version,
    principles: [],
    architecture: { style: defaultArchitectureStyle, recommended: [], evidence: [] },
    migration: 'rewrite',
    stack: [],
    context: {
      teamSize: null,
      experience: null,
      deadline: null,
      keepIntegrations: [],
      dataMigration: null,
    },
    buildMethod: { aiAssisted: false },
    defaulted: [],
  };
}

export function sameBrief(_left: UnsavedBrief, _right: UnsavedBrief): boolean {
  return true;
}

export function isBriefOutOfDate(_savedAt: string, _runs: readonly Run[]): boolean {
  return false;
}
