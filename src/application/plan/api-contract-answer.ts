import { z } from 'zod';
import type { ApiDraft, DraftOperation } from '../../domain/planning/api-contract.js';
import { cardLimits } from '../cards/card-limits.js';
import { searchJson } from '../cards/extract-json.js';

// RF-624, ADR-013: the planner's API answer is untrusted text. It is read as one JSON object (fenced
// or inside prose, like the other planner answers) with every list and text bounded; which cards,
// names, paths and methods are allowed is decided by the domain (api-contract-assembly.ts), not here.
// An operation that does not read is left out and the others are kept; an object that says neither
// whether a contract applies nor lists operations is no answer.

const MAX_OPERATIONS = 300;
const MAX_LIST = 50;
const NAME = 200;
const TEXT = 2000;

const operation = z.object({
  operationId: z.string().max(NAME),
  method: z.string().max(NAME),
  path: z.string().max(NAME),
  summary: z.string().trim().max(TEXT).default(''),
  serves: z.array(z.string().max(NAME)).max(MAX_LIST),
  public: z.boolean().default(false),
  entity: z.string().max(NAME).nullable().default(null),
  list: z.boolean().default(false),
  errors: z.array(z.number().int()).max(MAX_LIST).default([]),
});

const notServed = z.object({ card: z.string().max(NAME), reason: z.string().trim().max(TEXT) });

const answer = z.object({
  applies: z.boolean().optional(),
  reason: z.string().trim().max(TEXT).catch(''),
  operations: z.array(z.unknown()).optional(),
  notServed: z.array(z.unknown()).default([]),
});

function readable<T>(schema: z.ZodType<T>, items: readonly unknown[]): T[] {
  return items.flatMap((item) => {
    const parsed = schema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

function draftOf(value: unknown): ApiDraft | undefined {
  const parsed = answer.safeParse(value);
  if (!parsed.success) return undefined;
  const { applies, reason, operations } = parsed.data;
  if (applies === undefined && operations === undefined) return undefined;
  const kept: DraftOperation[] = readable(operation, operations ?? []).slice(0, MAX_OPERATIONS);
  return {
    applies: applies ?? true,
    reason,
    operations: kept,
    notServed: readable(notServed, parsed.data.notServed).slice(0, MAX_LIST),
  };
}

/** The draft of the answer, or undefined when no JSON object of the answer reads as an API contract. */
// RF-624
export function parseApiContractAnswer(output: string): ApiDraft | undefined {
  for (const value of searchJson(output.slice(0, cardLimits.maxOutputChars)).values) {
    const draft = draftOf(value);
    if (draft !== undefined) return draft;
  }
  return undefined;
}
