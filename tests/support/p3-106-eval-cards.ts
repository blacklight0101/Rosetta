import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Card } from '../../src/domain/cards/card.js';
import { CARD_TYPES, CLAIM_STATUSES, CONFIDENCES } from '../../src/domain/cards/card-vocabulary.js';
import { z } from 'zod';
import { parseCitation } from '../../src/domain/cards/citation.js';

// P3-106, EV-05, EV-06: the card sets of two Deepen runs of the 2026-10-22 evaluation (public test
// workbooks: Asset Manager and Invoice Generator, local Ollama), trimmed to what consolidation
// reads: titles, claim texts, citations and statuses. They are the cards as those runs wrote them,
// so they still hold the duplicates the evaluation found.

const storedCards = z.array(
  z.object({
    id: z.string(),
    type: z.enum(CARD_TYPES),
    title: z.string(),
    area: z.string(),
    agentTaskId: z.string(),
    confidence: z.enum(CONFIDENCES),
    claims: z.array(
      z.object({
        text: z.string(),
        citations: z.array(z.string()),
        status: z.enum(CLAIM_STATUSES),
      }),
    ),
    question: z.string().optional(),
    whyItMatters: z.string().optional(),
    flow: z.object({ trigger: z.string(), outcome: z.string() }).optional(),
  }),
);
type StoredCard = z.infer<typeof storedCards>[number];

export type EvalRun = 'asset-manager' | 'invoice' | 'invoice-2' | 'eshop-2';

const files: Record<EvalRun, string> = {
  'asset-manager': 'p3-106-asset-manager-deepen.json',
  invoice: 'p3-106-invoice-deepen.json',
  // P3-110, EV-25, EV-26: pass 2 of the evaluation (2026-10-23), public projects only.
  'invoice-2': 'p3-110-invoice-deepen2.json',
  'eshop-2': 'p3-110-eshop-deepen2.json',
};

function cardOf(stored: StoredCard): Card {
  const { claims, question, whyItMatters, flow, ...rest } = stored;
  return {
    ...rest,
    ...(question === undefined ? {} : { question }),
    ...(whyItMatters === undefined ? {} : { whyItMatters }),
    ...(flow === undefined ? {} : { flow }),
    summary: '',
    claims: claims.map((claim, index) => ({
      claimId: `${stored.id}.c${String(index + 1)}`,
      text: claim.text,
      status: claim.status,
      citations: claim.citations.map((text) => {
        const parsed = parseCitation(text);
        if (!parsed.ok) throw new Error(`The fixture citation ${text} is invalid.`);
        return parsed.value;
      }),
    })),
  };
}

export async function evalCards(run: EvalRun): Promise<readonly Card[]> {
  const text = await readFile(join('tests', 'fixtures', 'eval', files[run]), 'utf8');
  return storedCards.parse(JSON.parse(text)).map(cardOf);
}

export function claimCount(cards: readonly Card[]): number {
  return cards.reduce((sum, card) => sum + card.claims.length, 0);
}

/** The distinct texts of the `Supported` claims. */
export function supportedTexts(cards: readonly Card[]): ReadonlySet<string> {
  return new Set(
    cards.flatMap((card) =>
      card.claims.filter((claim) => claim.status === 'Supported').map((claim) => claim.text),
    ),
  );
}
