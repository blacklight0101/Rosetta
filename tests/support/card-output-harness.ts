import { transitionClaim, type Card } from '../../src/domain/cards/card.js';
import { assignCardIds, type TaskCards } from '../../src/domain/cards/card-ids.js';
import type { WriteRefusal } from '../../src/application/ports/output-writer.js';
import type { Result } from '../../src/domain/errors/result.js';
import { SecretMasker, type TextMasker } from '../../src/infrastructure/guards/secret-masker.js';
import { writeCardOutputs } from '../../src/infrastructure/cards/write-card-outputs.js';
import { cardSource, twoAreas } from './card-fixtures.js';
import { MemoryOutputWriter } from './memory-output-writer.js';

export const cardTarget = { userId: 'u1', folder: 'projects/p/runs/20261012-100000-understand' };

const verdict = {
  step: 'judgement',
  reason: 'The lines show a different rule.',
  model: 'fake-model',
  at: '2026-10-12T10:00:00.000Z',
} as const;

/** Cards with ids, as `understand` would hold them. */
export function cardsOf(tasks: readonly TaskCards[] = twoAreas()): readonly Card[] {
  const cards = assignCardIds(tasks);
  if (!cards.ok) throw new Error('fixture');
  return cards.value;
}

/** The first card with its first claim rejected, followed by the others. */
export function withRejectedFirstClaim(cards: readonly Card[]): readonly Card[] {
  const [first, ...rest] = cards;
  if (first === undefined) throw new Error('fixture');
  const rejected = transitionClaim(first, `${first.id}.c1`, 'Rejected', verdict);
  if (!rejected.ok) throw new Error('fixture');
  return [rejected.value, ...rest];
}

export async function writeCards(
  cards: readonly Card[],
  masker: TextMasker = new SecretMasker(),
): Promise<{ writer: MemoryOutputWriter; result: Result<void, WriteRefusal> }> {
  const writer = new MemoryOutputWriter();
  const result = await writeCardOutputs(writer, cardTarget, { cards, source: cardSource, masker });
  return { writer, result };
}

/** A file the writer produced, by path relative to the run folder. */
export function fileOf(writer: MemoryOutputWriter, path: string): string {
  return writer.files.get(`${cardTarget.folder}/${path}`) ?? '';
}
