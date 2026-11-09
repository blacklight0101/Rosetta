import { RosettaError } from '../../domain/errors/rosetta-error.js';
import {
  coverageOf,
  type CoverageDocuments,
  type CoverageItem,
} from '../../domain/planning/plan-coverage.js';
import { settleDerivedRequirements } from '../../domain/planning/derived-requirements.js';
import type { LeftOutCard } from '../../domain/planning/left-out-card.js';
import { linkGapItems, type GapLinked, type LinkedGap } from '../../domain/planning/gap-links.js';
import type { PlanContent } from '../../domain/planning/plan-content.js';
import { addGapTasks, type GapLeftOut } from '../../domain/planning/plan-gap.js';
import { sourcesWithModules, type ModuleReason } from '../../domain/planning/module-coverage.js';
import { titlePhases } from '../../domain/planning/phase-titles.js';
import type { PromptFile } from '../agent/prompt-file.js';
import { askPlannerWith, type PlannerCall } from './ask-planner.js';
import { gapMessage } from './gap-message.js';
import { parseGapAnswer, type GapAnswer, type GapProblem } from './gap-answer.js';
import { moduleReasons } from './module-reasons.js';
import { gapRepairMessage, type GapRepair } from './gap-repair-message.js';
import { entryWarnings, gapLeftOutItems, linkWarnings } from './gap-round-notes.js';
import type { HandoffPackage } from './handoff-package.js';
import {
  checkedPlan,
  coverageWarnings,
  planCoverage,
  type CoverageInput,
  type PlannedCoverage,
} from './plan-coverage.js';

// Q-45, Q-54, RF-627, RF-202, ADR-003, ADR-006, ADR-007: which task cards build which items of the
// package, in the calls the planner gets for it. The first links the cards it planned to the items
// (plan-coverage.ts). When items are still built by no card, the planner gets one more call that lists
// only those items and asks for task cards that build them; the cards join the plan after the last.
// When that answer left out cards that named an item still uncovered (a position written as a text,
// say), the planner gets one repair attempt: the same call for the items still uncovered, with the
// problems listed, and its cards join the plan after the others. What is still uncovered is the gap
// the run reports. P8-95: an answer may link an item to a card the plan already has instead of
// writing a card that repeats its work (gap-links.ts); that card then builds it. Both calls go through the same guarded provider as every planner call, so the
// budget guard and the Ollama context guard (RST-1522) can refuse them; a refusal, like any failure
// of the call, keeps the plan as the calls before it left it and is handed back for the caller to end
// the run with its code. An answer that is unusable adds no card and is not a failure. Every card
// left out of an answer is reported with its position and field, never with text of the answer.

export interface PlannedLinks {
  /** The plan with its task cards, and the items still uncovered. */
  readonly planned: PlannedCoverage;
  /** What to log: cards left out, an answer that could not be read, and the items no card builds. */
  readonly warnings: readonly string[];
  /** P7-14: the cards the gap and repair answers left out, or kept with entries dropped, for checks.md. */
  readonly leftOut: HandoffPackage['leftOut'];
  /** Why the extra call was not served; the plan is then the one the calls before it left. */
  readonly refusal?: RosettaError;
  /** P8-06: why each module or the deployment material has no task card, for checks.md. */
  readonly moduleReasons: readonly ModuleReason[];
}

export interface LinkCalls {
  readonly coverage: PlannerCall;
  readonly gap: PlannerCall;
  /** Q-54: the versioned prompt that asks for the cards again, with the problems listed. */
  readonly repairPrompt: PromptFile;
  /** RF-607: given SDD, a task card that implements no requirement is not written. */
  readonly specificationDriven: boolean;
}

const UNREADABLE_GAP =
  'The planner answer with the task cards for the items no card builds could not be read; none was added.';
const UNREADABLE_REPAIR =
  'The planner answer with the repaired task cards for the items no card builds could not be read; none was added.';

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
function gapItems(report: PlannedCoverage['report']): CoverageItem[] {
  return [...report.uncovered, ...report.modules];
}

/** One call for the items still uncovered, its cards added to the plan; the repair lists problems. */
async function gapRound(
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
function roundWarnings(round: Round, label: string, unreadable: string): string[] {
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
    ...linkWarnings(label, round.linked, round.droppedLinks),
    ...round.problems.map(
      ({ position, field, reason }) =>
        `Task card at position ${String(position)} of the ${label} was left out: the field "${field}" ${reason}.`,
    ),
  ];
}

/** P7-14: the rows of checks.md for a round, under the answer's own area. */
function roundLeftOut(round: Round, area: string): HandoffPackage['leftOut'] {
  return gapLeftOutItems(area, round.problems, round.answer?.entries ?? []);
}

/**
 * The cards left out that call for the repair (RF-627): one that named an item which is still built
 * by no card, or one whose builds are no valid builds for the block (missing, empty, or naming
 * nothing uncovered, a title for example).
 */
