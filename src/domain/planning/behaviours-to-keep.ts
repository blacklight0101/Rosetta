import type { Citation } from '../cards/citation.js';
import type { ClaimJudgement } from './claim-judgement.js';
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

/** Item id (`flow:FLOW-001`) to the card ids it traces to. */
export type BuiltScope = ReadonlyMap<string, readonly string[]>;

/** The item kinds whose built items narrow the cards of a type (P5-41). */
const scopeKinds: Readonly<Record<string, string>> = {
  FEAT: 'feature:',
  FLOW: 'flow:',
  SCRN: 'screen:',
};

/**
 * P5-41: a card of a type that the task builds items of counts only when one of those items traces to
 * it. A task that links no item of that kind keeps every card its requirements cite.
 */
function inScope(task: PlanTask, card: SourceCard, scope: BuiltScope | undefined): boolean {
  const prefix = scopeKinds[card.type];
  if (scope === undefined || prefix === undefined) return true;
  const items = task.builds.filter((id) => id.startsWith(prefix));
  if (items.length === 0) return true;
  return items.some((id) => scope.get(id)?.includes(card.id) === true);
}

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

interface Input {
  readonly task: PlanTask;
  readonly requirements: readonly Requirement[];
  readonly sources: readonly SourceCard[];
  readonly scope?: BuiltScope | undefined;
}

/** The supported claims of the covered cards the task's requirements come from, that `keeps` allows. */
function keptFrom(
  input: Input,
  keeps: (card: SourceCard, claim: SourceClaim) => boolean,
): KeptBehaviour[] {
  const { task, requirements, sources, scope } = input;
  const built = new Set(
    requirements
      .filter((each) => task.requirements.includes(each.id))
      .flatMap((each) => each.sources),
  );
  return sources
    .filter((card) => built.has(card.id) && coveredTypes.includes(card.type))
    .filter((card) => inScope(task, card, scope))
    .flatMap((card) =>
      card.claims
        .filter((claim) => claim.status === 'Supported' && keeps(card, claim))
        .map(({ claimId, text, citations }) => ({ cardId: card.id, claimId, text, citations })),
    );
}

/** The behaviours the plain rules give the task, before any judgement. */
function plainBehaviours(
  task: PlanTask,
  requirements: readonly Requirement[],
  sources: readonly SourceCard[],
  context: BehaviourContext,
): KeptBehaviour[] {
  const { scope, tables = [] } = context;
  const input = { task, requirements, sources, scope };
  if (!isMigrationCard(task)) return keptFrom(input, () => true);
  const names = namesOf(tables.filter((table) => task.builds.includes(`table:${table.name}`)));
  return keptFrom(input, (card, claim) => card.type === 'BR' && namesAnItem(claim, names));
}

/** The behaviours of the task, in card order, each card once. */
// RF-631, RF-623
export function behavioursToKeep(
  task: PlanTask,
  requirements: readonly Requirement[],
  sources: readonly SourceCard[],
  tables: readonly ModelTable[] = [],
): KeptBehaviour[] {
  return plainBehaviours(task, requirements, sources, { tables });
}

/**
 * The behaviours the plain rule gives some task (every covered claim of the cards its requirements
 * cite) that no task keeps, changes or lists as keep-or-fix now: those the migrations card's rule or
 * the narrowing to the built items removed from every card (P5-41).
 */
// RF-631
export function behavioursKeptByNoCard(
  tasks: readonly PlanTask[],
  requirements: readonly Requirement[],
  sources: readonly SourceCard[],
  context: BehaviourContext = {},
): KeptBehaviour[] {
  const present = new Set(
    tasks.flatMap((task) => {
      const { keep, change, fix } = behavioursOf(task, requirements, sources, context);
      return [...keep, ...change, ...fix].map((each) => each.claimId);
    }),
  );
  const seen = new Set<string>();
  return tasks
    .flatMap((task) => keptFrom({ task, requirements, sources }, () => true))
    .filter((each) => {
      if (present.has(each.claimId) || seen.has(each.claimId)) return false;
      seen.add(each.claimId);
      return true;
    });
}

export interface BehaviourContext {
  /** The tables the migrations card creates (RF-623). */
  readonly tables?: readonly ModelTable[];
  /** Item id (`flow:FLOW-001`) to the card ids it traces to. */
  readonly scope?: BuiltScope;
  readonly judgements?: readonly ClaimJudgement[];
}

export interface ChangedBehaviour extends KeptBehaviour {
  readonly decisionId?: string | undefined;
  readonly answerCard?: string | undefined;
}

export interface Behaviours {
  readonly keep: KeptBehaviour[];
  readonly change: ChangedBehaviour[];
  readonly fix: KeptBehaviour[];
}

/** The behaviours of the task sorted into keep, change and keep-or-fix; every claim is in one list. */
// RF-631, P5-41
export function behavioursOf(
  task: PlanTask,
  requirements: readonly Requirement[],
  sources: readonly SourceCard[],
  context: BehaviourContext = {},
): Behaviours {
  const judged = new Map((context.judgements ?? []).map((each) => [each.claimId, each]));
  const result: { keep: KeptBehaviour[]; change: ChangedBehaviour[]; fix: KeptBehaviour[] } = {
    keep: [],
    change: [],
    fix: [],
  };
  for (const each of plainBehaviours(task, requirements, sources, context)) {
    const judgement = judged.get(each.claimId);
    if (judgement === undefined) result.keep.push(each);
    else if (judgement.kind === 'defect') result.fix.push(each);
    else {
      const { decisionId, answerCard } = judgement;
      result.change.push({ ...each, decisionId, answerCard });
    }
  }
  return result;
}
