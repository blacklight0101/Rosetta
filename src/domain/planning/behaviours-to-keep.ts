import type { Citation } from '../cards/citation.js';
import type { ModelTable } from './data-model.js';
import { isMigrationCard } from './plan-coverage.js';
import type { PlanTask } from './plan-content.js';
import type { SourceCard } from './plan-sources.js';

// RF-631, DEC-135, ADR-018: the behaviour of the legacy system a task card must not change. It is
// taken by code, never by the model: the supported claims, with their citations, of the FEAT, BR,
// FLOW and SCRN cards that the requirements the task builds come from. The migrations card (RF-623)
// keeps only the business rules that name a table or a column it creates: a feature, a flow or a
// screen cannot be pinned by a migration. The behaviour that no card keeps any more is listed in
// checks.md (behavioursKeptByNoCard).

/** The card types whose behaviour a rewrite must keep. */
const coveredTypes: readonly string[] = ['FEAT', 'BR', 'FLOW', 'SCRN'];

type SourceClaim = SourceCard['claims'][number];

interface Requirement {
  readonly id: string;
  readonly sources: readonly string[];
}

export interface KeptBehaviour {
  readonly cardId: string;
  readonly claimId: string;
  readonly text: string;
  readonly citations: readonly Citation[];
}

/** The lower-case names of the tables and their columns the migrations card creates. */
function namesOf(tables: readonly ModelTable[]): Set<string> {
  return new Set(
    tables
      .flatMap((table) => [table.name, ...table.columns.map((column) => column.name)])
      .map((name) => name.toLowerCase()),
  );
}

/** A claim names an item when one of its words, in its text or in a citation path, is such a name. */
function namesAnItem(claim: SourceClaim, names: ReadonlySet<string>): boolean {
  const text = [claim.text, ...claim.citations.map((citation) => citation.path)].join(' ');
  const words = text.toLowerCase().match(/[a-z0-9_]+/gu) ?? [];
  return words.some((word) => names.has(word));
}

/** The supported claims of the covered cards the task's requirements come from, that `keeps` allows. */
function keptFrom(
  task: PlanTask,
  requirements: readonly Requirement[],
  sources: readonly SourceCard[],
  keeps: (card: SourceCard, claim: SourceClaim) => boolean,
): KeptBehaviour[] {
  const built = new Set(
    requirements
      .filter((each) => task.requirements.includes(each.id))
      .flatMap((each) => each.sources),
  );
  return sources
    .filter((card) => built.has(card.id) && coveredTypes.includes(card.type))
    .flatMap((card) =>
      card.claims
        .filter((claim) => claim.status === 'Supported' && keeps(card, claim))
        .map(({ claimId, text, citations }) => ({ cardId: card.id, claimId, text, citations })),
    );
}

/** The behaviours of the task, in card order, each card once. */
// RF-631, RF-623
export function behavioursToKeep(
  task: PlanTask,
  requirements: readonly Requirement[],
  sources: readonly SourceCard[],
  tables: readonly ModelTable[] = [],
): KeptBehaviour[] {
  if (!isMigrationCard(task)) return keptFrom(task, requirements, sources, () => true);
  const names = namesOf(tables.filter((table) => task.builds.includes(`table:${table.name}`)));
  return keptFrom(
    task,
    requirements,
    sources,
    (card, claim) => card.type === 'BR' && namesAnItem(claim, names),
  );
}

/**
 * The behaviours the migrations card kept under the plain rule (every covered claim) that no task
 * keeps now. Empty when the package has no migrations card.
 */
// RF-631
export function behavioursKeptByNoCard(
  tasks: readonly PlanTask[],
  requirements: readonly Requirement[],
  sources: readonly SourceCard[],
  tables: readonly ModelTable[],
): KeptBehaviour[] {
  const migration = tasks.find((task) => isMigrationCard(task));
  if (migration === undefined) return [];
  const kept = new Set(
    tasks
      .flatMap((task) => behavioursToKeep(task, requirements, sources, tables))
      .map((each) => each.claimId),
  );
  return keptFrom(migration, requirements, sources, () => true).filter(
    (each) => !kept.has(each.claimId),
  );
}
