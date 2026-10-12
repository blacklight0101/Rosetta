import { z } from 'zod';
import type { CardDraft } from '../../domain/cards/card-ids.js';
import { CARD_TYPES, CONFIDENCES } from '../../domain/cards/card-vocabulary.js';
import {
  createCitation,
  parseCitation,
  type Citation,
  type CitationProblem,
} from '../../domain/cards/citation.js';
import { cardLimits } from './card-limits.js';

// RF-202, ADR-005: the strict shape of an agent's final answer. A card needs type, title, area,
// summary, confidence and claims; each claim needs at least one citation; an OQ also needs its
// question and why it matters. Small models write numbers as text and vary letter case, so line
// numbers may be numeric strings and type and confidence ignore case. Unknown fields are dropped.

const citationMessages: Readonly<Record<CitationProblem, string>> = {
  'invalid-format': 'A citation must look like path/to/file.ext:startLine-endLine.',
  'invalid-path': 'A citation path must be relative to the repository root, with forward slashes.',
  'invalid-lines': 'A citation needs whole line numbers with 1 <= startLine <= endLine.',
};

const lineNumber = z.union([
  z.number().int().max(cardLimits.maxLineNumber),
  z
    .string()
    .trim()
    .regex(/^\d{1,9}$/)
    .transform(Number),
]);
const path = z.string().min(1).max(cardLimits.maxPathChars);

const citationShape = z.union([
  z.string().max(cardLimits.maxPathChars + 24),
  z.object({ path, startLine: lineNumber, endLine: lineNumber }),
]);

const citation = citationShape.transform((value, context): Citation => {
  const made =
    typeof value === 'string'
      ? parseCitation(value.trim())
      : createCitation(value.path, value.startLine, value.endLine);
  if (made.ok) return made.value;
  context.addIssue({ code: 'custom', message: citationMessages[made.error] });
  return z.NEVER;
});

function ignoringCase<T extends string>(values: readonly [T, ...T[]]) {
  return z
    .string()
    .transform((text) => values.find((v) => v.toLowerCase() === text.trim().toLowerCase()) ?? text)
    .pipe(z.enum(values));
}

const text = (max: number) => z.string().trim().min(1).max(max);

const claim = z.object({
  text: text(cardLimits.maxClaimChars),
  citations: z
    .array(citation)
    .min(1, 'A claim needs at least one citation (path:startLine-endLine).')
    .max(cardLimits.maxCitations),
});

const card = z
  .object({
    type: ignoringCase(CARD_TYPES),
    title: text(cardLimits.maxTitleChars),
    // Required by RF-202 but only checked, never used: a card gets the area of the task that
    // produced it (assignCardIds), so a different area written here is ignored.
    area: text(cardLimits.maxAreaChars),
    summary: text(cardLimits.maxSummaryChars),
    confidence: ignoringCase(CONFIDENCES),
    claims: z.array(claim).min(1, 'A card needs at least one claim.').max(cardLimits.maxClaims),
    question: text(cardLimits.maxQuestionChars).optional(),
    whyItMatters: text(cardLimits.maxQuestionChars).optional(),
  })
  .superRefine((value, context) => {
    if (value.type !== 'OQ') return;
    for (const field of ['question', 'whyItMatters'] as const) {
      if (value[field] === undefined) {
        context.addIssue({ code: 'custom', path: [field], message: `An OQ card needs ${field}.` });
      }
    }
  })
  .transform((value): CardDraft => {
    const { question, whyItMatters, ...rest } = value;
    return value.type === 'OQ' ? { ...rest, question, whyItMatters } : rest;
  });

/** `{ "cards": [...] }`, at most `maxCards` cards. */
export const agentCardsSchema = z.object({ cards: z.array(card).max(cardLimits.maxCards) });
