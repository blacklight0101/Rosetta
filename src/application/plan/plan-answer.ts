import { z } from 'zod';
import type { PlanDraft } from '../../domain/planning/plan-draft.js';
import { guardKinds, riskClasses } from '../../domain/planning/task-card-quality.js';
import { cardLimits } from '../cards/card-limits.js';
import { searchJson } from '../cards/extract-json.js';
import { integrationActions, securityApproaches } from '../../domain/planning/technical-content.js';

// RF-601, ADR-013: the planner's answer is untrusted text. It is read as one JSON object (fenced or
// inside prose, like the other roles' answers) with every list and text bounded; which card ids and
// positions it may use is decided by the domain (plan-content.ts), not here. A list the answer
// leaves out is empty; an answer without requirements is no answer.

const MAX_ITEMS = 200;
const MAX_LIST = 50;
const TITLE = 200;
const TEXT = 2000;

const title = z.string().trim().min(1).max(TITLE);
const text = z.string().trim().min(1).max(TEXT);
const optionalText = z.string().trim().max(TEXT).default('');
const ids = z.array(z.string().max(40)).max(MAX_LIST).default([]);
const texts = z.array(text).max(MAX_LIST);
const position = z.number().int().min(1).max(MAX_ITEMS);

const decision = position.nullable().default(null);

const technical = z.object({
  integrations: z
    .array(
      z.object({
        card: z.string().max(40),
        action: z.enum(integrationActions),
        note: optionalText,
        decision,
      }),
    )
    .max(MAX_LIST)
    .default([]),
  security: z
    .array(
      z.object({
        ...{ name: title, approach: z.enum(securityApproaches), description: text },
        ...{ invariant: optionalText, alternative: optionalText, sources: ids, decision },
      }),
    )
    .max(MAX_LIST)
    .default([]),
  targets: z
    .array(z.object({ name: title, target: text, sources: ids, decision }))
    .max(MAX_LIST)
    .default([]),
  environments: z
    .array(z.object({ name: title, purpose: text, decision }))
    .max(MAX_LIST)
    .default([]),
});

const answer = z.object({
  summary: optionalText,
  requirements: z
    .array(z.object({ title, statement: text, sources: ids }))
    .min(1)
    .max(MAX_ITEMS),
  components: z
    .array(
      z.object({
        name: title,
        responsibility: optionalText,
        dependsOn: z.array(z.string().max(TITLE)).max(MAX_LIST).default([]),
      }),
    )
    .max(MAX_LIST)
    .default([]),
  decisions: z
    .array(
      z.object({ title, context: text, decision: text, consequences: optionalText, sources: ids }),
    )
    .max(MAX_LIST)
    .default([]),
  entities: z
    .array(z.object({ legacy: title, target: title, notes: optionalText, sources: ids }))
    .max(MAX_ITEMS)
    .default([]),
  phases: z
    .array(z.object({ name: title, goal: text, exitCriteria: texts.min(1) }))
    .max(MAX_LIST)
    .default([]),
  tasks: z
    .array(
      z.object({
        title,
        phase: position,
        requirements: z.array(position).max(MAX_LIST).default([]),
        acceptanceCriteria: texts.min(1),
        invariant: optionalText,
        riskClass: z.enum(riskClasses).optional().catch(undefined),
        adds: z.array(z.enum(guardKinds)).max(guardKinds.length).default([]),
        probes: texts.default([]),
        // stub until the parallel-safe fields are read (RF-634)
        files: z
          .array(z.string())
          .transform((): string[] => [])
          .default([]),
        needs: z.array(z.never()).default([]),
        dependsOn: z
          .array(position)
          .transform((): number[] => [])
          .default([]),
      }),
    )
    .max(MAX_ITEMS)
    .default([]),
  risks: z
    .array(z.object({ text, sources: ids }))
    .max(MAX_LIST)
    .default([]),
  technical: technical.default({ integrations: [], security: [], targets: [], environments: [] }),
});

/** The draft of the answer, or undefined when no JSON object of the answer reads as a plan. */
// RF-601
export function parsePlanAnswer(output: string): PlanDraft | undefined {
  for (const value of searchJson(output.slice(0, cardLimits.maxOutputChars)).values) {
    const parsed = answer.safeParse(value);
    if (parsed.success) return parsed.data;
  }
  return undefined;
}
