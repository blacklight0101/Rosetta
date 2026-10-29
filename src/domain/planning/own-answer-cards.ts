import { foundationTitles, skeletonStyleCriterion } from './foundation-cards.js';
import type { PlanContent, PlanTask } from './plan-content.js';
import type { PlanningBrief } from './planning-brief.js';
import { typedAnswers } from './typed-answers.js';

// RF-605, RF-645, DEC-184: the fixed cards that follow an own answer. The cut-over card of a catalogue
// strategy prescribes that strategy (a routing layer for a strangler fig, a freeze for a rewrite);
// with an own migration answer the card follows the owner's answer in its decision record and
// prescribes none. With an own architecture answer the skeleton card points to the owner's answer
// instead of the layers of a catalogue style. The owner's text is never copied into a card: it stays
// in the decision record, escaped there (ADR-013). The record ids are known only once the decisions
// are numbered, so this runs after them.

/** The decision records of the own answers: the style (empty when there is none) and the migration strategy. */
export interface OwnAnswerRecords {
  readonly style: string;
  readonly migration: string;
}

type CardText = Pick<PlanTask, 'invariant' | 'acceptanceCriteria' | 'probes' | 'riskClass'>;

function where(record: string): string {
  return record === '' ? '' : ` in ${record}`;
}

/** The cut-over card for an own migration answer: no strategy of the catalogue, only the answer's record. */
function ownCutOver(record: string): CardText {
  const answer = `the owner's own migration answer${where(record)}`;
  return {
    invariant: `The cut-over follows ${answer}: every part of the legacy system moves to the new system in the order and the way that answer describes, every move can be undone, and the legacy system is switched off only after the last part is live.`,
    riskClass: 'data loss',
    acceptanceCriteria: [
      `Given ${answer}, when the cut-over plan is written, then it names every part of the legacy system, the order in which the parts move and how each move is undone.`,
      'Given a part that went live and failed its checks, when its move is undone, then users reach the legacy system for that part again with no data lost.',
      'Given the last part is live, when the legacy system is switched off, then nothing reaches it any more.',
    ],
    probes: [
      'A cut-over plan that leaves out a part of the legacy system => the review refuses it and names the part.',
      'A part that went live fails its checks => its move is undone and users reach the legacy system for it again.',
      'The legacy system is switched off while a part is not live yet => the switch-off is refused and names the part.',
    ],
  };
}

function ownSkeletonCriterion(record: string): string {
  return `Given the parts of the architecture that the owner's own architecture answer${where(record)} describes, when the skeleton is built, then each part has its own place and a part that reaches into one it may not use fails the structure check.`;
}

function followingAnswers(
  task: PlanTask,
  own: ReturnType<typeof typedAnswers>,
  records: OwnAnswerRecords,
): PlanTask {
  if (own.migration !== undefined && task.title === foundationTitles.cutOver) {
    return { ...task, ...ownCutOver(records.migration) };
  }
  if (own.architecture !== undefined && task.title === foundationTitles.skeleton) {
    const criteria = task.acceptanceCriteria.map((each) =>
      each === skeletonStyleCriterion ? ownSkeletonCriterion(records.style) : each,
    );
    return { ...task, acceptanceCriteria: criteria };
  }
  return task;
}

/** The plan with its fixed cards following the owner's own answers; unchanged when there is none. */
// RF-645
export function withOwnAnswerCards(
  content: PlanContent,
  brief: Pick<PlanningBrief, 'defaulted' | 'typed'>,
  records: OwnAnswerRecords,
): PlanContent {
  const own = typedAnswers(brief);
  if (own.migration === undefined && own.architecture === undefined) return content;
  return { ...content, tasks: content.tasks.map((task) => followingAnswers(task, own, records)) };
}
