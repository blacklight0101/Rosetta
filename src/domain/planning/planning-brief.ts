import type { Run } from '../runs/run.js';
import { buildMethodDefaulted, resolveBuildMethod, type BuildMethod } from './build-method.js';
import { defaultPrinciples, type ArchitectureStyleId, type Catalogue } from './catalogue.js';
import { hasTypedText, typedQuestionIds } from './typed-answers.js';

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

/**
 * P5-39, RF-609: what the new system is. The owner may answer it; when nobody did, the plan takes it
 * from the legacy code map (`application-kind.ts`). `keep` is a system that stays the kind it is.
 */
export const applicationKinds = ['web', 'desktop', 'service', 'keep'] as const;
export type ApplicationKind = (typeof applicationKinds)[number];

/** RF-610; the first is the default. */
export const migrationStrategies = ['strangler-fig', 'parallel-change', 'rewrite'] as const;
export type MigrationStrategy = (typeof migrationStrategies)[number];

/** The style a brief takes when nothing was chosen and nothing is recommended (first in RF-608). */
const defaultArchitectureStyle: ArchitectureStyleId = 'layered';

interface StackChoice {
  readonly layer: StackLayer;
  /** The chosen technology, free text (untrusted, ADR-013). */
  readonly choice: string;
  /** True when the user typed their own instead of picking a pre-filled option. */
  readonly custom: boolean;
  /**
   * The options Plan setup showed for the layer when the choice was made (RF-609); the stack record
   * lists them. Absent in a brief saved before they were recorded.
   */
  readonly offered?: readonly string[] | undefined;
  /**
   * P5-39: set only by the plan run, on a layer the owner left open and Rosetta proposed; a saved
   * brief never holds it (the schema refuses it), so an owner's choice is never one.
   */
  readonly proposed?: true | undefined;
}

/** RF-643: how the new application is run. */
export const deployments = ['hosted', 'not-hosted'] as const;
type Deployment = (typeof deployments)[number];

interface ProjectContext {
  readonly teamSize: number | null;
  readonly experience: string | null;
  readonly deadline: string | null;
  readonly keepIntegrations: readonly string[];
  readonly dataMigration: string | null;
  /** RF-643, Q-H: whether the new application is hosted; absent when nobody said. */
  readonly deployment?: Deployment | undefined;
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
  /** P5-39: the owner's answer to the kind of application; absent when nobody answered. */
  readonly application?: ApplicationKind | undefined;
  /** One entry per answered layer, in layer order. */
  readonly stack: readonly StackChoice[];
  readonly context: ProjectContext;
  readonly buildMethod: BuildMethod;
  /** The questions that took their default, in question order. */
  readonly defaulted: readonly string[];
  /** RF-645: the option answering each question, or "typed"; absent in a brief saved before DEC-178. */
  readonly chosen?: Readonly<Record<string, string>> | undefined;
  /**
   * RF-645: the text of a typed answer, by question id; absent when none was typed. A typed answer
   * reaches the planner (DEC-184), so its question is not in `defaulted`, while the enumerated value
   * (the style, the strategy, `aiAssisted`) keeps its default.
   */
  readonly typed?: Readonly<Record<string, string>> | undefined;
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
  readonly application?: ApplicationKind | undefined;
  readonly stack?: readonly StackChoice[] | undefined;
  readonly context?:
    | {
        readonly teamSize?: number | null | undefined;
        readonly experience?: string | null | undefined;
        readonly deadline?: string | null | undefined;
        readonly keepIntegrations?: readonly string[] | undefined;
        readonly dataMigration?: string | null | undefined;
        readonly deployment?: Deployment | undefined;
      }
    | undefined;
  readonly buildMethod?: BuildMethod | undefined;
  readonly chosen?: Readonly<Record<string, string>> | undefined;
  readonly typed?: Readonly<Record<string, string>> | undefined;
}

export interface BriefProblem {
  readonly field: string;
  readonly reason: string;
}

const contextQuestions = [
  'teamSize',
  'experience',
  'deadline',
  'keepIntegrations',
  'dataMigration',
] as const;

function layerOrder(layer: StackLayer): number {
  return stackLayers.indexOf(layer);
}

function isPrinciple(catalogue: Catalogue, id: string): boolean {
  return catalogue.entries.some(
    (entry) => entry.id === id && entry.group !== 'architecture-styles',
  );
}

/** What is wrong with the answers of a save: an unknown principle, a repeated layer or entry, a typed build method with agents. */
// RF-605
export function briefProblems(answers: BriefAnswers, catalogue: Catalogue): BriefProblem[] {
  const problems: BriefProblem[] = [];
  const principles = answers.principles ?? [];
  principles.forEach((id, index) => {
    if (!isPrinciple(catalogue, id)) {
      problems.push({ field: `principles.${String(index)}`, reason: `${id} is not a principle.` });
    }
  });
  if (new Set(principles).size !== principles.length) {
    problems.push({ field: 'principles', reason: 'A principle is listed twice.' });
  }
  const layers = (answers.stack ?? []).map((entry) => entry.layer);
  if (new Set(layers).size !== layers.length) {
    problems.push({ field: 'stack', reason: 'A layer is listed twice.' });
  }
  for (const id of Object.keys(answers.typed ?? {})) {
    if (!typedQuestionIds.some((each) => each === id)) {
      problems.push({ field: `typed.${id}`, reason: 'This question takes no typed text.' });
    }
  }
  return [...problems, ...typedBuildMethodProblems(answers)];
}

