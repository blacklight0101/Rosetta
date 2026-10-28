import { z } from 'zod';
import type { CardDraft } from '../../domain/cards/card-ids.js';
import { CARD_TYPES, CONFIDENCES, type CardType } from '../../domain/cards/card-vocabulary.js';
import { citation, ignoringCase, text } from './card-fields.js';
import { asksWhatCodeDoes, codeQuestionRefusal } from '../../domain/cards/open-question.js';
import {
  asksWhatTheFileAnswers,
  readFileQuestionRefusal,
} from '../../domain/cards/open-question-reading.js';
import { cardLimits } from './card-limits.js';
import { MIN_SUGGESTED_ANSWERS } from '../../domain/cards/suggested-answer.js';
import { flowSchema, screenSchema, stepSchemaFields } from './flow-screen-schema.js';

// RF-202, ADR-005: the strict shape of an agent's final answer. A card needs type, title, area,
// summary, confidence and claims; each claim needs at least one citation; an OQ also needs its
// question and why it matters, and the question must not ask what the code does (RF-243). Small models write numbers as text and vary letter case, so line
// numbers may be numeric strings and type and confidence ignore case. Unknown fields are dropped.

/** The longest claim id a `replaces` may name: a card id and `.c<n>`. */
const MAX_CLAIM_ID_CHARS = 40;

export const agentClaimSchema = z.object({
  text: text(cardLimits.maxClaimChars),
  citations: z
    .array(citation)
    .min(1, 'A claim needs at least one citation (path:startLine-endLine).')
    .max(cardLimits.maxCitations),
  ...stepSchemaFields,
  // RF-209: the rejected claim a Deepen re-read answers; a bad value is dropped, never the claim.
  replaces: z.string().trim().min(1).max(MAX_CLAIM_ID_CHARS).optional().catch(undefined),
});

/** RF-645, DEC-178: one suggested answer; its citation is optional because the code may not support it. */
const suggestedAnswerSchema = z.object({
  answer: text(cardLimits.maxAnswerChars),
  description: text(cardLimits.maxQuestionChars),
  recommended: z.boolean().default(false),
  citations: z.array(citation).max(cardLimits.maxCitations).default([]),
});

const suggestedAnswersSchema = z.array(suggestedAnswerSchema).max(cardLimits.maxSuggestedAnswers);

const suggestedAnswersNeeded = `An OQ card needs three suggested answers in suggestedAnswers: each with answer, description and recommended, exactly one marked recommended and listed first, and citations when the code supports the answer.`;

type DetailField = 'question' | 'whyItMatters' | 'flow' | 'screen';

/** The extra fields a type must have: an OQ its question, a FLOW its flow, a SCRN its screen. */
const neededBy: Partial<Record<CardType, readonly DetailField[]>> = {
  OQ: ['question', 'whyItMatters'],
  FLOW: ['flow'],
  SCRN: ['screen'],
};

const cardShape = z.object({
  type: ignoringCase(CARD_TYPES),
  title: text(cardLimits.maxTitleChars),
  // Required by RF-202 but only checked, never used: a card gets the area of the task that
  // produced it (assignCardIds), so a different area written here is ignored.
  area: text(cardLimits.maxAreaChars),
  summary: text(cardLimits.maxSummaryChars),
  confidence: ignoringCase(CONFIDENCES),
  // P3-104: a missing `claims` reads as none; the refinement below keeps such a card only when its
  // screen carries cited validations, which become its claims (RF-261).
  claims: z.array(agentClaimSchema).max(cardLimits.maxClaims).default([]),
  question: text(cardLimits.maxQuestionChars).optional(),
  whyItMatters: text(cardLimits.maxQuestionChars).optional(),
  suggestedAnswers: suggestedAnswersSchema.optional(),
  flow: flowSchema.optional(),
  screen: screenSchema.optional(),
  // RF-209, DEC-158: the id of the card the parent run holds that a Deepen task's claims belong to;
  // a bad value is dropped, never the card, and an id the task was not given makes a new card.
  extends: z.string().trim().min(1).max(MAX_CLAIM_ID_CHARS).optional().catch(undefined),
});