function repairable(
  problems: readonly GapProblem[],
  uncovered: readonly CoverageItem[],
): GapProblem[] {
  const open = new Set(uncovered.map((item) => item.id));
  return problems.filter(
    (problem) => problem.field === 'builds' || problem.builds.some((id) => open.has(id)),
  );
}

/** The call for the items still uncovered and, when cards were left out that named one, the repair. */
async function planGap(
  calls: LinkCalls,
  covered: PlannedCoverage,
  documents: CoverageDocuments,
): Promise<Gapped> {
  const { specificationDriven } = calls;
  if (gapItems(covered.report).length === 0 || covered.content.phases.length === 0) {
    return { planned: covered, warnings: [], leftOut: [], problems: [] };
  }
  const first = await gapRound(calls.gap, covered, { specificationDriven, documents });
  const warnings = roundWarnings(first, 'gap answer', UNREADABLE_GAP);
  const leftOut = roundLeftOut(first, 'Gap answer');
  // RF-627: once the first round covered every item there is nothing for a repair to build.
  const open = gapItems(first.planned.report);
  const problems = open.length === 0 ? [] : repairable(first.problems, open);
  if (problems.length === 0) {
    return { planned: first.planned, warnings, leftOut, problems: first.problems };
  }
  const repair = { prompt: calls.repairPrompt, problems };
  try {
    const second = await gapRound(calls.gap, first.planned, {
      specificationDriven,
      documents,
      repair,
    });
    const again = roundWarnings(second, 'gap repair answer', UNREADABLE_REPAIR);
    const repaired = [...leftOut, ...roundLeftOut(second, 'Gap repair answer')];
    const all = [...first.problems, ...second.problems];
    const planned = second.planned;
    return { planned, warnings: [...warnings, ...again], leftOut: repaired, problems: all };
  } catch (error) {
    if (calls.gap.signal.aborted || !(error instanceof RosettaError)) throw error;
    return { planned: first.planned, warnings, leftOut, refusal: error, problems: first.problems };
  }
}

/** P5-40: the phases named after the cards they hold, once the last card has joined the plan. */
function titled(planned: PlannedCoverage): PlannedCoverage {
  return { ...planned, content: titlePhases(planned.content) };
}

/** The links after the gap rounds, with every card those rounds left out (P8-06 reasons). */
interface Gapped extends Omit<PlannedLinks, 'moduleReasons'> {
  readonly problems: readonly GapProblem[];
}

interface Settled {
  readonly covered: PlannedCoverage;
  readonly warnings: readonly string[];
  readonly leftOut: HandoffPackage['leftOut'];
}

/**
 * P8-02, RF-607: once the cards are linked, a package card that named no requirement takes them
 * from what it builds; one with nothing to derive is left out, logged and listed in checks.md.
 */
function settled(linked: PlannedCoverage, documents: CoverageDocuments): Settled {
  const derived = settleDerivedRequirements(linked.content, documents);
  if (derived.content === linked.content) return { covered: linked, warnings: [], leftOut: [] };
  const { leftOut } = derived;
  const { content } = derived;
  const covered = { ...linked, content, report: coverageOf(linked.report.items, content.tasks) };
  const rows = leftOut.map(({ position, field, reason }: LeftOutCard) => ({
    ...{ area: 'Task cards', item: String(position), field, reason },
  }));
  const warnings = leftOut.map(
    ({ position, field, reason }) =>
      `Task card at position ${String(position)} of the plan answer was left out (the field "${field}"). ${reason}`,
  );
  return { covered, warnings, leftOut: rows };
}

// Q-45, Q-54, RF-627, P8-06
export async function planLinks(calls: LinkCalls, input: CoverageInput): Promise<PlannedLinks> {
  const linked = await planCoverage(calls.coverage, input);
  const { covered, warnings, leftOut } = settled(linked, input.documents);
  const asked = covered.content.phases.length > 0;
  const { modules } = input.documents;
  try {
    const { problems, ...gap } = await planGap(calls, covered, input.documents);
    const planned = titled(gap.planned);
    const rounds = { asked, refused: gap.refusal !== undefined, problems };
    return {
      ...gap,
      planned,
      warnings: [...warnings, ...gap.warnings, ...coverageWarnings(planned)],
      leftOut: [...leftOut, ...gap.leftOut],
      moduleReasons: moduleReasons(planned.report.modules, rounds, modules),
    };
  } catch (error) {
    if (calls.gap.signal.aborted || !(error instanceof RosettaError)) throw error;
    const planned = titled(covered);
    const all = [...warnings, ...coverageWarnings(planned)];
    const rounds = { asked, refused: true, problems: [] };
    const reasons = moduleReasons(planned.report.modules, rounds, modules);
    return { planned, warnings: all, leftOut, refusal: error, moduleReasons: reasons };
  }
}
