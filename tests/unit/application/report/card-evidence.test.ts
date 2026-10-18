import { describe, expect, it } from 'vitest';
import { addEvidence, type CardFile } from '../../../../src/application/report/card-evidence.js';
import type { RepositoryReader } from '../../../../src/application/ports/repository-reader.js';
import { err } from '../../../../src/domain/errors/result.js';
import { refusal } from '../../../../src/infrastructure/files/read-refusals.js';
import { MemoryRepositoryReader } from '../../../support/memory-repository-reader.js';

// RF-502, RF-301, ADR-013: the cited lines of every claim, with three lines of context before and
// after, read through the reader of the scan, and a reason in place of the lines when they cannot be
// shown.

const numbered = (count: number): string =>
  Array.from({ length: count }, (_, index) => `line ${String(index + 1)}`).join('\n');

function cardOf(...citations: readonly [string, number, number][]): CardFile {
  return {
    id: 'BR-001',
    type: 'BR',
    title: 'A rule',
    summary: 'A rule.',
    area: 'orders',
    confidence: 'High',
    claims: [
      {
        claimId: 'BR-001.c1',
        text: 'A claim.',
        status: 'Supported',
        reason: 'It holds.',
        citations: citations.map(([path, startLine, endLine]) => ({ path, startLine, endLine })),
      },
    ],
  };
}

async function excerptsOf(card: CardFile, reader: Pick<RepositoryReader, 'readLines'> | undefined) {
  const [detail] = await addEvidence([card], reader);
  return (detail?.claims[0]?.citations ?? []).map((citation) => citation.excerpt);
}

describe('addEvidence', () => {
  it('RF-502 reads the cited lines with three lines of context on each side', async () => {
    const reader = new MemoryRepositoryReader({ 'a.cs': numbered(30) });

    const [excerpt] = await excerptsOf(cardOf(['a.cs', 10, 12]), reader);

    expect(excerpt).toEqual({
      kind: 'lines',
      firstLine: 7,
      lines: [
        'line 7',
        'line 8',
        'line 9',
        'line 10',
        'line 11',
        'line 12',
        'line 13',
        'line 14',
        'line 15',
      ],
    });
  });

  it('RF-502 starts at the first line of the file and stops at its last line', async () => {
    const reader = new MemoryRepositoryReader({ 'a.cs': numbered(5) });

    const [first, last] = await excerptsOf(cardOf(['a.cs', 1, 2], ['a.cs', 4, 5]), reader);

    expect(first).toMatchObject({ kind: 'lines', firstLine: 1 });
    expect(first?.kind === 'lines' ? first.lines : []).toHaveLength(5);
    expect(last).toMatchObject({ kind: 'lines', firstLine: 1 });
  });
});

describe('addEvidence and the fields of a card', () => {
  it('RF-502 keeps the claim, its status and its reason with the lines of its citations', async () => {
    const reader = new MemoryRepositoryReader({ 'a.cs': numbered(30) });

    const [detail] = await addEvidence([cardOf(['a.cs', 10, 12])], reader);

    expect(detail?.claims).toMatchObject([
      {
        claimId: 'BR-001.c1',
        text: 'A claim.',
        status: 'Supported',
        reason: 'It holds.',
        citations: [{ path: 'a.cs', startLine: 10, endLine: 12 }],
      },
    ]);
  });

  it('RF-502 gives the reason of the reader when the file is refused, such as an ignored or secret file', async () => {
    const reader: Pick<RepositoryReader, 'readLines'> = {
      readLines: () => Promise.resolve(err(refusal('denied'))),
    };

    const [excerpt] = await excerptsOf(cardOf(['.env', 1, 1]), reader);

    expect(excerpt).toMatchObject({ kind: 'unavailable' });
    expect(excerpt?.kind === 'unavailable' ? excerpt.reason : '').toContain('never read or sent');
  });

  it('RF-502 says so when the file is not in the snapshot', async () => {
    const reader = new MemoryRepositoryReader({});

    const [excerpt] = await excerptsOf(cardOf(['gone.cs', 1, 1]), reader);

    expect(excerpt).toMatchObject({ kind: 'unavailable' });
  });

  it('RF-502 says so when the snapshot of the scan is gone', async () => {
    const [excerpt] = await excerptsOf(cardOf(['a.cs', 1, 1]), undefined);

    expect(excerpt).toEqual({
      kind: 'unavailable',
      reason: 'The snapshot of the scan is not available, so the lines are not shown.',
    });
  });
});

describe('addEvidence and the limits', () => {
  it('RF-502 shows no lines for a citation too long to show, and reads nothing for it', async () => {
    const reader = new MemoryRepositoryReader({ 'a.cs': numbered(2000) });

    const [excerpt] = await excerptsOf(cardOf(['a.cs', 1, 1500]), reader);

    expect(excerpt).toMatchObject({ kind: 'unavailable' });
    expect(reader.reads).toEqual([]);
  });

  it('RF-507 cuts a line that is too long to show whole', async () => {
    const reader = new MemoryRepositoryReader({ 'a.cs': `${'x'.repeat(5000)}\nshort` });

    const [excerpt] = await excerptsOf(cardOf(['a.cs', 1, 2]), reader);

    expect(excerpt?.kind === 'lines' ? excerpt.lines[0]?.length : 0).toBe(2000);
  });

  it('RF-502 reads a range once however many claims cite it', async () => {
    const reader = new MemoryRepositoryReader({ 'a.cs': numbered(30) });
    const [claim] = cardOf(['a.cs', 10, 12]).claims;
    const card = {
      ...cardOf(['a.cs', 10, 12]),
      claims: claim === undefined ? [] : [claim, { ...claim, claimId: 'BR-001.c2' }],
    };

    await addEvidence([card], reader);

    expect(reader.reads).toEqual(['a.cs']);
  });

  it('RF-502 keeps the cards in order and leaves the fields of the card as they are', async () => {
    const reader = new MemoryRepositoryReader({ 'a.cs': numbered(30) });
    const second = { ...cardOf(['a.cs', 1, 1]), id: 'BR-002', note: 'read with care' };

    const details = await addEvidence([cardOf(['a.cs', 1, 1]), second], reader);

    expect(details.map((each) => each.id)).toEqual(['BR-001', 'BR-002']);
    expect(details[1]).toMatchObject({
      note: 'read with care',
      area: 'orders',
      confidence: 'High',
    });
  });
});
