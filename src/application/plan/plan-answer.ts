import { z } from 'zod';
import type {
  DraftTask,
  EntryNote,
  PlanDraft,
  UnreadableItem,
  UnreadableTask,
} from '../../domain/planning/plan-draft.js';
import { contradictionsOf, judgementDrafts, judgementItem } from './plan-answer-judgements.js';
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
import { softText } from './soft-text.js';
import { citingOf, readLists, type EntryMoves } from './list-entries.js';
import { listedPosition, MAX_ITEMS, position } from './list-positions.js';
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

const MAX_LIST = 50;
const TITLE = 200;
const TEXT = 2000;
const PATH = 500;

const title = z.string().trim().min(1).max(TITLE);
const text = z.string().trim().min(1).max(TEXT);
const optionalText = z.string().trim().max(TEXT).default('');

const controlText = softText(TEXT);
const ids = z.array(z.string().max(40)).max(MAX_LIST).default([]);
const texts = z.array(text).max(MAX_LIST);
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
  ...{ invariant: controlText, alternative: controlText, sources: ids, decision },
});
const target = z.object({ name: title, target: text, sources: ids, decision });
const environment = z.object({ name: title, purpose: text, decision });

// P7-15: `requirements` and `dependsOn` are read entry by entry in readTasks (list-entries.ts), so a
// bad entry never makes the card unreadable; each is a list of anything here.
const entryList = z.array(z.unknown()).max(MAX_LIST).default([]);

/** One task card (RF-601, RF-630): the planner's, or the gap call's (Q-45). */
function cardWith() {
  return z.object({
    title,
    phase: position,
    requirements: entryList,
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
    dependsOn: entryList,
  });
}

// P5-41: criteria the planner says contradict a claim the card keeps; each is read on its own in readTasks.
const taskSchema = cardWith().extend({
  contradicts: z.array(z.unknown()).max(MAX_LIST).optional(),
});
// P5-40: a gap card may also wait for a card already in the plan, named by its `T-` id. P7-14: each
// entry is read on its own (digits as a position, as above); one that does not read is dropped.
const cardId = z.string().regex(/^T-[0-9]{3,6}$/);
export const gapTaskSchema = cardWith().extend({
  dependsOn: z
    .array(z.union([listedPosition, cardId]).nullable().catch(null))
    .max(MAX_LIST)
    .transform((list) => list.flatMap((each) => (each === null ? [] : [each])))
    .default([]),
});

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
  claimJudgements: itemsOf(MAX_ITEMS),
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
  moved: Moves,
  lost: UnreadableItem[],
): {
  readonly tasks: DraftTask[];
  readonly unreadableTasks: UnreadableTask[];
  readonly notes: EntryNote[];
} {
  const unreadableTasks: UnreadableTask[] = [];
  const notes: EntryNote[] = [];
  const tasks = list.map((each, index) => {
    const read = taskSchema.safeParse(each);
    if (read.success) {
      const { phase, contradicts: raw, ...rest } = read.data;
      const contradicts = contradictionsOf(raw, index + 1, lost);
      // P3-126: the positions name the lists as the planner wrote them; items left out shift them.
      // P7-15: each entry is read on its own; the card is kept whatever the entries are.
      const lists = readLists(index + 1, rest, moved, notes);
      return { ...rest, ...lists, phase: moved.phase(phase), contradicts };
    }
    const issue = read.error.issues[0];
    const first = issue?.path[0];
    const field = typeof first === 'string' ? first : 'card';
    unreadableTasks.push({ position: index + 1, field, reason: UNREADABLE_REASON });
    return unreadablePlaceholder;
  });
  return { tasks, unreadableTasks, notes };
}

/** P3-126: where an item that was kept moved, so the positions that name it still point at it. */
interface Moves extends EntryMoves {
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
  const judgements = readItems('claimJudgements', judgementItem, lists.claimJudgements, lost);
  const technical = technicalOf(lists.technical, decisions, lost);
  const moves = {
    requirement: requirements.at,
    citing: citingOf(requirements.items),
    phase: (position: number) => phases.at(position) ?? 0,
  };
  const { tasks, unreadableTasks, notes } = readTasks(lists.tasks, moves, lost);
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
      ...judgementDrafts(judgements.items, decisions.at),
      ...(unreadableTasks.length > 0 ? { unreadableTasks } : {}),
      ...(notes.length > 0 ? { entryNotes: notes } : {}),
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
