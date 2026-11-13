import { z } from 'zod';
import { CARD_TYPES } from '../../../domain/cards/card-vocabulary.js';
import { parseCitation, type Citation } from '../../../domain/cards/citation.js';
import type { StackLayer } from '../../../domain/planning/planning-brief.js';
import type { SourceCard } from '../../../domain/planning/plan-sources.js';

// RF-1401, RF-1406: the parts of a plan document case the targets share. A case holds the cards and
// the owner's answers as the data blocks of the run showed them (citations as `path:a-b` text), and
// each target turns them back into what the run's own message builder takes.

const text = (max: number) => z.string().max(max);

export const citationShape = z
  .string()
  .max(400)
  .refine((value) => parseCitation(value).ok, 'must be path:startLine-endLine');
const claimShape = z.strictObject({
  claimId: text(100),
  text: text(2000),
  citations: z.array(citationShape).max(20),
});

/** A card of the planner's cards block, without its type (the target knows it). */
export const plainCardShape = z.strictObject({
  id: text(100),
  title: text(300),
  summary: text(2000),
  claims: z.array(claimShape).max(50),
});
export const cardShape = plainCardShape.extend({ type: z.enum(CARD_TYPES) });

type PlainCard = z.infer<typeof plainCardShape>;

export const nullableText = text(300).nullable();

function citationsOf(values: readonly string[]): Citation[] {
  return values.flatMap((value) => {
    const parsed = parseCitation(value);
    return parsed.ok ? [parsed.value] : [];
  });
}

/** The card as the run's builders read it: every claim `Supported`, as the planner only sees those. */
export function sourceCardOf(
  card: PlainCard,
  type: SourceCard['type'],
  extra: Partial<SourceCard> = {},
): SourceCard {
  return {
    ...{ id: card.id, type, title: card.title, summary: card.summary, area: '' },
    claims: card.claims.map((claim) => ({
      ...{ claimId: claim.claimId, text: claim.text, status: 'Supported' as const },
      citations: citationsOf(claim.citations),
    })),
    ...extra,
  };
}

/** A card the message names by id and title only. */
export function bareCardOf(card: { id: string; title: string; summary?: string }): SourceCard {
  return sourceCardOf({ ...card, summary: card.summary ?? '', claims: [] }, 'ENT');
}

/** The brief of the run reduced to the layers a message reads; a layer left null is absent. */
export function stackOf(
  layers: readonly (readonly [StackLayer, string | null])[],
): { layer: StackLayer; choice: string; custom: boolean }[] {
  return layers.flatMap(([layer, choice]) =>
    choice === null ? [] : [{ layer, choice, custom: false }],
  );
}
