import { describe, expect, it } from 'vitest';
import type { CardDraft, TaskCards } from '../../../../src/domain/cards/card-ids.js';
import { withoutBookkeepingClaims } from '../../../../src/application/cards/bookkeeping-claims.js';
import { evalCards } from '../../../support/p3-106-eval-cards.js';

// P3-110, RF-230, RF-300, EV-26: a claim that restates card ids, or cites a token that is no file
// name at all (the tag of the existing-card block), is bookkeeping, not evidence: it is dropped
// before the citation check and counted. A claim with a real file stays, and so does a claim whose
// path is only wrong (the citation check marks that one, RF-300).

const files: ReadonlySet<string> = new Set(['src/a.cs', 'Makefile']);

function draftOf(claims: readonly { text: string; path: string }[]): CardDraft {
  return {
    ...{ type: 'ENT', title: 'Invoice', summary: 's', area: 'a', confidence: 'High' as const },
    claims: claims.map(({ text, path }) => ({
      text,
      citations: [{ path, startLine: 1, endLine: 2 }],
    })),
  };
}

function taskOf(...drafts: CardDraft[]): TaskCards {
  return { agentTaskId: 'reader-001', area: 'a', drafts };
}

function texts(task: TaskCards): string[] {
  return task.drafts.flatMap((draft) => draft.claims.map((claim) => claim.text));
}

describe('P3-110 withoutBookkeepingClaims', () => {
  it('EV-26 a claim that names a card id and cites no file of the code map is dropped and counted', () => {
    const task = taskOf(
      draftOf([
        { text: 'The entity is also listed with ID ENT-004.', path: 'ink37onmrxc3jvnnmanqeev2' },
        { text: 'Invoice has a total.', path: 'src/a.cs' },
      ]),
    );

    const result = withoutBookkeepingClaims(task, files);

    expect(texts(result.task)).toEqual(['Invoice has a total.']);
    expect(result.dropped).toBe(1);
  });

  it('EV-26 a claim that names a card id and cites a path the code map does not list is dropped', () => {
    const task = taskOf(
      draftOf([{ text: 'The entity is listed with ID ENT-004.', path: 'docs/cards.md' }]),
    );

    expect(withoutBookkeepingClaims(task, files).dropped).toBe(1);
  });

  it('EV-26 a claim that cites only a token that cannot be a file name is dropped', () => {
    const task = taskOf(
      draftOf([
        {
          text: 'The system contains an entity for Invoice Records.',
          path: 'ink37onmrxc3jvnnmanqeev2',
        },
        { text: 'Invoice has a total.', path: 'src/a.cs' },
      ]),
    );

    expect(texts(withoutBookkeepingClaims(task, files).task)).toEqual(['Invoice has a total.']);
  });
});

describe('P3-110 withoutBookkeepingClaims keeps evidence', () => {
  it('RF-300 a claim with a card id in its text that cites a real file stays', () => {
    const task = taskOf(draftOf([{ text: 'The code comment says BR-001.', path: 'src/a.cs' }]));

    const result = withoutBookkeepingClaims(task, files);

    expect(texts(result.task)).toHaveLength(1);
    expect(result.dropped).toBe(0);
  });

  it('RF-300 a claim that cites a dotless file of the code map stays', () => {
    const task = taskOf(draftOf([{ text: 'The build runs make.', path: 'Makefile' }]));

    expect(withoutBookkeepingClaims(task, files).dropped).toBe(0);
  });

  it('RF-300 a claim with a wrong file path stays, for the citation check to mark', () => {
    const task = taskOf(draftOf([{ text: 'Logging is rolling.', path: 'log4Net.xml' }]));

    const result = withoutBookkeepingClaims(task, files);

    expect(texts(result.task)).toHaveLength(1);
    expect(result.dropped).toBe(0);
  });

  it('EV-26 a card left with no claim is dropped', () => {
    const task = taskOf(
      draftOf([{ text: 'Listed with ID ENT-004.', path: 'ink37onmrxc3jvnnmanqeev2' }]),
      draftOf([{ text: 'Invoice has a total.', path: 'src/a.cs' }]),
    );

    const result = withoutBookkeepingClaims(task, files);

    expect(result.task.drafts).toHaveLength(1);
    expect(result.dropped).toBe(1);
  });
});

describe('P3-110 the Invoice pass 2 card set', () => {
  it('EV-26 the ten bookkeeping claims go and every other claim stays', async () => {
    const cards = await evalCards('invoice-2');
    const known = new Set(
      cards.flatMap((card) =>
        card.claims
          .filter((claim) => claim.status === 'Supported')
          .flatMap((claim) => claim.citations.map((citation) => citation.path)),
      ),
    );
    const drafts: CardDraft[] = cards.map((card) => ({
      ...{ type: card.type, title: card.title, summary: '', area: card.area },
      confidence: card.confidence,
      claims: card.claims.map(({ text, citations }) => ({ text, citations })),
    }));

    const result = withoutBookkeepingClaims({ agentTaskId: 'all', area: 'all', drafts }, known);

    const before = drafts.flatMap((draft) => draft.claims).length;
    const after = result.task.drafts.flatMap((draft) => draft.claims).length;
    expect(result.dropped).toBe(10);
    expect(after).toBe(before - 10);
  });
});
