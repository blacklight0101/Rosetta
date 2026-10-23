import { z } from 'zod';
import type {
  DraftTask,
  PlanDraft,
  UnreadableItem,
  UnreadableTask,
} from '../../domain/planning/plan-draft.js';
import { identifierKinds } from '../../domain/planning/parallel-cards.js';
import { guardKinds, riskClasses } from '../../domain/planning/task-card-quality.js';
import { cardLimits } from '../cards/card-limits.js';
import {
  noObject,
  readItems,
  shapeProblems,
  type Kept,
  type PlanProblem,
  type PlanReading,
} from './plan-reading.js';
import { searchJson } from '../cards/extract-json.js';
import {
  integrationActions,
  securityApproaches,
  type TechnicalDraft,
} from '../../domain/planning/technical-content.js';

// RF-601, ADR-013: the planner's answer is untrusted text. It is read as one JSON object (fenced or
// inside prose, like the other roles' answers) with every list and text bounded; which card ids and
// positions it may use is decided by the domain (plan-content.ts), not here. A list the answer
// leaves out is empty; an answer without requirements is no answer.

const MAX_ITEMS = 200;
const MAX_LIST = 50;
const TITLE = 200;
const TEXT = 2000;
const PATH = 500;

const title = z.string().trim().min(1).max(TITLE);
const text = z.string().trim().min(1).max(TEXT);
const optionalText = z.string().trim().max(TEXT).default('');
const ids = z.array(z.string().max(40)).max(MAX_LIST).default([]);
const texts = z.array(text).max(MAX_LIST);
const position = z.number().int().min(1).max(MAX_ITEMS);
// Q-54: a small model writes a position as an object (`{"position": 3}`, with extra keys at times);
// the number is read. EV-01: `{"index": 3}` is read the same way. EV-30: a string of digits (`"12"`)
// is read as that number. Any other string, an `id` or any other shape stays refused.
const digits = z
  .string()
  .regex(/^[0-9]+$/)
  .transform((text) => Number(text))
  .pipe(position);
// The gap call (Q-45) reads the numbers and objects, and still refuses a string (RF-627 test).
const numberPosition = z.union([
  position,
  z.object({ position }).transform((each) => each.position),
  z.object({ index: position }).transform((each) => each.index),
]);
const listedPosition = z.union([numberPosition, digits]);
const path = z.string().trim().min(1).max(PATH);
// RF-634: a need of a kind that does not exist is left out; it never makes the answer unusable.
const need = z.object({ kind: z.enum(identifierKinds), purpose: title });

const decision = position.nullable().default(null);

const integration = z.object({
  card: z.string().max(40),
  action: z.enum(integrationActions),
  note: optionalText,
  decision,
});
const control = z.object({
  ...{ name: title, approach: z.enum(securityApproaches), description: text },
  ...{ invariant: optionalText, alternative: optionalText, sources: ids, decision },
});
const target = z.object({ name: title, target: text, sources: ids, decision });
const environment = z.object({ name: title, purpose: text, decision });

/** One task card (RF-601, RF-630) with the positions it reads: the planner's, or the gap call's (Q-45). */
function cardWith(positions: z.ZodType<number>) {
  return z.object({
    title,
    phase: position,
    requirements: z.array(positions).max(MAX_LIST).default([]),
    acceptanceCriteria: texts.min(1),
    invariant: optionalText,
    riskClass: z.enum(riskClasses).optional().catch(undefined),
    adds: z.array(z.enum(guardKinds)).max(guardKinds.length).default([]),
    probes: texts.default([]),
    files: z.array(path).max(MAX_LIST).default([]),
    needs: z
      .array(need.nullable().catch(null))
      .max(MAX_LIST)
      .transform((list) => list.flatMap((each) => (each === null ? [] : [each])))
      .default([]),
    dependsOn: z.array(positions).max(MAX_LIST).default([]),
  });
}

const taskSchema = cardWith(listedPosition);
export const gapTaskSchema = cardWith(numberPosition);

const requirementItem = z.object({ title, statement: text, sources: ids });
const componentItem = z.object({
  name: title,
  responsibility: optionalText,
  role: z.string().trim().max(TITLE).catch('').default(''),
  dependsOn: z.array(z.string().max(TITLE)).max(MAX_LIST).default([]),
});
const decisionItem = z.object({
  ...{ title, context: text, decision: text },
  ...{ consequences: optionalText, sources: ids },
});
const entityItem = z.object({ legacy: title, target: title, notes: optionalText, sources: ids });
const phaseItem = z.object({ name: title, goal: text, exitCriteria: texts.min(1) });
const riskItem = z.object({ text, sources: ids });

// P3-126: the lists are read as lists of anything; each item is read on its own below. A list that
// is not a list, or is longer than its bound, still refuses the answer, and the failing path is named.
const itemsOf = (max: number) => z.array(z.unknown()).max(max).default([]);
const answer = z.object({
  summary: optionalText,
  requirements: itemsOf(MAX_ITEMS),
  components: itemsOf(MAX_LIST),
  decisions: itemsOf(MAX_LIST),
  entities: itemsOf(MAX_ITEMS),
  phases: itemsOf(MAX_LIST),
  tasks: itemsOf(MAX_ITEMS),
  risks: itemsOf(MAX_LIST),
  technical: z
    .object({
      integrations: itemsOf(MAX_LIST),
      security: itemsOf(MAX_LIST),
      targets: itemsOf(MAX_LIST),
      environments: itemsOf(MAX_LIST),
    })
    .default({ integrations: [], security: [], targets: [], environments: [] }),
});

