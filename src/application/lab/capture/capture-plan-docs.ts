import { z } from 'zod';
import type { ReadDataBlock } from './data-blocks.js';
import { readDataBlocks } from './data-blocks.js';
import type { TranscriptTask } from './capture-types.js';

// RF-1404, DEC-57: the capture rules of the planner's plan documents. Only the first user message of
// the task is read, back from its two data blocks; the system prompt and every assistant message are
// ignored. A case stays small: the first cards of a list, the first claims of a card. The cards were
// written by models earlier in the run, so they are inputs here, never truth.

const MAX_CARDS = 8;
const MAX_CLAIMS = 4;
const MAX_TASKS = 25;
const MAX_ITEMS = 40;
const MAX_STEPS = 6;

const taskNames: Readonly<Record<string, string>> = {
  'planner/prd': 'planner-prd',
  'planner/package': 'planner-package',
  'planner/workbook': 'planner-package',
  'planner/data-model': 'planner-data-model',
  'planner/api-contract': 'planner-api-contract',
  'planner/ux': 'planner-ux',
  'planner/flows': 'planner-flows',
  'planner/coverage': 'planner-coverage',
  'planner/adr-model': 'planner-adr-model',
};

/** The prompt ids this file has a rule for. */
export const planDocPromptIds: readonly string[] = Object.keys(taskNames);

const claim = z.object({ claimId: z.string(), text: z.string(), citations: z.array(z.string()) });
const bare = z.object({ id: z.string(), title: z.string() });
const card = bare.extend({ summary: z.string(), claims: z.array(claim) });
const typed = card.extend({ type: z.string() });
const nullable = z.string().nullable().optional().default(null);

const cut = <T extends { claims: unknown[] }>(cards: readonly T[]): T[] =>
  cards.slice(0, MAX_CARDS).map((each) => ({ ...each, claims: each.claims.slice(0, MAX_CLAIMS) }));

/** The JSON a block holds: its text up to the blank line that starts a summary of omitted cards. */
function jsonOf(block: ReadDataBlock | undefined, source: string): unknown {
  if (block?.source !== source) return undefined;
  try {
    return JSON.parse(block.text.split('\n\n')[0] ?? '');
  } catch {
    return undefined;
  }
}

/**
 * P10-08: the first cards of a plan run are all of one type (the rules), so a case of the PRD or the
 * plan never saw a feature or an entity. Take the cards in turns over the types, in the order the
 * types first appear, and keep the order the run sent them in.
 */
function spread<T extends { type: string }>(cards: readonly T[]): T[] {
  const queues = new Map<string, number[]>();
  cards.forEach((each, index) => queues.set(each.type, [...(queues.get(each.type) ?? []), index]));
  const chosen: number[] = [];
  while (chosen.length < Math.min(MAX_CARDS, cards.length)) {
    for (const queue of queues.values()) {
      const next = queue.shift();
      if (next !== undefined && chosen.length < MAX_CARDS) chosen.push(next);
    }
  }
  return chosen.sort((a, b) => a - b).flatMap((index) => cards[index] ?? []);
}

const planCase = (cards: unknown, owner: unknown): unknown => {
  const read = z.array(typed).safeParse(cards);
  const own = z.record(z.string(), z.unknown()).safeParse(owner);
  if (!read.success || !own.success || read.data.length === 0) return undefined;
  return { cards: cut(spread(read.data)), owner: own.data };
};

const dataModelShape = z.object({
  entityCards: z.array(card),
  otherEntities: z.array(bare).optional(),
  ruleCards: z.array(bare.extend({ claims: z.array(claim.pick({ claimId: true, text: true })) })),
});
const dataModelOwner = z.object({
  targetStack: z.object({ database: nullable, dataAccess: nullable }),
  dataMigration: nullable,
});

function dataModelCase(cards: unknown, owner: unknown): unknown {
  const shown = dataModelShape.safeParse(cards);
  const given = dataModelOwner.safeParse(owner);
  if (!shown.success || !given.success || shown.data.entityCards.length === 0) return undefined;
  const { entityCards, otherEntities, ruleCards } = shown.data;
  const { targetStack, dataMigration } = given.data;
  return {
    entities: cut(entityCards),
    ...(otherEntities === undefined ? {} : { otherEntities }),
    rules: cut(ruleCards),
    ...{ database: targetStack.database, dataAccess: targetStack.dataAccess, dataMigration },
  };
}

const style = z.object({ architectureStyle: z.string() });

function apiCase(cards: unknown, owner: unknown): unknown {
  const shown = z
    .object({
      featureAndFlowCards: z.array(typed),
      entityCards: z.array(bare.extend({ summary: z.string() })),
    })
    .safeParse(cards);
  const given = style
    .extend({
      targetStack: z.object({ frontEnd: nullable, backEnd: nullable, database: nullable }),
    })
    .safeParse(owner);
  if (!shown.success || !given.success || shown.data.featureAndFlowCards.length === 0) {
    return undefined;
  }
  const { frontEnd, backEnd, database } = given.data.targetStack;
  return {
    featureCards: cut(shown.data.featureAndFlowCards),
    entities: shown.data.entityCards.slice(0, 60),
    ...{ frontEnd, backEnd, database, style: given.data.architectureStyle },
  };
}

