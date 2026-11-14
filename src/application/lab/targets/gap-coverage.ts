import { planId } from '../../../domain/planning/plan-content.js';
import {
  isMigrationCard,
  isSourceKind,
  requirementItemId,
} from '../../../domain/planning/plan-coverage.js';
import { draftFault } from '../../../domain/planning/left-out-card.js';
import type { GapAnswer } from '../../plan/gap-answer.js';

// RF-1406, RF-627, P10-07: the lab's check of a gap or gap repair answer, with the run's own rules
// (`gap-round.ts`, `gap-rounds.ts`, `plan-gap.ts`, `gap-links.ts`). A card counts when `draftFault`
// finds nothing in it and it builds an item of the block; a link counts when it names a card of the
// case's plan other than the migrations card and an item of the block. `LeftOut`: a card was left
// out that names an item still open, or gives no valid builds while one is open, so a run makes its
// one repair call; `Open`: an item that is not a part of the source is still built by no card, so a
// run asks a second round and may end RST-1806; `ModulesOpen`: only parts of the source (modules,
// deployment) are left, which a run lists with no further call; `Covered`: nothing is left. A
// `requirement:` item is also covered by a counted card that lists the requirement (its position read
// as the run's `REQ-` id, `coverageOf`, P9-06). The repair call and the second round are also given
// apart from the label (RF-1403), so one answer may count for both. Not replayed: the requirement check of a specification-driven plan (a case holds no sources) and the
// dependencies.

interface GapCoverage {
  readonly detail: 'Covered' | 'ModulesOpen' | 'Open' | 'LeftOut';
  /** A run makes its one repair call after this answer (the gap call only). */
  readonly repairCall: boolean;
  /** An item that is not a part of the source is still open after this answer. */
  readonly secondRound: boolean;
}

interface GapCase {
  readonly items: readonly { readonly id: string; readonly kind: string }[];
  readonly phases: readonly unknown[];
  readonly tasks: readonly { readonly id: string; readonly title: string }[];
}

/** A card left out of the plan: the ids it named and whether its builds were the fault. */
interface LeftOutCard {
  readonly builds: readonly string[];
  readonly noBuilds: boolean;
}

function inBlock(ids: readonly string[], block: ReadonlySet<string>): string[] {
  return ids.filter((id) => block.has(id));
}

/** The items the counted cards and links build, and the cards the run leaves out. */
function readAnswer(answer: GapAnswer, input: GapCase) {
  const block = new Set(input.items.map((item) => item.id));
  const built = new Set<string>();
  const leftOut: LeftOutCard[] = answer.problems.map((each) => ({
    ...{ builds: each.builds, noBuilds: each.field === 'builds' },
  }));
  for (const draft of answer.drafts) {
    const builds = inBlock(draft.builds, block);
    const fault = draftFault(draft, input.phases.length);
    if (fault === undefined && builds.length > 0) {
      // P9-06: a requirement item is built by a card that lists the requirement.
      const listed = draft.requirements.map((at) => requirementItemId(planId('REQ', at)));
      inBlock([...builds, ...listed], block).forEach((id) => built.add(id));
    } else leftOut.push({ builds: draft.builds, noBuilds: fault === undefined });
  }
  const cards = new Map(input.tasks.map((task) => [task.id, task]));
  for (const link of answer.links ?? []) {
    const card = cards.get(link.task);
    if (card === undefined || isMigrationCard(card)) continue;
    inBlock(link.builds, block).forEach((id) => built.add(id));
  }
  return { built, leftOut };
}

/** RF-1406: how a gap round of a run goes on after this answer, read from the answer alone. */
// RF-1406, RF-627
export function gapCoverage(answer: GapAnswer, input: GapCase): GapCoverage {
  const { built, leftOut } = readAnswer(answer, input);
  const open = input.items.filter((item) => !built.has(item.id));
  const openIds = new Set(open.map((item) => item.id));
  const repair = leftOut.some((card) => card.noBuilds || card.builds.some((id) => openIds.has(id)));
  const repairCall = open.length > 0 && repair;
  const secondRound = open.some((item) => !isSourceKind(item.kind));
  const rest = open.length > 0 ? 'ModulesOpen' : 'Covered';
  const detail = repairCall ? 'LeftOut' : secondRound ? 'Open' : rest;
  return { detail, repairCall, secondRound };
}
