import type { z } from 'zod';
import type { CardDraft } from '../../domain/cards/card-ids.js';
import { agentCardSchema, agentClaimSchema } from './card-schema.js';
import { fillOptionalObjects } from './optional-objects.js';
import type { OutputProblem } from './output-problem.js';

// RF-208, ADR-005: reads one card of an answer without losing what is valid in it. A card with a
// claim that does not validate keeps its other claims; the invalid claims are dropped and listed
// with their problems. A card with no valid claim left, or with any other field wrong, is dropped
// and listed whole. A fully valid card is read exactly as the strict schema reads it.

interface ReadCard {
  readonly draft?: CardDraft;
  /** Why claims or the whole card were dropped; empty for a valid card. */
  readonly problems: readonly OutputProblem[];
}

function located(error: z.ZodError, prefix: string): OutputProblem[] {
  return error.issues.map((issue) => ({
    path: [prefix, ...issue.path.map(String)].filter((part) => part !== '').join('.'),
    message: issue.message,
  }));
}

function claimsOf(item: unknown): readonly unknown[] | undefined {
  if (typeof item !== 'object' || item === null || !('claims' in item)) return undefined;
  return Array.isArray(item.claims) ? item.claims : undefined;
}

function withClaims(item: object, claims: readonly unknown[]): object {
  return { ...item, claims };
}

// RF-208
export function readCard(original: unknown, index: number): ReadCard {
  // P5-14: slips the schema lets be repaired locally are repaired before the card is checked.
  const item = fillOptionalObjects(original);
  const prefix = `cards.${String(index)}`;
  const whole = agentCardSchema.safeParse(item);
  if (whole.success) return { draft: whole.data, problems: [] };
  const claims = claimsOf(item);
  if (typeof item !== 'object' || item === null || claims === undefined) {
    return { problems: located(whole.error, prefix) };
  }
  const kept: unknown[] = [];
  const dropped: OutputProblem[] = [];
  claims.forEach((claim, position) => {
    const checked = agentClaimSchema.safeParse(claim);
    if (checked.success) kept.push(claim);
    else dropped.push(...located(checked.error, `${prefix}.claims.${String(position)}`));
  });
  const again = agentCardSchema.safeParse(withClaims(item, kept));
  if (!again.success) return { problems: located(whole.error, prefix) };
  return { draft: again.data, problems: dropped };
}
