import { inferComponent, type ComponentText, type StepEvidence } from './flow-step-components.js';
import type { SourceCard } from './plan-sources.js';
import {
  MAX_FLOWS,
  type DraftFlow,
  type FlowStep,
  type FlowsAssembly,
  type FlowsDraft,
  type MappedFlow,
  type OutOfScopeFlow,
} from './target-flows.js';

// RF-625, Q-27: the planner's flows draft made into the flows the package writes. Every verified
// `FLOW` card ends up mapped or listed as out of scope: a card the planner said nothing usable
// about is listed by the code, with a reason that says so, so nothing is silently lost. A step is
// a supported claim of its own card; a component the architecture does not have maps nothing.

const unlistedReason =
  'The planner neither mapped nor left out this journey; confirm whether it is in scope.';
const unmappedReason =
  'The planner mapped none of its steps to a component of the target architecture.';
const noArchitectureReason = 'The target architecture names no component to map the steps to.';
const overCapReason = `More than ${String(MAX_FLOWS)} journeys were mapped; this one is over the cap (Q-27).`;
const leftOutReason = 'The planner left this journey out of scope without a reason.';

type DraftStep = DraftFlow['steps'][number];

/** The component the code finds for a step the planner left unplaced; null for none. */
function foundFor(
  evidence: StepEvidence | undefined,
  placed: readonly StepEvidence[],
  checks: Known,
): string | null {
  return evidence === undefined ? null : inferComponent(evidence, placed, checks.described);
}

/** The steps the card states, each with the planner's component when the architecture has it. */
function stepsOf(
  card: SourceCard,
  draft: DraftFlow,
  checks: Known,
): { steps: FlowStep[]; refused: number } {
  const mapping = new Map<string, DraftStep>();
  let refused = 0;
  for (const step of draft.steps) {
    const own = card.claims.some((claim) => claim.claimId === step.claim);
    if (!own || !checks.components.has(step.component) || mapping.has(step.claim)) refused += 1;
    else mapping.set(step.claim, step);
  }
  const placed = card.claims.map((claim) => ({
    files: [...new Set(claim.citations.map((citation) => citation.path))],
    component: mapping.get(claim.claimId)?.component ?? null,
  }));
  const steps = card.claims.map((claim, index) => {
    const evidence = placed[index];
    const files = evidence?.files ?? [];
    const mapped = mapping.get(claim.claimId);
    const found = mapped === undefined ? foundFor(evidence, placed, checks) : null;
    const touches =
      claim.target !== undefined && checks.cards.has(claim.target) ? claim.target : null;
    return {
      ...{ claimId: claim.claimId, text: claim.text, touches },
      component: mapped?.component ?? found,
      action: mapped?.action ?? '',
      files,
      inferred: found !== null,
    };
  });
  return { steps, refused };
}

function outOf(card: SourceCard, reason: string, byPlanner: boolean): OutOfScopeFlow {
  return { cardId: card.id, title: card.title, reason, byPlanner };
}

interface Known {
  readonly components: ReadonlySet<string>;
  /** The components with their responsibility, for placing a step by the files it cites. */
  readonly described: readonly ComponentText[];
  readonly cards: ReadonlySet<string>;
}

/** Where one verified flow card ends up: mapped or out of scope, and the steps refused on the way. */
interface Placed {
  readonly mapped?: MappedFlow;
  readonly out?: OutOfScopeFlow;
  readonly refused: number;
}

function mappedOf(card: SourceCard, steps: readonly FlowStep[]): MappedFlow {
  const { id, title, flow } = card;
  return { cardId: id, title, trigger: flow?.trigger ?? '', outcome: flow?.outcome ?? '', steps };
}

/** The card listed as out of scope before its steps are looked at. */
function outBefore(card: SourceCard, entry: DraftFlow | undefined, known: Known): OutOfScopeFlow {
  if (known.components.size === 0) return outOf(card, noArchitectureReason, false);
  if (entry === undefined) return outOf(card, unlistedReason, false);
  return outOf(card, entry.reason === '' ? leftOutReason : entry.reason, true);
}

function placed(
  card: SourceCard,
  entry: DraftFlow | undefined,
  known: Known,
  full: boolean,
): Placed {
  if (known.components.size === 0 || entry?.inScope !== true) {
    return { out: outBefore(card, entry, known), refused: 0 };
  }
  const built = stepsOf(card, entry, known);
  const unmapped = built.steps.every((step) => step.component === null);
  if (unmapped || full) {
    const reason = unmapped ? unmappedReason : overCapReason;
    return { out: outOf(card, reason, false), refused: built.refused };
  }
  return { mapped: mappedOf(card, built.steps), refused: built.refused };
}

/**
 * The flows for these verified `FLOW` cards. `allCards` are all the supported cards, so a step may
 * name the card it touches; `components` are the names of the target architecture's components.
 */
// RF-625
export function assembleFlows(
  draft: FlowsDraft | undefined,
  cards: readonly SourceCard[],
  checks: {
    readonly components: readonly string[];
    /** The components with their responsibility; a name alone is placed by folder only. */
    readonly described?: readonly ComponentText[];
    readonly allCards: readonly SourceCard[];
  },
): FlowsAssembly {
  const known = {
    components: new Set(checks.components),
    described: checks.described ?? checks.components.map((name) => ({ name, responsibility: '' })),
    cards: new Set(checks.allCards.map((card) => card.id)),
  };
  const byCard = new Map<string, DraftFlow>();
  for (const flow of draft?.flows ?? []) if (!byCard.has(flow.card)) byCard.set(flow.card, flow);
  const mapped: MappedFlow[] = [];
  const outOfScope: OutOfScopeFlow[] = [];
  let refusedSteps = 0;
  for (const card of cards) {
    const result = placed(card, byCard.get(card.id), known, mapped.length >= MAX_FLOWS);
    refusedSteps += result.refused;
    if (result.mapped !== undefined) mapped.push(result.mapped);
    if (result.out !== undefined) outOfScope.push(result.out);
  }
  const ids = new Set(cards.map((card) => card.id));
  const unknown = [...byCard.keys()].filter((id) => !ids.has(id)).length;
  return { flows: { flows: mapped, outOfScope }, leftOut: { flows: unknown, steps: refusedSteps } };
}
