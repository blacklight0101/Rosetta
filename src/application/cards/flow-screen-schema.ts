import { z } from 'zod';
import { citation, text } from './card-fields.js';
import { cardLimits } from './card-limits.js';

// RF-260, RF-261, ADR-005: the parts of an agent's FLOW and SCRN cards. A step is a claim, so it
// is read by the claim schema; this file holds what a step adds (the card it touches, branches)
// and the flow and screen detail of the card. Every branch and every validation needs a citation.

const citations = z
  .array(citation)
  .min(1, 'Needs at least one citation (path:startLine-endLine).')
  .max(cardLimits.maxCitations);

/** Text with the evidence for it: a branch of a step or a validation of a field. */
const citedText = z.object({ text: text(cardLimits.maxClaimChars), citations });

// Card ids are written in capitals, the way the run numbers them (RF-203).
const cardId = (types: string): z.ZodString =>
  z
    .string()
    .trim()
    .toUpperCase()
    .regex(
      new RegExp(`^(?:${types})-[0-9]{1,9}$`),
      `Must be a card id such as ${types.split('|')[0] ?? ''}-001.`,
    );

/** What a step may touch (RF-260). */
const stepTarget = cardId('SCRN|BR|ENT|INT');

export const stepSchemaFields = {
  target: stepTarget.optional(),
  branches: z.array(citedText).max(cardLimits.maxBranches).optional(),
};

export const flowSchema = z.object({
  trigger: text(cardLimits.maxSummaryChars),
  outcome: text(cardLimits.maxSummaryChars),
});

const fieldSchema = z.object({
  name: text(cardLimits.maxNameChars),
  inputKind: text(cardLimits.maxNameChars),
  required: z.boolean(),
  validations: z.array(citedText).max(cardLimits.maxValidations).default([]),
});

const actionSchema = z
  .object({
    label: text(cardLimits.maxNameChars),
    handler: text(cardLimits.maxNameChars).optional(),
    flow: cardId('FLOW').optional(),
  })
  .refine((action) => action.handler !== undefined || action.flow !== undefined, {
    message: 'An action must name the handler or the FLOW card it starts.',
  });

export const screenSchema = z.object({
  route: text(cardLimits.maxPathChars),
  roles: z.array(text(cardLimits.maxNameChars)).max(cardLimits.maxRoles).default([]),
  fields: z.array(fieldSchema).max(cardLimits.maxFields).default([]),
  actions: z.array(actionSchema).max(cardLimits.maxActions).default([]),
  leadsTo: z.array(text(cardLimits.maxPathChars)).max(cardLimits.maxLeadsTo).default([]),
});