// DEC-187 (4): a typed build method is not an agent build; Rosetta does not read free text as a choice.
function typedBuildMethodProblems(answers: BriefAnswers): BriefProblem[] {
  return answers.buildMethod?.aiAssisted === true && hasTypedText(answers.typed, 'buildMethod')
    ? [{ field: 'typed.buildMethod', reason: 'A typed build method cannot be saved with agents.' }]
    : [];
}

function contextOf(given: BriefAnswers['context']): ProjectContext {
  const answered = given ?? {};
  return {
    teamSize: answered.teamSize ?? null,
    experience: answered.experience ?? null,
    deadline: answered.deadline ?? null,
    keepIntegrations: answered.keepIntegrations ?? [],
    dataMigration: answered.dataMigration ?? null,
    ...(answered.deployment === undefined ? {} : { deployment: answered.deployment }),
  };
}

function architectureOf(given: BriefAnswers['architecture']): UnsavedBrief['architecture'] {
  return {
    style: given?.style ?? defaultArchitectureStyle,
    recommended: given?.recommended ?? [],
    evidence: given?.evidence ?? [],
  };
}

function defaultedQuestions(answers: BriefAnswers): string[] {
  const given = answers.context;
  const typedIn = (id: (typeof typedQuestionIds)[number]): boolean =>
    hasTypedText(answers.typed, id);
  const answeredLayers = new Set((answers.stack ?? []).map((entry) => entry.layer));
  return [
    ...(answers.principles === undefined && !typedIn('principles') ? ['principles'] : []),
    ...(answers.architecture === undefined && !typedIn('architecture') ? ['architecture'] : []),
    ...(answers.migration === undefined && !typedIn('migration') ? ['migration'] : []),
    ...stackLayers.filter((layer) => !answeredLayers.has(layer)).map((layer) => `stack.${layer}`),
    ...contextQuestions
      .filter((question) => given?.[question] === undefined || given[question] === null)
      .map((question) => `context.${question}`),
    ...buildMethodDefaulted(answers.buildMethod).filter(
      (id) => id !== 'buildMethod' || !typedIn('buildMethod'),
    ),
  ];
}

function sortedRecord(
  given: Readonly<Record<string, string>> | undefined,
): Readonly<Record<string, string>> | undefined {
  const keys = Object.keys(given ?? {}).sort();
  if (given === undefined || keys.length === 0) return undefined;
  return Object.fromEntries(keys.map((key) => [key, given[key] ?? '']));
}

/** RF-645: the chosen options and typed texts, each key order fixed; absent when there are none. */
function ownAnswersOf(answers: BriefAnswers): Pick<UnsavedBrief, 'chosen' | 'typed'> {
  const chosen = sortedRecord(answers.chosen);
  const typed = sortedRecord(answers.typed);
  return {
    ...(chosen === undefined ? {} : { chosen }),
    ...(typed === undefined ? {} : { typed }),
  };
}

/** The brief for these answers with every unanswered question at its default (DEC-80). */
// RF-605, RF-606
export function buildBrief(answers: BriefAnswers, catalogue: Catalogue): UnsavedBrief {
  return {
    schemaVersion: 1,
    catalogueVersion: catalogue.version,
    principles: [...(answers.principles ?? defaultPrinciples(catalogue))].sort(),
    architecture: architectureOf(answers.architecture),
    migration: answers.migration ?? migrationStrategies[0],
    ...(answers.application === undefined ? {} : { application: answers.application }),
    stack: [...(answers.stack ?? [])].sort((a, b) => layerOrder(a.layer) - layerOrder(b.layer)),
    context: contextOf(answers.context),
    buildMethod: resolveBuildMethod(answers.buildMethod),
    defaulted: defaultedQuestions(answers),
    ...ownAnswersOf(answers),
  };
}

function contentOf(brief: UnsavedBrief): string {
  const { catalogueVersion, principles, architecture, migration, stack, context } = brief;
  const fields = [catalogueVersion, principles, architecture, migration, stack, context];
  return JSON.stringify([
    ...fields,
    brief.buildMethod,
    brief.defaulted,
    brief.application ?? null,
    brief.chosen ?? null,
    brief.typed ?? null,
  ]);
}

/** Whether two briefs hold the same answers, whatever instant they were saved at. */
// RF-605
export function sameBrief(left: UnsavedBrief, right: UnsavedBrief): boolean {
  return contentOf(left) === contentOf(right);
}

/** The start of the newest completed plan run, or undefined when no package exists. */
function newestPackageStart(runs: readonly Run[]): number | undefined {
  const starts = runs
    .filter((run) => run.stage === 'plan' && run.endState === 'Completed')
    .map((run) => run.startedAt ?? run.queuedAt);
  return starts.length === 0 ? undefined : Math.max(...starts);
}

/**
 * RF-605: the brief is out of date when it was saved after the newest completed `plan` run started,
 * because that package was written from an earlier brief. Without a package it cannot be.
 */
// RF-605
export function isBriefOutOfDate(savedAt: string, runs: readonly Run[]): boolean {
  const start = newestPackageStart(runs);
  return start !== undefined && Date.parse(savedAt) > start;
}
