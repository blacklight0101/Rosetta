import { z } from 'zod';
import { architectureStyleIds } from '../../domain/planning/catalogue.js';
import {
  applicationKinds,
  migrationStrategies,
  stackLayers,
  type BriefAnswers,
  type PlanningBrief,
} from '../../domain/planning/planning-brief.js';

// RF-605, ADR-018, data-model.md section 3.20: the shapes of `planning-brief.json` and of a save.
// Free text is untrusted (ADR-013); it is bounded here and masked when the file is written. The key
// order of each object is the order the domain builds it in, so a saved brief reads back equal.

const MAX_ID = 80;
const MAX_TEXT = 500;
const MAX_CHOICE = 200;
const MAX_LIST = 20;
const MAX_OFFERED = 5;

const style = z.enum(architectureStyleIds);
const entryId = z.string().min(1).max(MAX_ID);
const cardId = z.string().min(1).max(40);
const text = z.string().trim().min(1).max(MAX_TEXT);
const layer = z.enum(stackLayers);

const stackChoice = z.strictObject({
  layer,
  choice: z.string().trim().min(1).max(MAX_CHOICE),
  custom: z.boolean(),
  offered: z.array(z.string().trim().min(1).max(MAX_CHOICE)).max(MAX_OFFERED).optional(),
});

const architecture = z.strictObject({
  style,
  recommended: z.array(style).max(architectureStyleIds.length),
  evidence: z.array(cardId).max(MAX_LIST),
});

const context = z.strictObject({
  teamSize: z.number().int().min(1).max(10_000).nullable(),
  experience: text.nullable(),
  deadline: text.nullable(),
  keepIntegrations: z.array(text).max(MAX_LIST),
  dataMigration: text.nullable(),
});

export const planningBriefSchema = z.strictObject({
  schemaVersion: z.literal(1),
  savedAt: z.iso.datetime({ precision: 3 }),
  catalogueVersion: z.number().int().positive(),
  principles: z.array(entryId).max(100),
  architecture,
  migration: z.enum(migrationStrategies),
  application: z.enum(applicationKinds).optional(),
  stack: z.array(stackChoice).max(stackLayers.length),
  context,
  buildMethod: z.strictObject({ aiAssisted: z.boolean() }),
  defaulted: z.array(z.string().max(MAX_ID)).max(40),
});

/** The brief stored in the file; undefined when the text is not a version 1 brief. */
// RF-605
export function parsePlanningBrief(value: unknown): PlanningBrief | undefined {
  const parsed = planningBriefSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

const answersSchema = z.strictObject({
  principles: z.array(entryId).max(100).optional(),
  architecture: z
    .strictObject({
      style,
      recommended: architecture.shape.recommended.optional(),
      evidence: architecture.shape.evidence.optional(),
    })
    .optional(),
  migration: z.enum(migrationStrategies).optional(),
  application: z.enum(applicationKinds).optional(),
  stack: z.array(stackChoice).max(stackLayers.length).optional(),
  context: z
    .strictObject({
      teamSize: context.shape.teamSize.optional(),
      experience: context.shape.experience.optional(),
      deadline: context.shape.deadline.optional(),
      keepIntegrations: context.shape.keepIntegrations.optional(),
      dataMigration: context.shape.dataMigration.optional(),
    })
    .optional(),
  buildMethod: z.strictObject({ aiAssisted: z.boolean() }).optional(),
});

/** The body of a save; undefined when it breaks the shape or a limit. */
// RF-605
export function parseBriefAnswers(value: unknown): BriefAnswers | undefined {
  const parsed = answersSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