const UNREADABLE_REASON =
  'The card is not readable: a field is missing, of the wrong shape or out of its bounds.';
// EV-30: a position in requirements or dependsOn that is not a number from 1 to 200.
const POSITION_REASON =
  'The card is not readable: a position in its requirements or dependsOn is not a number from 1 to 200.';
const POSITION_FIELDS: readonly string[] = ['requirements', 'dependsOn'];

// P3-82: a card that cannot be read holds its place with phase 0, which no plan has, so the domain
// leaves it out and the positions of the other cards do not move.
const unreadablePlaceholder: DraftTask = {
  title: 'Unreadable task card',
  phase: 0,
  requirements: [],
  acceptanceCriteria: [],
  invariant: '',
  adds: [],
  probes: [],
  files: [],
  needs: [],
  dependsOn: [],
};

/** The cards that read, each at its position, and the ones that did not, by position and field. */
function readTasks(
  list: readonly unknown[],
  moved: Pick<Moves, 'requirement' | 'phase'>,
): {
  readonly tasks: DraftTask[];
  readonly unreadableTasks: UnreadableTask[];
} {
  const unreadableTasks: UnreadableTask[] = [];
  const tasks = list.map((each, index) => {
    const read = taskSchema.safeParse(each);
    if (read.success) {
      const { requirements, phase } = read.data;
      // P3-126: the positions name the lists as the planner wrote them; items left out shift them.
      const kept = requirements.flatMap((at) => moved.requirement(at) ?? []);
      return { ...read.data, requirements: kept, phase: moved.phase(phase) };
    }
    const issue = read.error.issues[0];
    const first = issue?.path[0];
    const field = typeof first === 'string' ? first : 'card';
    // EV-30: a bad element of requirements or dependsOn is a position that is not a number.
    const onPosition = POSITION_FIELDS.includes(field) && (issue?.path.length ?? 0) > 1;
    const reason = onPosition ? POSITION_REASON : UNREADABLE_REASON;
    unreadableTasks.push({ position: index + 1, field, reason });
    return unreadablePlaceholder;
  });
  return { tasks, unreadableTasks };
}

/** P3-126: where an item that was kept moved, so the positions that name it still point at it. */
interface Moves {
  readonly requirement: (position: number) => number | undefined;
  readonly phase: (position: number) => number;
}

function technicalOf(
  lists: z.infer<typeof answer>['technical'],
  decisions: Kept<unknown>,
  lost: UnreadableItem[],
): TechnicalDraft {
  const read = <T extends { readonly decision: number | null }>(
    name: string,
    schema: z.ZodType<T>,
    raw: readonly unknown[],
  ): T[] =>
    readItems(`technical.${name}`, schema, raw, lost).items.map((item) => ({
      ...item,
      decision: item.decision === null ? null : (decisions.at(item.decision) ?? null),
    }));
  return {
    integrations: read('integrations', integration, lists.integrations),
    security: read('security', control, lists.security),
    targets: read('targets', target, lists.targets),
    environments: read('environments', environment, lists.environments),
  };
}

function draftOf(lists: z.infer<typeof answer>): PlanReading {
  const lost: UnreadableItem[] = [];
  const requirements = readItems('requirements', requirementItem, lists.requirements, lost);
  if (requirements.items.length === 0) {
    const named = lost.map(({ list, position, field }) => ({ list, position, field }));
    const none = [{ list: 'requirements', field: 'requirements' }];
    return { problems: named.length > 0 ? named : none };
  }
  const components = readItems('components', componentItem, lists.components, lost);
  const decisions = readItems('decisions', decisionItem, lists.decisions, lost);
  const entities = readItems('entities', entityItem, lists.entities, lost);
  const phases = readItems('phases', phaseItem, lists.phases, lost);
  const risks = readItems('risks', riskItem, lists.risks, lost);
  const technical = technicalOf(lists.technical, decisions, lost);
  const moves = {
    requirement: requirements.at,
    phase: (position: number) => phases.at(position) ?? 0,
  };
  const { tasks, unreadableTasks } = readTasks(lists.tasks, moves);
  return {
    problems: [],
    draft: {
      summary: lists.summary,
      requirements: requirements.items,
      components: components.items,
      decisions: decisions.items,
      entities: entities.items,
      phases: phases.items,
      tasks,
      risks: risks.items,
      technical,
      ...(unreadableTasks.length > 0 ? { unreadableTasks } : {}),
      ...(lost.length > 0 ? { unreadableItems: lost } : {}),
    },
  };
}

/**
 * The draft of the answer, or why it is refused (P3-126): an item of a list that does not read is left
 * out and listed; the answer is refused only when no requirement reads or a list is no list.
 */
// RF-601, P3-82, P3-126
export function readPlanAnswer(output: string): PlanReading {
  let refusal: readonly PlanProblem[] | undefined;
  for (const value of searchJson(output.slice(0, cardLimits.maxOutputChars)).values) {
    const shape = answer.safeParse(value);
    const reading: PlanReading = shape.success
      ? draftOf(shape.data)
      : { problems: shapeProblems(shape.error) };
    if (reading.draft !== undefined) return reading;
    refusal ??= reading.problems;
  }
  return { problems: refusal ?? noObject };
}

/** The draft of the answer, or undefined when no JSON object of the answer reads as a plan. */
// RF-601, P3-82
export function parsePlanAnswer(output: string): PlanDraft | undefined {
  return readPlanAnswer(output).draft;
}
