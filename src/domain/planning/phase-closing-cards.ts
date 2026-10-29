import { planId, type PlanContent, type PlanTask } from './plan-content.js';

// P6-10, RF-630, RF-635, DEC-176: the cards that close a plan, written by code and never by the
// planner, so the same plan always gets the same cards. A plan of two or more phases ends each
// phase with a verification-matrix card (requirements to tests, measured targets, gaps turned into
// follow-up cards), and a plan with a card of a risk class other than `none` gets one security
// review card in its last phase. The cards take the ids after the last card of the plan.

type CardText = Pick<PlanTask, 'title' | 'invariant' | 'acceptanceCriteria'>;

const matrixPrefix = 'Verify phase ';
const matrixSuffix = ' against its requirements';
const reviewTitle = 'Review the security of the cards at risk';

/** ADR-013: planner output is untrusted, so a planner card that takes a reserved title is renamed. */
function unreserved(task: PlanTask): PlanTask {
  const reserved =
    task.title === reviewTitle ||
    (task.title.startsWith(matrixPrefix) && task.title.endsWith(matrixSuffix));
  return reserved ? { ...task, title: `${task.title} (planner card)` } : task;
}

function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

function matrixText(phase: number, tasks: readonly PlanTask[]): CardText {
  const ids = unique(tasks.flatMap((task) => task.requirements)).sort();
  const listed = ids.length === 0 ? 'of the cards of the phase' : ids.join(', ');
  const n = String(phase);
  return {
    title: `${matrixPrefix}${n}${matrixSuffix}`,
    invariant: `Every requirement built in phase ${n} maps to at least one test that passes, every target of the phase is measured, and no gap stays without a follow-up card.`,
    acceptanceCriteria: [
      `Given the requirements ${listed} built in phase ${n}, when the verification matrix of the phase is written, then each requirement maps to the tests that prove it and names the test file.`,
      `Given a requirement of phase ${n} with no passing test, when the matrix is written, then the requirement is listed as a gap and a follow-up card is added for it.`,
      `Given a target of phase ${n} that states a number, when the matrix is written, then it records the measured value next to the target and marks the target as met or missed.`,
    ],
  };
}

function reviewText(risky: readonly PlanTask[]): CardText {
  const classes = unique(risky.map((task) => task.riskClass)).join(', ');
  const listed = risky.map((task) => `${task.id} (${task.riskClass})`).join(', ');
  return {
    title: reviewTitle,
    invariant: `Every card at a risk (${classes}) has been reviewed against its review probes by a reviewer who did not build it, and no finding stays open.`,
    acceptanceCriteria: [
      `Given the cards ${listed}, when the security review runs, then every card is reviewed against its own review probes and the result of each probe is recorded.`,
      'Given a probe that the work fails, when the security review finishes, then the finding is listed with the card it belongs to and a follow-up card is added for it.',
      'Given a card at a risk with no review probes, when the security review runs, then the card is listed as a gap and the review fails.',
    ],
  };
}

function closing(text: CardText, fields: Pick<PlanTask, 'id' | 'phase' | 'dependsOn'>): PlanTask {
  return {
    ...fields,
    ...text,
    riskClass: 'none',
    probes: [],
    requirements: [],
    adds: [],
    files: [],
    identifiers: [],
    builds: [],
  };
}

/**
 * P6-10: the plan with a verification-matrix card at the end of each phase that has cards (a plan of
 * two or more phases) and, when a card has a risk class other than `none`, a security review card
 * in the last phase that waits for those cards. The last matrix card waits for the review. A plan
 * with no phase or no task is returned as it is. A planner card that has the title of one of these
 * cards is renamed, never taken for one.
 */
export function withPhaseClosingCards(content: PlanContent): PlanContent {
  const tasks = content.tasks.map(unreserved);
  const last = content.phases.length;
  if (last === 0 || tasks.length === 0) return content;
  let next = tasks.length;
  const nextId = (): string => planId('T', ++next);
  const risky = tasks.filter((task) => task.riskClass !== 'none');
  // P6-24: an empty last phase must not strand the review, so the review sits in the last phase that
  // has cards and gates that phase's matrix card.
  const closingPhase =
    content.phases.filter((phase) => tasks.some((task) => task.phase === phase.number)).at(-1)
      ?.number ?? last;
  const review =
    risky.length === 0
      ? []
      : [
          closing(reviewText(risky), {
            ...{ id: nextId(), phase: closingPhase },
            dependsOn: risky.map((task) => task.id),
          }),
        ];
  const matrices =
    last < 2
      ? []
      : content.phases.flatMap((phase) => {
          const own = tasks.filter((task) => task.phase === phase.number);
          if (own.length === 0) return [];
          const waits = phase.number === closingPhase ? review.map((card) => card.id) : [];
          return [
            closing(matrixText(phase.number, own), {
              ...{ id: nextId(), phase: phase.number },
              dependsOn: [...own.map((task) => task.id), ...waits],
            }),
          ];
        });
  return { ...content, tasks: [...tasks, ...review, ...matrices] };
}
