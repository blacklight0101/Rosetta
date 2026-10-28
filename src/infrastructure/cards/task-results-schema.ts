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
      // P5-35, RF-301: why the verifier rejected the claim, when it said so.
      reasonKind: z.enum(['definedElsewhere']).optional(),
      model: text,
      at: text,
    })
    .optional(),
  ...stepShape,
  // RF-209, RF-302: the rejected claim this one replaces.
  replaces: text.optional(),
});

// RF-645: absent on a card saved before DEC-178.
const suggestedAnswerSchema = z.object({
  answer: text,
  description: text,
  recommended: z.boolean(),
  citations: z.array(citationSchema),
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
  suggestedAnswers: z.array(suggestedAnswerSchema).optional(),
  questionState: z.enum(['Open', 'Answered']).optional(),
  mergedFrom: z.array(text).optional(),
  mergedAreas: z.array(text).optional(),
  note: text.optional(),
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
  failure: text.optional(),
  surface: surfaceShape.optional(),
  note: text.optional(),
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
  const { verdict, target, branches, replaces, ...rest } = claim;
  const step = stepOf({ target, branches });
  const replacing = replaces === undefined ? {} : { replaces };
  if (verdict === undefined) return { ...rest, ...step, ...replacing };
  const { reasonKind, step: verdictStep, reason, model, at } = verdict;
  const judged = { step: verdictStep, reason, model, at };
  const stored = reasonKind === undefined ? judged : { ...judged, reasonKind };
  return { ...rest, ...step, ...replacing, verdict: stored };
}

function cardOf(card: z.output<typeof cardSchema>): Card {
  const {
    claims,
    question,
    whyItMatters,
    suggestedAnswers,
    questionState,
    mergedFrom,
    mergedAreas,
    note,
    ...rest
  } = card;
  const { flow, screen, ...base } = rest;
  return {
    ...base,
    claims: claims.map(claimOf),
    ...(question === undefined ? {} : { question }),
    ...(whyItMatters === undefined ? {} : { whyItMatters }),
    ...(suggestedAnswers === undefined ? {} : { suggestedAnswers }),
    ...(questionState === undefined ? {} : { questionState }),
    ...(mergedFrom === undefined ? {} : { mergedFrom }),
    ...(mergedAreas === undefined ? {} : { mergedAreas }),
    ...(note === undefined ? {} : { note }),
    ...detailOf({ flow, screen }),
  };
}

/** The results the value describes, or undefined when it is not a version 1 results file. */
// RF-006
export function parseTaskResults(value: unknown): readonly TaskResult[] | undefined {
  const parsed = fileSchema.safeParse(value);
  if (!parsed.success) return undefined;
  return parsed.data.tasks.map((task): TaskResult => {
    const { surface, failure, note, ...stored } = task.coverage;
    const coverage: AreaCoverage = {
      ...stored,
      ...(failure === undefined ? {} : { failure }),
      ...surfaceOfStored(surface),
      ...(note === undefined ? {} : { note }),
    };
    return { ...task, cards: task.cards.map(cardOf), coverage };
  });
}

/** The file's data for results; keys are in a fixed order so the same results give the same bytes. */
export function taskResultsFile(results: readonly TaskResult[]): unknown {
  return { schemaVersion: 1, tasks: results };
}
