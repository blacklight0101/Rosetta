import { z } from 'zod';
import type { DraftTask, PlanDraft, UnreadableTask } from '../../domain/planning/plan-draft.js';
import { identifierKinds } from '../../domain/planning/parallel-cards.js';
import { guardKinds, riskClasses } from '../../domain/planning/task-card-quality.js';
import { cardLimits } from '../cards/card-limits.js';
import { searchJson } from '../cards/extract-json.js';
import { integrationActions, securityApproaches } from '../../domain/planning/technical-content.js';

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

const technical = z.object({
  integrations: z
    .array(
      z.object({
        card: z.string().max(40),
        action: z.enum(integrationActions),
        note: optionalText,
        decision,
      }),
    )
    .max(MAX_LIST)
    .default([]),
  security: z
    .array(
      z.object({
        ...{ name: title, approach: z.enum(securityApproaches), description: text },
        ...{ invariant: optionalText, alternative: optionalText, sources: ids, decision },
      }),
    )
    .max(MAX_LIST)
    .default([]),
  targets: z
    .array(z.object({ name: title, target: text, sources: ids, decision }))
    .max(MAX_LIST)
    .default([]),
  environments: z
    .array(z.object({ name: title, purpose: text, decision }))
    .max(MAX_LIST)
    .default([]),
});

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

const answer = z.object({
  summary: optionalText,
  requirements: z
    .array(z.object({ title, statement: text, sources: ids }))
    .min(1)
    .max(MAX_ITEMS),
  components: z
    .array(
      z.object({
        name: title,
        responsibility: optionalText,
        role: z.string().trim().max(TITLE).catch('').default(''),
        dependsOn: z.array(z.string().max(TITLE)).max(MAX_LIST).default([]),
      }),
    )
    .max(MAX_LIST)
    .default([]),
  decisions: z
    .array(
      z.object({ title, context: text, decision: text, consequences: optionalText, sources: ids }),
    )
    .max(MAX_LIST)
    .default([]),
  entities: z
    .array(z.object({ legacy: title, target: title, notes: optionalText, sources: ids }))
    .max(MAX_ITEMS)
    .default([]),
  phases: z
    .array(z.object({ name: title, goal: text, exitCriteria: texts.min(1) }))
    .max(MAX_LIST)
    .default([]),
  tasks: z.array(z.unknown()).max(MAX_ITEMS).default([]),
  risks: z
    .array(z.object({ text, sources: ids }))
    .max(MAX_LIST)
    .default([]),
  technical: technical.default({ integrations: [], security: [], targets: [], environments: [] }),
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
function readTasks(list: readonly unknown[]): {
  readonly tasks: DraftTask[];
  readonly unreadableTasks: UnreadableTask[];
} {
  const unreadableTasks: UnreadableTask[] = [];
  const tasks = list.map((each, index) => {
    const read = taskSchema.safeParse(each);
    if (read.success) return read.data;
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

/** The draft of the answer, or undefined when no JSON object of the answer reads as a plan. */
// RF-601, P3-82
export function parsePlanAnswer(output: string): PlanDraft | undefined {
  for (const value of searchJson(output.slice(0, cardLimits.maxOutputChars)).values) {
    const parsed = answer.safeParse(value);
    if (!parsed.success) continue;
    const { tasks, unreadableTasks } = readTasks(parsed.data.tasks);
    return {
      ...parsed.data,
      tasks,
      ...(unreadableTasks.length > 0 ? { unreadableTasks } : {}),
    };
  }
  return undefined;
}

// STUB for the red commit of P3-126
export interface PlanProblem {
  readonly list: string;
  readonly position?: number;
  readonly field: string;
}
export function readPlanAnswer(output: string): {
  readonly draft?: PlanDraft;
  readonly problems: readonly PlanProblem[];
} {
  const draft = parsePlanAnswer(output);
  return draft === undefined ? { problems: [] } : { draft, problems: [] };
}