const screen = z.object({
  route: z.string(),
  roles: z.array(z.string()),
  fields: z.array(z.object({ name: z.string(), inputKind: z.string(), required: z.boolean() })),
  actions: z.array(
    z.object({ label: z.string(), handler: z.string().optional(), flow: z.string().optional() }),
  ),
  leadsTo: z.array(z.string()),
});

function uxCase(cards: unknown, owner: unknown): unknown {
  const shown = z.object({ screenCards: z.array(card.extend({ screen: screen.nullable() })) });
  const read = shown.safeParse(cards);
  const given = style.extend({ targetStack: z.object({ frontEnd: nullable }) }).safeParse(owner);
  if (!read.success || !given.success || read.data.screenCards.length === 0) return undefined;
  return {
    screenCards: cut(read.data.screenCards.slice(0, 6)),
    frontEnd: given.data.targetStack.frontEnd,
    style: given.data.architectureStyle,
  };
}

const flow = bare.extend({
  summary: z.string(),
  trigger: z.string().nullable(),
  outcome: z.string().nullable(),
  steps: z.array(claim.extend({ touches: z.string().nullable() })),
});

function flowsCase(cards: unknown, owner: unknown): unknown {
  const read = z.object({ flowCards: z.array(flow) }).safeParse(cards);
  const given = z
    .object({ components: z.array(z.object({ name: z.string(), responsibility: z.string() })) })
    .safeParse(owner);
  if (!read.success || !given.success || read.data.flowCards.length === 0) return undefined;
  const flowCards = read.data.flowCards
    .slice(0, 5)
    .map((each) => ({ ...each, steps: each.steps.slice(0, MAX_STEPS) }));
  return { flowCards, components: given.data.components };
}

function coverageCase(tasks: unknown, items: unknown): unknown {
  const read = z
    .object({
      tasks: z.array(z.object({ title: z.string(), acceptanceCriteria: z.array(z.string()) })),
    })
    .safeParse(tasks);
  const listed = z
    .object({
      items: z.array(
        z.object({ id: z.string(), kind: z.string(), name: z.string(), detail: z.string() }),
      ),
    })
    .safeParse(items);
  if (!read.success || !listed.success || read.data.tasks.length === 0) return undefined;
  if (listed.data.items.length === 0) return undefined;
  return {
    tasks: read.data.tasks.slice(0, MAX_TASKS),
    items: listed.data.items.slice(0, MAX_ITEMS),
  };
}

function adrModelCase(decisions: unknown, tables: unknown): unknown {
  const records = z
    .object({
      decisions: z.array(
        bare.extend({ context: z.string(), decision: z.string(), consequences: z.string() }),
      ),
    })
    .safeParse(decisions);
  const stored = z
    .object({
      tables: z.array(
        z.object({ name: z.string(), purpose: z.string(), columns: z.array(z.string()) }),
      ),
    })
    .safeParse(tables);
  if (!records.success || !stored.success || stored.data.tables.length === 0) return undefined;
  if (records.data.decisions.length === 0) return undefined;
  return { decisions: records.data.decisions, tables: stored.data.tables };
}

type Rule = (left: unknown, right: unknown) => unknown;

/** Per prompt id: the sources of its two blocks, in message order, and the rule that reads them. */
const rules: Readonly<Record<string, readonly [string, string, Rule]>> = {
  'planner/prd': ['cards', 'owner_answers', planCase],
  'planner/package': ['cards', 'owner_answers', planCase],
  // The message of a workbook plan is the package message; only the runs named decide which it is.
  'planner/workbook': ['cards', 'owner_answers', planCase],
  'planner/data-model': ['cards', 'owner_answers', dataModelCase],
  'planner/api-contract': ['cards', 'owner_answers', apiCase],
  'planner/ux': ['cards', 'owner_answers', uxCase],
  'planner/flows': ['cards', 'owner_answers', flowsCase],
  'planner/coverage': ['owner_answers', 'cards', coverageCase],
  'planner/adr-model': ['cards', 'cards', adrModelCase],
};

// RF-1404
export function capturePlanDocInput(promptId: string, task: TranscriptTask): unknown {
  const rule = rules[promptId];
  if (rule === undefined || taskNames[promptId] !== task.name) return undefined;
  const first = task.messages.find((message) => message.role === 'user');
  const [one, two] = first === undefined ? [] : readDataBlocks(first.content);
  return rule[2](jsonOf(one, rule[0]), jsonOf(two, rule[1]));
}
