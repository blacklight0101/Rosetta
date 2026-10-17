import { z } from 'zod';
import type { TaskResult } from '../../application/ports/task-results.js';
import type { AreaCoverage } from '../../domain/cards/area-coverage.js';
import type { Card, Claim } from '../../domain/cards/card.js';
import { CARD_TYPES, CLAIM_STATUSES, CONFIDENCES } from '../../domain/cards/card-vocabulary.js';
import {
  detailOf,
  flowShape,
  screenShape,
  stepOf,
  stepShape,
  surfaceOfStored,
  surfaceShape,
} from './task-results-flow-screen.js';

// RF-006, data-model.md section 3.7a, DEC-43: `task-results.json` parsed at the boundary. Anything
// that is not a version 1 file of well-formed results is refused, never guessed.

const count = z.number().int().min(0);
const text = z.string();

const citationSchema = z.object({ path: text, startLine: count, endLine: count });

const claimSchema = z.object({
  claimId: text,
  text,
  citations: z.array(citationSchema),
  status: z.enum(CLAIM_STATUSES),
  verdict: z
    .object({
      step: z.enum(['citation', 'judgement']),
      reason: text,
      model: text,
      at: text,
    })
    .optional(),
  ...stepShape,
});

const cardSchema = z.object({
  id: text,
  type: z.enum(CARD_TYPES),
  title: text,
  summary: text,
  area: text,
  agentTaskId: text,
  confidence: z.enum(CONFIDENCES),
  claims: z.array(claimSchema),
  question: text.optional(),
  whyItMatters: text.optional(),
  questionState: z.enum(['Open', 'Answered']).optional(),
  mergedFrom: z.array(text).optional(),
  flow: flowShape.optional(),
  screen: screenShape.optional(),
});

const coverageSchema = z.object({
  area: text,
  files: z.array(
    z.object({
      path: text,
      read: z.array(z.object({ startLine: count, endLine: count })),
    }),
  ),
  tokens: count,
  readTokens: count,
  readTokenShare: z.number().min(0).max(1),
  surface: surfaceShape.optional(),
});

const resultSchema = z.object({
  agentTaskId: text,
  area: text,
  state: z.enum(['Done', 'TurnLimitReached', 'InvalidOutput', 'Failed', 'StoppedByCap']),
  turns: count,
  withoutCards: z.boolean(),
  cards: z.array(cardSchema),
  coverage: coverageSchema,
});

const fileSchema = z.object({ schemaVersion: z.literal(1), tasks: z.array(resultSchema) });

/** A claim without the keys that are absent, as the domain type has it (exact optionals). */
function claimOf(claim: z.output<typeof claimSchema>): Claim {
  const { verdict, target, branches, ...rest } = claim;
  const step = stepOf({ target, branches });
  return verdict === undefined ? { ...rest, ...step } : { ...rest, ...step, verdict };
}

function cardOf(card: z.output<typeof cardSchema>): Card {
  const { claims, question, whyItMatters, questionState, mergedFrom, flow, screen, ...rest } = card;
  return {
    ...rest,
    claims: claims.map(claimOf),
    ...(question === undefined ? {} : { question }),
    ...(whyItMatters === undefined ? {} : { whyItMatters }),
    ...(questionState === undefined ? {} : { questionState }),
    ...(mergedFrom === undefined ? {} : { mergedFrom }),
    ...detailOf({ flow, screen }),
  };
}

/** The results the value describes, or undefined when it is not a version 1 results file. */
// RF-006
export function parseTaskResults(value: unknown): readonly TaskResult[] | undefined {
  const parsed = fileSchema.safeParse(value);
  if (!parsed.success) return undefined;
  return parsed.data.tasks.map((task): TaskResult => {
    const { surface, ...stored } = task.coverage;
    const coverage: AreaCoverage = { ...stored, ...surfaceOfStored(surface) };
    return { ...task, cards: task.cards.map(cardOf), coverage };
  });
}

/** The file's data for results; keys are in a fixed order so the same results give the same bytes. */
export function taskResultsFile(results: readonly TaskResult[]): unknown {
  return { schemaVersion: 1, tasks: results };
}
