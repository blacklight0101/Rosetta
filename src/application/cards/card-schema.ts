import { z } from 'zod';
import type { CardDraft } from '../../domain/cards/card-ids.js';
import { CARD_TYPES, CONFIDENCES, type CardType } from '../../domain/cards/card-vocabulary.js';
import { citation, ignoringCase, text } from './card-fields.js';
import { asksWhatCodeDoes, codeQuestionRefusal } from '../../domain/cards/open-question.js';
import { cardLimits } from './card-limits.js';
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
  claims: z
    .array(agentClaimSchema)
    .min(1, 'A card needs at least one claim.')
    .max(cardLimits.maxClaims),
  question: text(cardLimits.maxQuestionChars).optional(),
  whyItMatters: text(cardLimits.maxQuestionChars).optional(),
  flow: flowSchema.optional(),
  screen: screenSchema.optional(),
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
  const { question, whyItMatters, flow, screen, claims, ...rest } = value;
  switch (value.type) {
    case 'OQ':
      return { ...rest, claims: plainClaims(claims), question, whyItMatters };
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

export const agentCardSchema = cardShape
  .superRefine((value, context) => {
    for (const field of neededBy[value.type] ?? []) {
      if (value[field] === undefined) {
        context.addIssue({
          code: 'custom',
          path: [field],
          message: `A ${value.type} card needs ${field}.`,
        });
      }
    }
    if (value.question !== undefined && asksWhatCodeDoes(value.question)) {
      context.addIssue({ code: 'custom', path: ['question'], message: codeQuestionRefusal });
    }
  })
  .transform(draftOf);

/** `{ "cards": [...] }`, at most `maxCards` cards. */
export const agentCardsSchema = z.object({
  cards: z.array(agentCardSchema).max(cardLimits.maxCards),
});
