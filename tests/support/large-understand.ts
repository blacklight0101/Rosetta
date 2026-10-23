import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { judgedCard } from './plan-cards.js';
import type { Card, CardInput } from '../../src/domain/cards/card.js';
import type { CardType } from '../../src/domain/cards/card-vocabulary.js';
import type { SourceCard } from '../../src/domain/planning/plan-sources.js';

// P3-113, EV-29: the cards of a large understand (371 supported cards over 67 areas, about 140,000
// tokens as the planner is shown them) made from the recorded shape of a real run: the lengths of
// its texts, not the texts (tests/fixtures/planner/large-understand-shape.json). `FLOW`, `SCRN` and
// `OQ` cards, which carry detail blocks the packing does not look at, stand as `FEAT` cards.

const shapeSchema = z.object({
  areas: z.array(z.string()),
  cards: z.array(
    z.tuple([
      z.string(),
      z.number(),
      z.number(),
      z.number(),
      z.array(z.tuple([z.number(), z.number()])),
    ]),
  ),
});

const words = ['order', 'basket', 'catalog', 'brand', 'item', 'stock', 'price', 'config', 'route'];

/** Filler of exactly `chars` characters, the same for the same seed. */
function filler(seed: number, chars: number): string {
  let text = `n${String(seed)} `;
  for (let at = 0; text.length < chars; at += 1) {
    text += `${words[(seed * 7 + at * 3) % words.length] ?? 'order'} `;
  }
  return text.slice(0, chars).trimEnd().padEnd(chars, 'x');
}

const shape = shapeSchema.parse(
  JSON.parse(
    await readFile(join('tests', 'fixtures', 'planner', 'large-understand-shape.json'), 'utf8'),
  ),
);

const plain = new Set<string>(['BR', 'ENT', 'FEAT', 'INT']);

function typeOf(recorded: string): CardType {
  return plain.has(recorded) ? (recorded as CardType) : 'FEAT';
}

/** The inputs of the cards, numbered per type as a run numbers them. */
export function largeCardInputs(): CardInput[] {
  const { areas, cards } = shape;
  const counts = new Map<CardType, number>();
  return cards.map(([recorded, area, titleChars, summaryChars, claims], index) => {
    const type = typeOf(recorded);
    const number = (counts.get(type) ?? 0) + 1;
    counts.set(type, number);
    const id = `${type}-${String(number).padStart(3, '0')}`;
    const path = `src/${areas[area] ?? 'root'}/File${String(index)}.cs`;
    return {
      ...{ id, type, area: areas[area] ?? '(root)', agentTaskId: `task-${String(area)}` },
      title: filler(index, titleChars),
      summary: filler(index + 1, summaryChars),
      confidence: 'High',
      claims: claims.map(([chars, citations], claimIndex) => ({
        text: filler(index * 31 + claimIndex, chars),
        citations: Array.from({ length: citations }, (_unused, at) => ({
          path,
          startLine: 10 + at * 20,
          endLine: 24 + at * 20,
        })),
      })),
    };
  });
}

/** The cards, every claim `Supported`, as an understand run leaves them. */
export function largeCards(): Card[] {
  return largeCardInputs().map((input) =>
    judgedCard(
      input,
      input.claims.map(() => 'Supported'),
    ),
  );
}

/** The same cards as the plan reads them (`supportedCards` of the run's cards). */
export function largeSourceCards(): SourceCard[] {
  return largeCards().map(({ id, type, title, summary, area, claims }) => ({
    ...{ id, type, title, summary, area },
    claims: claims.map(({ claimId, text, citations, status }) => ({
      ...{ claimId, text, citations, status },
    })),
  }));
}
