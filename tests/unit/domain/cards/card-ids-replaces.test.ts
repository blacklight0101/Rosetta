import { describe, expect, it } from 'vitest';
import { assignCardIds, type TaskCards } from '../../../../src/domain/cards/card-ids.js';
import { draftOf } from '../../../support/card-fixtures.js';

// RF-209, RF-302: a claim records the rejected claim it replaces only when its task was given that
// claim to re-read; any other `replaces` a model writes is dropped and the claim is kept.

const cite = [{ path: 'src/a.cs', startLine: 1, endLine: 2 }];

function task(replaces: string, replaceable?: readonly string[]): TaskCards {
  const draft = draftOf({ type: 'BR', claims: [{ text: 'A fact.', citations: cite, replaces }] });
  return {
    agentTaskId: 'reader-004',
    area: 'orders',
    drafts: [draft],
    ...(replaceable === undefined ? {} : { replaceable }),
  };
}

function claimsOf(tasks: readonly TaskCards[]) {
  const cards = assignCardIds(tasks);
  return cards.ok ? cards.value.flatMap((card) => card.claims) : [];
}

describe('assignCardIds replaces', () => {
  it('RF-209 records the id of the rejected claim the task was given', () => {
    expect(claimsOf([task('BR-001.c2', ['BR-001.c2'])])[0]?.replaces).toBe('BR-001.c2');
  });

  it('RF-209 drops a replaces that names a claim the task was not given, and keeps the claim', () => {
    const [claim] = claimsOf([task('BR-007.c1', ['BR-001.c2'])]);

    expect(claim?.text).toBe('A fact.');
    expect(claim).not.toHaveProperty('replaces');
  });

  it('RF-209 drops every replaces written by a task that was given no rejected claim', () => {
    expect(claimsOf([task('BR-001.c2')])[0]).not.toHaveProperty('replaces');
  });
});