type ParsedCard = z.output<typeof cardShape>;

/** A step's target and branches are for FLOW cards only; any other card keeps the plain claim. */
function plainClaims(claims: ParsedCard['claims']): CardDraft['claims'] {
  return claims.map(({ text: claimText, citations, replaces }) => ({
    text: claimText,
    citations,
    ...(replaces === undefined ? {} : { replaces }),
  }));
}

function draftOf(value: ParsedCard): CardDraft {
  const { question, whyItMatters, suggestedAnswers, flow, screen, claims, ...rest } = value;
  switch (value.type) {
    case 'OQ':
      return {
        ...rest,
        claims: plainClaims(claims),
        question,
        whyItMatters,
        ...(suggestedAnswers === undefined ? {} : { suggestedAnswers }),
      };
    case 'FLOW':
      return { ...rest, claims, flow };
    case 'SCRN':
      return { ...rest, claims: plainClaims(claims), screen };
    case 'FEAT':
    case 'BR':
    case 'ENT':
    case 'INT':
      return { ...rest, claims: plainClaims(claims) };
  }
}

/** A SCRN with a cited validation has claims of its own even when the agent wrote none (RF-261). */
function hasScreenClaims(value: ParsedCard): boolean {
  return (
    value.type === 'SCRN' &&
    (value.screen?.fields.some((field) => field.validations.length > 0) ?? false)
  );
}

/** What is wrong with the list of suggested answers of an OQ card; empty when it is right. */
function suggestedAnswerProblems(
  answers: z.output<typeof suggestedAnswersSchema> | undefined,
): string[] {
  const problems: string[] = [];
  if (answers === undefined) return problems;
  if (answers.length < MIN_SUGGESTED_ANSWERS) {
    problems.push(`${suggestedAnswersNeeded} Found ${String(answers.length)}; add at least three.`);
    return problems;
  }
  if (answers.filter((each) => each.recommended).length !== 1) {
    problems.push('Exactly one suggested answer must have recommended true.');
  } else if (answers[0]?.recommended !== true) {
    problems.push('The recommended suggested answer must be listed first.');
  }
  return problems;
}

/** RF-243: why the question is refused, or undefined when it may be asked. */
function questionRefusal(question: string | undefined): string | undefined {
  if (question === undefined) return undefined;
  if (asksWhatCodeDoes(question)) return codeQuestionRefusal;
  return asksWhatTheFileAnswers(question) ? readFileQuestionRefusal : undefined;
}

export const agentCardSchema = cardShape
  .superRefine((value, context) => {
    if (value.claims.length === 0 && !hasScreenClaims(value)) {
      context.addIssue({
        code: 'custom',
        path: ['claims'],
        message: 'A card needs at least one claim.',
      });
    }
    for (const field of neededBy[value.type] ?? []) {
      if (value[field] === undefined) {
        context.addIssue({
          code: 'custom',
          path: [field],
          message: `A ${value.type} card needs ${field}.`,
        });
      }
    }
    const answers = value.type === 'OQ' ? suggestedAnswerProblems(value.suggestedAnswers) : [];
    for (const message of answers) {
      context.addIssue({ code: 'custom', path: ['suggestedAnswers'], message });
    }
    const refusal = questionRefusal(value.question);
    if (refusal !== undefined)
      context.addIssue({ code: 'custom', path: ['question'], message: refusal });
  })
  .transform(draftOf);

/** The message of an OQ card that has no suggested answers although its format asks for them. */
export const missingSuggestedAnswers = suggestedAnswersNeeded;

/** `{ "cards": [...] }`, at most `maxCards` cards. */
export const agentCardsSchema = z.object({
  cards: z.array(agentCardSchema).max(cardLimits.maxCards),
});
