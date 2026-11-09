import {
  coverageOf,
  type CoverageDocuments,
  type CoverageItem,
} from '../../domain/planning/plan-coverage.js';
import { linkGapItems, type GapLinked, type LinkedGap } from '../../domain/planning/gap-links.js';
import type { PlanContent } from '../../domain/planning/plan-content.js';
import { addGapTasks, type GapLeftOut } from '../../domain/planning/plan-gap.js';
import { sourcesWithModules } from '../../domain/planning/module-coverage.js';
import { askPlannerWith, type PlannerCall } from './ask-planner.js';
import { gapMessage } from './gap-message.js';
import { parseGapAnswer, type GapAnswer, type GapProblem } from './gap-answer.js';
import { gapRepairMessage, type GapRepair } from './gap-repair-message.js';
import {
  entryWarnings,
  gapLeftOutItems,
  linkListWarnings,
  linkWarnings,
} from './gap-round-notes.js';
import type { HandoffPackage } from './handoff-package.js';
import { checkedPlan, type PlannedCoverage } from './plan-coverage.js';

// Q-45, Q-54, RF-627, P8-06, P8-95: one call of a gap round. It lists the items still built by no
// card (and the modules no card touches), reads the answer's cards and links, adds the cards the
// plan takes after the last and gives each linked item to its card of the plan, then checks the
// plan again. A repair is the same call with the problems listed after the data. What the answer
// left out is reported by position and field, never with text of the answer (gap-round-notes.ts).

interface Round {
  readonly planned: PlannedCoverage;
  /** Undefined when the answer was no list of cards. */
  readonly answer: GapAnswer | undefined;
  /** Every card left out, unreadable or not taken by the plan, in the order of the answer. */
  readonly problems: readonly GapProblem[];
  /** P8-95: the items the answer linked to cards of the plan, and the links it dropped. */
  readonly linked: readonly GapLinked[];
  readonly droppedLinks: readonly GapLeftOut[];
}

interface RoundOptions {
  readonly specificationDriven: boolean;
  /** P5-40: the documents the plan is checked against after the cards join it. */
  readonly documents: CoverageDocuments;
  /** Set for the repair attempt: the prompt and the problems that go after the data. */
  readonly repair?: GapRepair;
}

/** P8-06: what a gap round asks for: the items no card builds, then the modules no card touches. */
export function gapItems(report: PlannedCoverage['report']): CoverageItem[] {
  return [...report.uncovered, ...report.modules];
}

/** One call for the items still uncovered, its cards added to the plan; the repair lists problems. */
export async function gapRound(
  call: PlannerCall,
  planned: PlannedCoverage,
  options: RoundOptions,
): Promise<Round> {
  const { content, report } = planned;
  // P8-06: the modules no card touches are asked for with the items no card builds.
  const open = gapItems(report);
  const input = { items: open, content };
  const { repair, specificationDriven, documents } = options;
  const message =
    repair === undefined
      ? gapMessage(input, call.tags)
      : gapRepairMessage(input, repair, call.tags);
  const only = open.length === 1 ? open[0]?.id : undefined;
  const answer = parseGapAnswer(await askPlannerWith(call, message), only);
  const positions = answer?.positions;
  const taken = addGapTasks(content, answer?.drafts ?? [], open, {
    ...{ specificationDriven, ...(positions === undefined ? {} : { positions }) },
    itemSources: sourcesWithModules(documents),
  });
  const linked = linkedItems(answer, content, taken.content, open);
  const grown = checkedPlan(linked.content, documents);
  const closed = { ...planned, content: grown, report: coverageOf(report.items, grown.tasks) };
  const problems = byPosition(answer?.problems, taken.leftOut);
  const droppedLinks = byPosition(answer?.linkProblems, linked.dropped);
  return { planned: closed, answer, problems, linked: linked.linked, droppedLinks };
}

/** P8-95: the plan with the items the answer linked; a link counts only for a card of `before`. */
function linkedItems(
  answer: GapAnswer | undefined,
  before: PlanContent,
  after: PlanContent,
  open: readonly CoverageItem[],
): LinkedGap {
  const cards = before.tasks.map((task) => task.id);
  return linkGapItems(after, answer?.links ?? [], open, cards);
}

/** What the answer could not read and what the plan did not take, in the order of the answer. */
function byPosition(
  unread: readonly GapProblem[] | undefined,
  refused: readonly GapLeftOut[],
): GapProblem[] {
  return [...(unread ?? []), ...refused].sort((left, right) => left.position - right.position);
}

/** What to log about an answer: the cards left out, by position and field, or that it was no answer. */
export function roundWarnings(round: Round, label: string, unreadable: string): string[] {
  if (round.answer === undefined) return [unreadable];
  const rule = round.answer.singleItemRule;
  const ruled =
    rule === undefined
      ? []
      : [
          `The single-item rule (RF-627) gave the only uncovered item, ${rule}, to the card without builds in the ${label}.`,
        ];
  return [
    ...ruled,
    ...entryWarnings(label, round.answer.salvaged === true, round.answer.entries),
    ...linkListWarnings(label, round.answer),
    ...linkWarnings(label, round.linked, round.droppedLinks),
    ...round.problems.map(
      ({ position, field, reason }) =>
        `Task card at position ${String(position)} of the ${label} was left out: the field "${field}" ${reason}.`,
    ),
  ];
}

/** P7-14: the rows of checks.md for a round, under the answer's own area. */
export function roundLeftOut(round: Round, area: string): HandoffPackage['leftOut'] {
  return gapLeftOutItems(area, round.problems, round.answer?.entries ?? []);
}
