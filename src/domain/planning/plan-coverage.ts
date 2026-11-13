import { byCodeUnit } from '../code-map/code-unit-order.js';
import type { ApiContract } from './api-contract.js';
import type { ModelTable, TargetDataModel } from './data-model.js';
import { planId, type PlanContent, type PlanTask } from './plan-content.js';
import type { PrdContent } from './prd-content.js';
import type { SourceModules } from './source-modules.js';
import type { TargetFlows } from './target-flows.js';
import type { TargetUx } from './target-ux.js';

// RF-627, RF-623, ADR-018: whether the task cards cover the whole set of the package. An item is
// a feature of the PRD, a table of the target data model, an operation of the API contract, a
// mapped journey or a target screen. Each has an id that code makes (`feature:F-001`,
// `table:customer`, `operation:placeOrder`, `flow:FLOW-001`, `screen:SCRN-001`), and a task card
// covers an item only by listing that id in `builds`. The words of a title never count: the
// planner's links are checked against the ids here, and a repeated link or one to an id that is no
// item is dropped. The first card of the plan, written by code, writes the migrations for every
// table (RF-623), so the data model never reaches the package without work that builds it.

/** The kinds of item, in the order the checks list them. */
const coverageKinds = [
  'feature',
  'table',
  'operation',
  'flow',
  'screen',
  'requirement',
  'module',
  'deployment',
] as const;

/** P8-06: the kinds of the source's own parts; one no card touches is named, never a failure. */
const sourceKinds: ReadonlySet<string> = new Set(['module', 'deployment']);

export type CoverageKind = (typeof coverageKinds)[number];

export interface CoverageItem {
  /** `<kind>:<key>`; the key is the feature number, the table or operation name, or a card id. */
  readonly id: string;
  readonly kind: CoverageKind;
  readonly name: string;
  /** A line that helps to tell the item from the others; may be empty. */
  readonly detail: string;
}

/** The documents of the package whose items a task card must build. */
export interface CoverageDocuments {
  readonly prd: PrdContent;
  readonly dataModel: TargetDataModel;
  readonly flows: TargetFlows;
  readonly apiContract: ApiContract;
  readonly ux: TargetUx;
  /** P8-06: the modules and deployment material of the scan; absent when no scan can be read. */
  readonly modules?: SourceModules | undefined;
}

/** What the planner says a task builds; `task` is the task's position, from 1. */
interface CoverageLink {
  readonly task: number;
  readonly builds: readonly string[];
}

export interface CoverageDraft {
  readonly links: readonly CoverageLink[];
}

export interface CoverageReport {
  readonly items: readonly CoverageItem[];
  /** The items of the documents no card builds, in kind order, then by id in code-unit order. */
  readonly uncovered: readonly CoverageItem[];
  /** P8-06: the modules and the deployment material no card touches, in the same order. */
  readonly modules: readonly CoverageItem[];
}

function item(kind: CoverageKind, key: string, name: string, detail: string): CoverageItem {
  return { id: `${kind}:${key}`, kind, name, detail };
}

function operationItems(contract: ApiContract): CoverageItem[] {
  if (contract.kind !== 'openapi') return [];
  return contract.operations.map((operation) => {
    const { operationId, method, path, summary } = operation;
    const line = `${method.toUpperCase()} ${path}: ${summary}`;
    return item('operation', operationId, operationId, line);
  });
}

/** Every item the task cards must build, kind by kind, each id once. */
// RF-627
export function coverageItems(documents: CoverageDocuments): CoverageItem[] {
  const { prd, dataModel, flows, apiContract, ux } = documents;
  const all = [
    ...prd.features.map((feature, index) =>
      item('feature', planId('F', index + 1), feature.title, feature.description),
    ),
    ...dataModel.tables.map((table) => item('table', table.name, table.name, table.purpose)),
    ...operationItems(apiContract),
    ...flows.flows.map((flow) => item('flow', flow.cardId, flow.title, flow.outcome)),
    ...ux.screens.map((screen) => item('screen', screen.id, screen.name, screen.purpose)),
  ];
  const seen = new Set<string>();
  return all.filter((each) => {
    if (seen.has(each.id)) return false;
    seen.add(each.id);
    return true;
  });
}

/**
 * The tasks with the ids they build: those the planner linked that are items, once each, in the
 * order of the items. A link to a task that does not exist, and an unreadable answer, link nothing.
 */
// RF-627
export function linkTasks(
  tasks: readonly PlanTask[],
  draft: CoverageDraft | undefined,
  items: readonly CoverageItem[],
): PlanTask[] {
  return tasks.map((task, index) => {
    const linked = new Set(
      (draft?.links ?? []).filter((link) => link.task === index + 1).flatMap((link) => link.builds),
    );
    return { ...task, builds: items.filter((each) => linked.has(each.id)).map((each) => each.id) };
  });
}

function byKindThenId(a: CoverageItem, b: CoverageItem): number {
  const kinds = coverageKinds.indexOf(a.kind) - coverageKinds.indexOf(b.kind);
  return kinds === 0 ? byCodeUnit(a.id, b.id) : kinds;
}

