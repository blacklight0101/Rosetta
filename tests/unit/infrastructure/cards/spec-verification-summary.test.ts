import { describe, expect, it } from 'vitest';
import { transitionClaim, type Card } from '../../../../src/domain/cards/card.js';
import type { ClaimStatus } from '../../../../src/domain/cards/card-vocabulary.js';
import { cardsOf, fileOf, writeCards } from '../../../support/card-output-harness.js';

// RF-303, ADR-005, data-model 3.8: spec.md opens with the verification summary, claims per status
// per area and the overall supported share, so a reader judges the run before reading the cards.

const verdict = {
  step: 'judgement',
  reason: 'The lines decide it.',
  model: 'fake-model',
  at: '2026-10-12T10:00:00.000Z',
} as const;

/** The cards of the two-area fixture with the given cards' only claim moved to a status. */
function judged(moves: Readonly<Record<string, Exclude<ClaimStatus, 'Proposed'>>>): Card[] {
  return cardsOf().map((card) => {
    const to = moves[card.id];
    if (to === undefined) return card;
    const moved = transitionClaim(card, `${card.id}.c1`, to, verdict);
    if (!moved.ok) throw new Error(`fixture: ${card.id}`);
    return moved.value;
  });
}

const mixed = judged({
  'FEAT-001': 'Supported',
  'BR-001': 'Rejected',
  'FEAT-002': 'Unverified',
  'ENT-001': 'Supported',
});

const summary = `## Verification summary

Supported share: 2 of 7 claims (28.6%).

| Area | Proposed | CitationInvalid | Supported | Rejected | Unverified | Total | Supported share |
|---|---|---|---|---|---|---|---|
| orders | 1 | 0 | 1 | 1 | 1 | 4 | 25.0% |
| catalog | 2 | 0 | 1 | 0 | 0 | 3 | 33.3% |
| All areas | 3 | 0 | 2 | 1 | 1 | 7 | 28.6% |
`;

describe('spec.md verification summary', () => {
  it('RF-303 shows claims per status per area and the overall supported share (snapshot)', async () => {
    const { writer } = await writeCards(mixed);

    expect(fileOf(writer, 'spec.md')).toContain(`# Specification\n\n${summary}\n## Area: orders`);
  });

  it('RF-303 counts a rejected claim in the summary and keeps it in the area section', async () => {
    const { writer } = await writeCards(mixed);
    const spec = fileOf(writer, 'spec.md');

    expect(spec).toContain('| orders | 1 | 0 | 1 | 1 | 1 | 4 | 25.0% |');
    expect(spec).toContain('BR-001.c1 [Rejected]');
  });

  it('RF-303 writes the same bytes for the same cards', async () => {
    const first = await writeCards(mixed);
    const second = await writeCards(mixed);

    expect(fileOf(second.writer, 'spec.md')).toBe(fileOf(first.writer, 'spec.md'));
  });

  it('RF-303 writes the area names as text, never as markup', async () => {
    const [first, ...rest] = mixed;
    if (first === undefined) throw new Error('fixture');
    const { writer } = await writeCards([{ ...first, area: '<b>x</b>|y' }, ...rest]);

    expect(fileOf(writer, 'spec.md')).not.toContain('| <b>x</b>|y |');
  });
});
