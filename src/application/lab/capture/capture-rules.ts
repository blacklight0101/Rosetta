import { z } from 'zod';
import { readDataBlocks, type ReadDataBlock } from './data-blocks.js';
import type { TranscriptTask } from './capture-types.js';
import { captureReaderInput, readerPromptIds } from './capture-reader.js';
import { capturePlanDocInput, planDocPromptIds } from './capture-plan-docs.js';

// RF-1404, DEC-57: which agent task is an input of which prompt id, and what of it is kept. Only
// the first user message is read, back from its data blocks; the system prompt and every assistant
// message are ignored, so no answer of a model can reach a case. The planner and summariser inputs
// were written by models earlier in the run (cards, plan titles); they are inputs, never truth.

/** A case stays small: the first cards of a list, the first claims of a card. */
const MAX_CARDS = 10;
const MAX_CLAIMS = 4;

const text = (max: number) => z.string().max(max);

const gapItems = z.object({
  items: z.array(z.object({ id: text(300), kind: text(40), name: text(300), detail: text(2000) })),
});
const gapPlan = z.object({
  phases: z.array(z.object({ number: z.number().int(), name: text(300), goal: text(1000) })),
  requirements: z.array(z.object({ title: text(300) })),
  tasks: z.array(z.object({ id: text(100), title: text(300) })),
});

const mergeCards = z.array(
  z.object({
    id: text(100),
    area: text(300),
    title: text(300),
    summary: text(2000),
    claims: z.array(text(2000)),
  }),
);
const overviewCards = z.array(
  z.object({
    id: text(100),
    type: text(40),
    area: text(300),
    title: text(300),
    summary: text(2000),
    claims: z.array(text(2000)),
  }),
);

function firstBlocks(task: TranscriptTask): ReadDataBlock[] {
  const first = task.messages.find((message) => message.role === 'user');
  return first === undefined ? [] : readDataBlocks(first.content);
}

function jsonOf(block: ReadDataBlock | undefined, source: string): unknown {
  if (block?.source !== source) return undefined;
  try {
    return JSON.parse(block.text);
  } catch {
    return undefined;
  }
}

function gapInput(task: TranscriptTask): unknown {
  if (task.name !== 'planner-gap') return undefined;
  const [items, plan] = firstBlocks(task);
  const read = gapItems.safeParse(jsonOf(items, 'cards'));
  const content = gapPlan.safeParse(jsonOf(plan, 'owner_answers'));
  return read.success && content.success ? { ...read.data, ...content.data } : undefined;
}

const mergeName = /^summariser-(br|ent|scrn|feat)(?:-\d+)?$/u;

function shortened<T extends { claims: string[] }>(cards: readonly T[]): T[] {
  return cards
    .slice(0, MAX_CARDS)
    .map((card) => ({ ...card, claims: card.claims.slice(0, MAX_CLAIMS) }));
}

function mergeInput(task: TranscriptTask): unknown {
  const type = mergeName.exec(task.name)?.[1]?.toUpperCase();
  const cards = mergeCards.safeParse(jsonOf(firstBlocks(task)[0], 'cards'));
  const kept = cards.success ? shortened(cards.data) : [];
  return type === undefined || kept.length < 2 ? undefined : { type, cards: kept };
}

function overviewInput(task: TranscriptTask): unknown {
  if (task.name !== 'summariser-overview') return undefined;
  const cards = overviewCards.safeParse(jsonOf(firstBlocks(task)[0], 'cards'));
  const kept = cards.success ? shortened(cards.data) : [];
  return kept.length > 0 ? { cards: kept } : undefined;
}

/** The prompt ids the capture has a rule for. */
export const capturablePromptIds: readonly string[] = [
  'planner/gap',
  'summariser/merge',
  'summariser/overview',
  ...readerPromptIds,
  ...planDocPromptIds,
];

// RF-1404
export function captureInput(
  promptId: string,
  task: TranscriptTask,
  context: { readonly maxTurns: number },
): unknown {
  if (planDocPromptIds.includes(promptId)) return capturePlanDocInput(promptId, task);
  switch (promptId) {
    case 'planner/gap':
      return gapInput(task);
    case 'summariser/merge':
      return mergeInput(task);
    case 'summariser/overview':
      return overviewInput(task);
    default:
      return captureReaderInput(promptId, task, context);
  }
}