/** The items no task builds, in a fixed order. */
// RF-627
export function coverageOf(
  items: readonly CoverageItem[],
  tasks: readonly PlanTask[],
): CoverageReport {
  // P9-06: a requirement item is built by a card that lists the requirement.
  const built = new Set(
    tasks.flatMap((task) => [...task.builds, ...task.requirements.map(requirementItemId)]),
  );
  const open = items.filter((each) => !built.has(each.id)).sort(byKindThenId);
  const uncovered = open.filter((each) => !sourceKinds.has(each.kind));
  return { items, uncovered, modules: open.filter((each) => sourceKinds.has(each.kind)) };
}

const MIGRATION_TITLE = 'Write the database migrations in the chosen stack';

/** The card that writes the migrations, made by code (RF-623); the planner's cards never carry its title. */
export function isMigrationCard(task: PlanTask): boolean {
  return task.title === MIGRATION_TITLE;
}

function migrationCard(content: PlanContent, tables: readonly ModelTable[]): PlanTask {
  const sources = new Set(tables.flatMap((table) => table.sources));
  const count = `${String(tables.length)} table${tables.length === 1 ? '' : 's'}`;
  return {
    ...{ id: planId('T', 1), title: MIGRATION_TITLE, phase: 1 },
    builds: tables.map((table) => `table:${table.name}`),
    requirements: content.requirements
      .filter((requirement) => requirement.sources.some((source) => sources.has(source)))
      .map((requirement) => requirement.id),
    acceptanceCriteria: [
      `Given an empty database of the chosen stack, when the migrations run, then the ${count} of the target data model exist with their columns, keys and constraints.`,
      'Given a database the migrations already ran on, when they run again, then no table, column or row changes.',
    ],
    invariant: `The migrations create exactly the ${count} of the target data model, and running them twice changes nothing.`,
    riskClass: 'data loss',
    adds: [],
    probes: [
      'Run the migrations twice on the same database => the second run changes no table, column or row.',
      'Run them on a database that already holds one of the tables => that table and its rows are left as they were.',
      'Compare the tables the migrations create with the target data model, column by column => every table and column of the model exists with its key and constraints, and nothing else.',
    ],
    files: [],
    identifiers: [],
    dependsOn: [],
  };
}

/**
 * RF-623: the plan with the card that writes the migrations first. Every other card keeps its
 * order and moves one place down, and a card that builds a table waits for the migrations. A plan
 * with no table, no phase or no task is returned as it is: with no task nothing is covered, and
 * the card must not hide that.
 */
// RF-623
export function withMigrationCard(
  content: PlanContent,
  tables: readonly ModelTable[],
): PlanContent {
  if (tables.length === 0 || content.phases.length === 0 || content.tasks.length === 0) {
    return content;
  }
  const first = migrationCard(content, tables);
  const renamed = new Map(content.tasks.map((task, index) => [task.id, planId('T', index + 2)]));
  const migrated = new Set(first.builds);
  const moved = content.tasks.map((task) => {
    const waits = task.builds.some((id) => migrated.has(id));
    const dependsOn = task.dependsOn.map((on) => renamed.get(on) ?? on);
    return {
      ...task,
      id: renamed.get(task.id) ?? task.id,
      dependsOn: waits ? [first.id, ...dependsOn] : dependsOn,
    };
  });
  return { ...content, tasks: [first, ...moved] };
}

// RF-627, P9-06, EV-108: a requirement of the plan is an item like a feature or a table. It is built
// when a task card lists it in `requirements`, so a plan never completes with a requirement that no
// card builds. The planner may write `requirement:REQ-020` in the `builds` of a gap card or in a
// link of the gap round; code then moves it to the card's requirements, so `builds` holds only the
// items of the documents and the requirement is listed once.

const REQUIREMENT_PREFIX = 'requirement:';

type Requirement = PlanContent['requirements'][number];

/** The id of the item for a requirement id (`requirement:REQ-020`). */
export function requirementItemId(requirementId: string): string {
  return `${REQUIREMENT_PREFIX}${requirementId}`;
}

/** One item per requirement of the plan, in the order of the plan. */
// RF-627
export function requirementItems(requirements: readonly Requirement[]): CoverageItem[] {
  return requirements.map((each) => ({
    ...{ id: requirementItemId(each.id), kind: 'requirement' as const },
    name: each.title,
    detail: each.statement,
  }));
}

/** The source cards behind each requirement item (gap cards derive their requirements from them). */
export function requirementSources(
  requirements: readonly Requirement[],
): Map<string, ReadonlySet<string>> {
  return new Map(requirements.map((each) => [requirementItemId(each.id), new Set(each.sources)]));
}

/** The plan with every `requirement:` id of a card's `builds` moved to its `requirements`. */
// RF-627
export function withBuiltRequirements(content: PlanContent): PlanContent {
  const known = new Set(requirementItems(content.requirements).map((each) => each.id));
  const isRequirement = (id: string): boolean => id.startsWith(REQUIREMENT_PREFIX);
  if (!content.tasks.some((task) => task.builds.some(isRequirement))) return content;
  const tasks = content.tasks.map((task) => {
    if (!task.builds.some(isRequirement)) return task;
    const added = task.builds
      .filter((id) => known.has(id))
      .map((id) => id.slice(REQUIREMENT_PREFIX.length));
    const requirements = [...new Set([...task.requirements, ...added])];
    return { ...task, builds: task.builds.filter((id) => !isRequirement(id)), requirements };
  });
  return { ...content, tasks };
}
